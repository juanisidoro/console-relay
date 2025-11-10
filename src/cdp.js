const CDP = require('chrome-remote-interface');
const { EventEmitter } = require('events');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9222;
const RETRY_DELAY_MS = 1500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestampToIso(ts) {
  if (!ts && ts !== 0) {
    return new Date().toISOString();
  }
  const millis = ts > 1e12 ? ts : ts * 1000;
  return new Date(millis).toISOString();
}

function extractLocation(stackTrace) {
  if (!stackTrace || !Array.isArray(stackTrace.callFrames)) {
    return {};
  }
  const frame = stackTrace.callFrames[0];
  if (!frame) {
    return {};
  }
  return {
    url: frame.url || null,
    line: frame.lineNumber != null ? frame.lineNumber : null,
    col: frame.columnNumber != null ? frame.columnNumber : null,
  };
}

function stringifyRemoteObject(remoteObject) {
  if (!remoteObject) {
    return '';
  }
  if (Object.prototype.hasOwnProperty.call(remoteObject, 'value')) {
    return String(remoteObject.value);
  }
  if (Object.prototype.hasOwnProperty.call(remoteObject, 'unserializableValue')) {
    return String(remoteObject.unserializableValue);
  }
  if (remoteObject.description) {
    return remoteObject.description;
  }
  return '';
}

function formatConsoleEvent(params) {
  const text = params.args && params.args.length
    ? params.args.map(stringifyRemoteObject).join(' ')
    : params.text || '';

  const { url, line, col } = extractLocation(params.stackTrace);

  return {
    ts: timestampToIso(params.timestamp),
    kind: 'CONSOLE',
    level: params.type || 'log',
    text,
    url: url || params.url || null,
    line,
    col,
    href: params.executionContextDescription || null,
  };
}

function formatLogEntry(entry) {
  return {
    ts: timestampToIso(entry.timestamp || Date.now()),
    kind: 'LOG',
    level: entry.level || entry.severity || 'info',
    text: entry.text || entry.message || '',
    url: entry.url || null,
    line: entry.lineNumber != null ? entry.lineNumber : null,
    col: entry.columnNumber != null ? entry.columnNumber : null,
    href: entry.source || null,
  };
}

function findTarget(targets, match) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return null;
  }
  if (!match) {
    return targets.find((t) => t.type === 'page') || targets[0];
  }
  const matcher = match.toLowerCase();
  return targets.find((t) => t.url && t.url.toLowerCase().includes(matcher))
    || targets.find((t) => t.title && t.title.toLowerCase().includes(matcher))
    || targets[0];
}

class CDPRelay extends EventEmitter {
  constructor({ host = DEFAULT_HOST, port = DEFAULT_PORT, match, logger = console } = {}) {
    super();
    this.host = host;
    this.port = port;
    this.match = match;
    this.logger = logger;
    this.client = null;
    this.closed = false;
    this.currentTarget = null;
    this.browserVersion = null;
    this.started = false;
  }

  getStatus() {
    return {
      host: this.host,
      port: this.port,
      connected: Boolean(this.client),
      target: this.currentTarget,
      browserVersion: this.browserVersion,
    };
  }

  async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    while (!this.closed) {
      try {
        await this.connectOnce();
        await new Promise((resolve) => {
          if (!this.client) {
            resolve();
            return;
          }
          this.client.on('disconnect', resolve);
        });
        this.emit('disconnected');
        this.client = null;
        this.currentTarget = null;
      } catch (err) {
        this.emit('error', err);
        await delay(RETRY_DELAY_MS);
      }
      if (!this.closed) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  async connectOnce() {
    const targets = await CDP.List({ host: this.host, port: this.port });
    const target = findTarget(targets, this.match);
    if (!target) {
      throw new Error('No matching Chrome target found');
    }

    const version = await CDP.Version({ host: this.host, port: this.port }).catch(() => null);
    this.browserVersion = version ? version.Browser : null;

    this.currentTarget = {
      id: target.id,
      title: target.title,
      url: target.url,
      type: target.type,
    };

    this.client = await CDP({ host: this.host, port: this.port, target });
    const { Runtime, Log } = this.client;

    await Promise.all([Runtime.enable(), Log.enable()]);

    Runtime.consoleAPICalled((params) => {
      try {
        const entry = formatConsoleEvent(params);
        this.emit('log', entry);
      } catch (err) {
        this.emit('error', err);
      }
    });

    Log.entryAdded(({ entry }) => {
      try {
        const formatted = formatLogEntry(entry);
        this.emit('log', formatted);
      } catch (err) {
        this.emit('error', err);
      }
    });

    this.client.on('disconnect', () => {
      this.logger.info('[cdp] disconnected');
    });

    this.emit('connected', this.currentTarget);
    this.logger.info(`[cdp] connected to ${this.currentTarget.url}`);
  }

  async close() {
    this.closed = true;
    if (this.client) {
      try {
        await this.client.close();
      } catch (err) {
        this.emit('error', err);
      }
      this.client = null;
    }
  }
}

module.exports = {
  CDPRelay,
  timestampToIso,
  formatConsoleEvent,
  formatLogEntry,
};
