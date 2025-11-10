#!/usr/bin/env node

const { hideBin } = require('yargs/helpers');
const yargs = require('yargs/yargs');
const { start } = require('../src/index');

async function main() {
  const argv = yargs(hideBin(process.argv))
    .scriptName('console-relay')
    .usage('$0 [options]')
    .option('open', {
      type: 'string',
      describe: 'Open a Chromium instance pointed to the provided URL',
    })
    .option('match', {
      type: 'string',
      describe: 'Match target tab by URL substring',
    })
    .option('port', {
      type: 'number',
      default: 7070,
      describe: 'Local HTTP server port',
    })
    .option('host', {
      type: 'string',
      default: '127.0.0.1',
      describe: 'Host interface to bind (defaults to localhost)',
    })
    .option('persist', {
      type: 'string',
      describe: 'Directory to persist logs in NDJSON format',
    })
    .option('token', {
      type: 'string',
      describe: 'Bearer token required for accessing the HTTP API',
    })
    .option('headless', {
      type: 'boolean',
      default: false,
      describe: 'Launch Chrome in headless mode when using --open',
    })
    .option('buffer-size', {
      type: 'number',
      default: 2000,
      describe: 'In-memory buffer size for log events',
    })
    .option('remote-port', {
      type: 'number',
      describe: 'Existing Chrome remote debugging port (default 9222)',
    })
    .option('quiet', {
      type: 'boolean',
      default: false,
      describe: 'Reduce logging output',
    })
    .help()
    .alias('h', 'help')
    .alias('v', 'version')
    .wrap(100)
    .parse();

  try {
    await start({
      open: argv.open,
      match: argv.match,
      port: argv.port,
      host: argv.host,
      persist: argv.persist,
      token: argv.token,
      headless: argv.headless,
      bufferSize: argv.bufferSize,
      remotePort: argv.remotePort,
      quiet: argv.quiet,
    });
  } catch (err) {
    console.error('[console-relay] failed to start', err.message || err);
    process.exit(1);
  }
}

main();
