# Console Relay

Expose your browser console as a local HTTP API that any CLI, script or AI agent can consume in real time. Console Relay connects to a Chromium browser via the Chrome DevTools Protocol (CDP), captures `console.*` output and DevTools log events, and relays them through a local server.

## Features

- 🔌 **Connect to Chrome, Edge or Brave** via CDP.
- 📡 **HTTP endpoints** for `/health`, `/logs` and `/logs/stream` (Server-Sent Events).
- 🌀 **In-memory circular buffer** (default 2000 entries) with filters by level, regex match and timestamp.
- 💾 **Optional NDJSON persistence** with automatic daily rotation.
- 🔐 **Local-only by default** with optional Bearer token.
- ♻️ **Automatic reconnection** if the target tab closes.

## Installation

The CLI is designed to be run with `npx` without prior installation:

```bash
npx console-relay --open http://localhost:3000
```

To install globally:

```bash
npm install -g console-relay
```

Console Relay requires **Node.js 18+** and a Chromium-based browser (Chrome, Edge or Brave) with remote debugging enabled.

## Usage

### Start and open a page automatically

```bash
npx console-relay --open http://localhost:3000
```

### Connect to an existing tab (matching URL substring)

```bash
npx console-relay --match localhost --remote-port 9222
```

### Persist logs and protect the API

```bash
npx console-relay \
  --match dashboard \
  --persist ./logs \
  --token mytoken \
  --port 7070
```

### Run Chrome headless

```bash
npx console-relay --open https://example.com --headless
```

## CLI options

| Flag | Description |
| ---- | ----------- |
| `--open <url>` | Launch a temporary Chrome instance and navigate to the URL. |
| `--match <text>` | Match an existing tab by URL or title substring. |
| `--port <number>` | HTTP server port (default `7070`). |
| `--host <host>` | Interface to bind (default `127.0.0.1`). |
| `--persist <dir>` | Persist logs as NDJSON files with daily rotation. |
| `--token <string>` | Require `Authorization: Bearer <token>` header. |
| `--headless` | Launch Chrome in headless mode when using `--open`. |
| `--remote-port <number>` | Use an existing remote debugging port (default `9222`). |
| `--buffer-size <number>` | Size of the in-memory log buffer (default `2000`). |
| `--quiet` | Reduce CLI output to errors only. |

## HTTP API

Base URL: `http://127.0.0.1:7070`

### `GET /health`
Returns the current relay status, including buffer statistics and CDP connection details.

### `GET /logs`
Returns logs as JSON. Supports filters through query parameters:

- `n`: maximum number of entries (most recent first).
- `level`: comma-separated levels (`log`, `info`, `warn`, `error`).
- `match`: case-insensitive regular expression applied to the log text.
- `since`: ISO timestamp or epoch milliseconds.

Example:

```
curl "http://127.0.0.1:7070/logs?n=200&level=error&match=timeout"
```

### `GET /logs/stream`
Streams live logs using Server-Sent Events (SSE). Ideal for dashboards or AI agents that need real-time data.

```
curl -N "http://127.0.0.1:7070/logs/stream"
```

If a token is configured, include it in every request:

```
curl -H "Authorization: Bearer mytoken" "http://127.0.0.1:7070/logs"
```

## Examples

Example cURL requests are available in [`examples/curl.http`](examples/curl.http).

## Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-org/console-relay.git
cd console-relay
npm install
```

Run the CLI locally:

```bash
node bin/console-relay.js --open https://example.com
```

## License

MIT License © Console Relay Contributors
