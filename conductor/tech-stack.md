# Tech Stack

## Languages

- **TypeScript** (ES2022, strict mode) — Primary language for all source code
- **Bash/Shell** — Heartbeat scripts, installer, test harnesses

## Runtime

- **Node.js** (v22+) — Runtime environment
- **ESM** (`"type": "module"`) — Module system

## Frameworks

- **Express 5** — HTTP server and routing
- **Telegraf 4** — Telegram Bot API client

## Frontend

None. Bareclaw is a backend daemon with no UI.

## Database

None currently. Session state persisted as JSON files on disk (`.bareclaw-sessions.json`). Database may be added later.

## Infrastructure

- **Self-hosted / Docker** — Runs on the developer's own machine or container
- **launchd** (macOS) / **systemd** (Linux) — Heartbeat scheduling
- **Unix domain sockets** — IPC between server and session hosts

## Dev Tools

- **tsx** — TypeScript execution and watch mode
- **vitest** — Test runner
- **tsc** — TypeScript compiler (build)

## Key Dependencies

| Package | Version | Purpose |
| ------- | ------- | ------- |
| express | ^5.1.0 | HTTP server |
| telegraf | ^4.16.3 | Telegram bot |

## External Dependencies

- **Claude CLI** (`claude`) — Must be installed and authenticated. Bareclaw shells out to `claude -p` for sessions.
