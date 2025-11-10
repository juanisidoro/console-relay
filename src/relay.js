const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

function parseSince(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }

    const ts = Date.parse(value);
    if (!Number.isNaN(ts)) {
      return ts;
    }
  }

  return null;
}

function ensureDir(dir) {
  return fs.promises.mkdir(dir, { recursive: true });
}

class Relay extends EventEmitter {
  constructor({ size = 2000, persistDir = null } = {}) {
    super();
    this.size = size;
    this.buffer = [];
    this.persistDir = persistDir ? path.resolve(persistDir) : null;
    this.totalReceived = 0;
    this.lastPersistDay = null;
    this.persistStream = null;
    this.closed = false;

    if (this.persistDir) {
      ensureDir(this.persistDir).catch((err) => {
        this.emit('error', err);
      });
    }
  }

  async close() {
    this.closed = true;
    if (this.persistStream) {
      await new Promise((resolve) => {
        this.persistStream.end(resolve);
      });
    }
  }

  getStats() {
    const first = this.buffer[0];
    const last = this.buffer[this.buffer.length - 1];
    return {
      size: this.buffer.length,
      capacity: this.size,
      totalReceived: this.totalReceived,
      oldestTs: first ? first.ts : null,
      newestTs: last ? last.ts : null,
      persistDir: this.persistDir,
    };
  }

  add(entry) {
    if (!entry) {
      return;
    }

    this.totalReceived += 1;
    this.buffer.push(entry);
    if (this.buffer.length > this.size) {
      this.buffer.shift();
    }

    this.emit('log', entry);

    if (this.persistDir) {
      this.writePersist(entry);
    }
  }

  async writePersist(entry) {
    const day = entry.ts.slice(0, 10);

    try {
      if (day !== this.lastPersistDay) {
        await ensureDir(this.persistDir);
        if (this.persistStream) {
          await new Promise((resolve) => this.persistStream.end(resolve));
        }
        const filePath = path.join(this.persistDir, `${day}.ndjson`);
        this.persistStream = fs.createWriteStream(filePath, { flags: 'a' });
        this.lastPersistDay = day;
      }

      if (this.persistStream && !this.persistStream.destroyed) {
        this.persistStream.write(`${JSON.stringify(entry)}\n`);
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  query({ n, level, match, since } = {}) {
    const sinceTs = parseSince(since);
    const regex = match ? new RegExp(match, 'i') : null;
    const levelSet = level ? new Set(String(level).split(',').map((l) => l.trim()).filter(Boolean)) : null;

    const filtered = [];

    for (let i = this.buffer.length - 1; i >= 0; i -= 1) {
      const entry = this.buffer[i];
      if (levelSet && !levelSet.has(entry.level)) {
        continue;
      }
      if (regex && !regex.test(entry.text || '')) {
        continue;
      }
      if (sinceTs && Date.parse(entry.ts) < sinceTs) {
        continue;
      }
      filtered.push(entry);
      if (n && filtered.length >= n) {
        break;
      }
    }

    return filtered.reverse();
  }
}

module.exports = Relay;
