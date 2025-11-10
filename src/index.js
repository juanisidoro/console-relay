const Relay = require('./relay');
const { createHttpServer } = require('./http');
const { CDPRelay } = require('./cdp');
const { launchChrome, stopChrome } = require('./launcher');

function createLogger({ quiet = false } = {}) {
  if (quiet) {
    return {
      info: () => {},
      warn: () => {},
      error: console.error.bind(console),
    };
  }
  return {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  };
}

async function start(options = {}) {
  const {
    open,
    match,
    port = 7070,
    host = '127.0.0.1',
    persist,
    token,
    headless = false,
    bufferSize = 2000,
    remotePort,
    quiet = false,
  } = options;

  const logger = createLogger({ quiet });
  const relay = new Relay({ size: bufferSize, persistDir: persist });
  const status = {
    connected: false,
    target: null,
    browserVersion: null,
  };

  let chromeInstance = null;
  let cdpPort = Number(remotePort) || 0;

  if (open) {
    chromeInstance = await launchChrome({ url: open, port: cdpPort || undefined, headless, logger });
    cdpPort = chromeInstance.port;
  }

  if (!cdpPort) {
    cdpPort = 9222;
  }

  const cdpRelay = new CDPRelay({ host: '127.0.0.1', port: cdpPort, match, logger });

  cdpRelay.on('log', (entry) => relay.add(entry));
  cdpRelay.on('connected', (target) => {
    status.connected = true;
    status.target = target;
    status.browserVersion = cdpRelay.getStatus().browserVersion;
    logger.info(`[relay] streaming console from ${target.url}`);
  });
  cdpRelay.on('disconnected', () => {
    status.connected = false;
    status.target = null;
    logger.warn('[relay] target disconnected, waiting to reconnect...');
  });
  cdpRelay.on('error', (err) => {
    logger.warn('[cdp] error', err.message || err);
  });

  relay.on('error', (err) => {
    logger.warn('[relay] error', err.message || err);
  });

  const { server, start: startHttp } = createHttpServer({
    relay,
    host,
    port,
    token,
    statusProvider: () => ({
      ...status,
      host: '127.0.0.1',
      port: cdpPort,
    }),
  });

  await startHttp();
  logger.info(`[http] listening on http://${host}:${port}`);

  cdpRelay.start().catch((err) => {
    logger.error('[cdp] fatal error', err);
    process.exitCode = 1;
  });

  const shutdown = async () => {
    if (shutdown.called) {
      return;
    }
    shutdown.called = true;
    logger.info('\n[core] shutting down...');
    await relay.close();
    await cdpRelay.close();
    await new Promise((resolve) => server.close(resolve));
    if (chromeInstance) {
      await stopChrome(chromeInstance, logger);
    }
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return {
    relay,
    server,
    cdpRelay,
    chromeInstance,
    shutdown,
  };
}

module.exports = { start };
