const express = require('express');
const http = require('http');

function createAuthMiddleware(token) {
  if (!token) {
    return (req, res, next) => next();
  }

  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const normalized = header.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : header.trim();
    if (!normalized) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (normalized !== token) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}

function createHttpServer({ relay, host = '127.0.0.1', port = 7070, token = null, statusProvider = () => ({}) }) {
  const app = express();
  app.disable('x-powered-by');

  app.use(createAuthMiddleware(token));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      relay: relay.getStats(),
      cdp: statusProvider(),
    });
  });

  app.get('/logs', (req, res) => {
    const { n, level, match, since } = req.query;
    const limit = n ? Number(n) : undefined;
    const logs = relay.query({
      n: Number.isFinite(limit) ? limit : undefined,
      level,
      match,
      since,
    });
    res.json(logs);
  });

  app.get('/logs/stream', (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (entry) => {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    };

    relay.on('log', send);

    req.on('close', () => {
      relay.off('log', send);
      res.end();
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  const server = http.createServer(app);

  function start() {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve(server);
      });
    });
  }

  function stop() {
    return new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  return { app, server, start, stop };
}

module.exports = { createHttpServer };
