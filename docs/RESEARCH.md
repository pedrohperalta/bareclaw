# BAREclaw

*One daemon, many mouths, one brain. The bare minimum between you and your AI.*

## What it is

A thin daemon that lets you talk to Claude Code from anywhere -- SMS, Telegram, WhatsApp, Discord, Apple Watch, Shortcuts, curl, anything that can send a message. Every input channel funnels into one place: `claude -p` on your machine. Full session context, full tool access, full skills/MCP/CLAUDE.md. Responses come back out the same way they came in.

The key idea: you already have a powerful agent -- Claude Code. You don't need [OpenClaw](openclaw.md)'s 68K-star framework with 50 integrations. You need a multiplexer between your messaging channels and the agent you already use. Each channel is just a transport adapter that speaks its own protocol on one side (Telegram Bot API, Twilio webhook, Apple Shortcuts HTTP) and `claude -p` on the other. BAREclaw is the thin layer in between.

## Why not just use OpenClaw?

- OpenClaw is 68K+ stars of infrastructure. BAREclaw is a single file.
- OpenClaw is LLM-agnostic. BAREclaw is Claude Code-specific *on purpose* -- you get skills, hooks, CLAUDE.md, MCP servers, the full cothought system.
- OpenClaw has [CrowdStrike-flagged security concerns](https://www.crowdstrike.com/en-us/blog/what-security-teams-need-to-know-about-openclaw-ai-super-agent/) from broad permissions across 50+ integrations. BAREclaw has one endpoint.
- OpenClaw's creator joined OpenAI (Feb 2026). The project moved to a foundation. BAREclaw is yours.

## Architecture

```
[Telegram / SMS / WhatsApp / Discord / Watch / Shortcut / curl]
    → transport adapter (one per channel)
        → BAREclaw core (HTTP POST internally)
            → claude -p "<prompt>" --resume <session-id> --output-format json
                → Claude Code (tools, skills, MCP, project context)
            ← JSON response
        ← response text
    ← reply via same channel
```

### Core components

1. **Transport adapters** -- One per input channel. Each adapter translates between a messaging protocol and BAREclaw's internal HTTP endpoint. A Telegram adapter listens for bot messages and POSTs them to the core. A Twilio adapter receives SMS webhooks. An Apple Shortcuts adapter is just a direct HTTP POST. Each adapter is a small, independent module -- add a new channel by writing a new adapter.
2. **BAREclaw core** -- HTTP server (Express/Fastify/Hono), one POST endpoint. Receives `{ prompt, channel, session_id? }`. Routes to the CLI bridge. Returns `{ response, session_id }`.
3. **Session manager** -- Tracks session IDs per channel. Each channel (telegram, sms, watch, general) gets its own Claude Code session with separate context. Uses `--resume <id>` for continuity.
4. **Claude Code CLI bridge** -- Shells out to `claude -p` with appropriate flags. Parses JSON output. Returns response text.

### Key CLI flags

- `claude -p "prompt"` -- headless/non-interactive mode
- `--resume <session-id>` -- continue a specific session with full context
- `--continue` -- continue the most recent session in the current project directory
- `--output-format json` -- structured output for parsing
- `--output-format stream-json` -- streaming for real-time responses
- `--allowedTools "Read,Edit,Bash,Glob,Grep"` -- auto-approve specific tools
- `--max-turns N` -- prevent runaway loops

### Exposure options

- **Tailscale Funnel** -- expose local server to internet with one command. Zero infrastructure, auto TLS, IP hidden. `sudo tailscale funnel 3000`. Perfect for personal use.
- **Ngrok** -- alternative tunnel, more features, free tier available.
- **Cloudflare Tunnel** -- another option, integrates with Cloudflare DNS.

### Transport adapters

Each adapter is a thin translation layer. The pattern is always the same: receive a message in the channel's native format, extract the text, POST it to BAREclaw core, send the response back through the channel.

**Messaging platforms:**
- **Telegram** -- Bot API via webhook or long polling. Create a bot with @BotFather, set webhook to BAREclaw's Tailscale Funnel URL. Incoming messages → prompt, response → `sendMessage`. Supports markdown in responses. Free.
- **SMS via Twilio** -- Twilio webhook receives incoming SMS, forwards to BAREclaw, sends response back as SMS. ~$1/mo for a number + per-message pricing.
- **WhatsApp via Twilio** -- Same Twilio infrastructure, WhatsApp Business API. Webhook pattern identical to SMS. Slightly more setup (Meta business verification) but same adapter shape.
- **Discord** -- Bot with message listener. Similar to Telegram -- create bot, add to a private server, listen for messages in a channel, reply in-thread.
- **Signal** -- Via signal-cli or signal-bot, webhook to BAREclaw. More DIY but doable.

**Apple ecosystem:**
- **Apple Watch** -- Shortcuts "Get Contents of URL" action supports POST with JSON body. Works from wrist. Pushcut app extends this with webhook triggers and server actions.
- **Apple Shortcuts (iPhone/Mac)** -- same "Get Contents of URL" action. Dictate prompt, POST to BAREclaw, read response.

**Developer / low-level:**
- **curl** -- `curl -X POST localhost:3000/prompt -d '{"prompt": "..."}'`
- **ntfy.sh** -- lightweight push notification service. Publish prompts to a topic, BAREclaw subscribes. Self-hostable. Good for async/long-running responses where you want a push notification when it's done.

## Prior art

- [csdwd/claude-code-server](https://github.com/csdwd/claude-code-server) -- Full HTTP API wrapper for Claude CLI with session management, async task queues, webhook callbacks, and TUI management. More enterprise-grade than what BAREclaw needs, but validates the pattern.
- [Kurogoma4D/claude-code-server](https://github.com/Kurogoma4D/claude-code-server) -- WebSocket server for remote Claude Code execution via Socket.io. Streams output in real-time.
- [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) (`@anthropic-ai/claude-agent-sdk`) -- Anthropic's official TypeScript/Python SDK for building agents programmatically. 1.85M+ weekly downloads. **Not used here** -- the SDK bills per API token, while CLI shelling goes through the Claude Max subscription (flat-rate unlimited). For a personal daemon, this is the deciding factor.
- [claude-did-this/claude-hub](https://github.com/claude-did-this/claude-hub) -- Webhook service connecting Claude Code to GitHub repos via @mentions.

## Why CLI shelling, not the Agent SDK

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is the "proper" way to build agents programmatically. But it bills per API token -- every prompt and response is metered. BAREclaw shells out to `claude -p` instead, which routes through the **Claude Max subscription** (flat-rate unlimited). For a personal daemon that might field dozens of prompts a day, the marginal API cost is $0. The SDK is for building products for other users; BAREclaw is a bridge for yourself.

## Token cost considerations

- Claude Code uses prompt caching by default -- cache reads cost 10% of base input tokens. Resumed sessions replay conversation history as cached context.
- Context window: 200K tokens. Auto-compacts at 95% capacity.
- Key insight: each resumed session re-sends full conversation history + system prompt + CLAUDE.md. Keep sessions focused to avoid ballooning costs.
- The `--max-turns` flag is important for daemon use -- prevents a single prompt from consuming unlimited tokens.

## Implementation plan

### V1 (weekend build)

1. Validate CLI approach (see test plan below)
2. Express server, one POST endpoint (the core)
3. Shell out to `claude -p` with `--resume` and `--output-format json`
4. Session ID storage in a JSON file (channel → session_id map)
5. First transport adapter: Apple Shortcut (direct HTTP POST, simplest possible)
6. Expose via Tailscale Funnel
7. Second transport adapter: Telegram bot (webhook, proves the multi-channel pattern)

### V2 (if V1 is useful)

- Twilio adapter (SMS + WhatsApp)
- Discord adapter
- Response streaming for longer outputs
- Authentication (API key or Tailscale ACL)
- Per-channel session contexts (work, journal, general)

### V3 (if V2 is useful)

- ntfy.sh integration for push notifications of long-running responses
- Hot mic integration (pipe [hot mic](hot%20mic.md) transcriptions directly to BAREclaw)
- MCP server mode -- expose BAREclaw itself as an MCP server other tools can connect to
- Web dashboard for viewing/managing sessions

### Test plan (pre-V1 validation)

Before building the server, confirm the CLI approach works end to end:

1. **Basic headless prompt** -- `claude -p "what is 2+2" --output-format json`. Confirm JSON response parses cleanly. Measure cold-start latency.
2. **Session resume** -- Send a first prompt, capture the session ID from the JSON output, then send a second prompt with `--resume <id>`. Confirm the second response has context from the first (e.g., "remember the number 42" → "what number did I ask you to remember?").
3. **Allowed tools** -- `claude -p "read the file README.md" --allowedTools "Read" --output-format json`. Confirm tool execution works without interactive approval.
4. **Max turns** -- `claude -p "count to 100" --max-turns 1 --output-format json`. Confirm it stops after one turn, doesn't run away.
5. **Concurrent requests** -- Fire two `claude -p` calls simultaneously with different session IDs. Confirm they don't interfere with each other. This matters because the daemon will receive messages from multiple channels.
6. **Response size** -- Send a prompt that generates a long response. Measure how long it takes, whether the JSON output is complete or truncated.
7. **Error handling** -- Send a prompt with an invalid `--resume` session ID. Confirm it returns a parseable error, not a crash.
8. **From a script** -- Write a minimal Node.js script that shells out to `claude -p`, parses the JSON, and prints the response. This is the core of what the server will do.

## Open questions

- How to handle long-running responses? Watch/Shortcut have timeout limits. Telegram/SMS are more forgiving.
- Should there be a queue for requests, or is one-at-a-time fine for personal use?
- What tools should be auto-approved via `--allowedTools`? Too few = constant permission prompts. Too many = security risk.
- Is the CLI approach fast enough, or does the cold-start latency of spawning `claude` each time make it unusable? (Test plan will answer this.)
- Should channels share sessions or stay isolated? Current plan: per-channel sessions, but maybe some channels should share (e.g., Watch and Shortcuts are both "mobile quick" use cases).

## Connected ideas

- [hot mic](hot%20mic.md) -- always-on voice input could pipe directly into BAREclaw
- [openclaw](openclaw.md) -- the heavy framework this replaces for personal use
- [fulcrum](fulcrum.md) -- another tool in the "Claude Code as platform" direction
- [exocortex](exocortex.md) -- BAREclaw would be the transport layer for the whole skill system

---

| Date | Change |
|------|--------|
| 02-21-2026 | Created -- journal brainstorm session. Concept, architecture, research, and implementation plan. |
| 02-21-2026 | Reworked around multi-channel as core framing. Added transport adapter architecture, Telegram/WhatsApp/Discord/Signal channels, CLI shelling rationale (Max subscription), and pre-V1 test plan. |

Links: [openclaw](openclaw.md) -- the heavy framework this replaces. [hot mic](hot%20mic.md) -- always-on voice input, potential integration. [fulcrum](fulcrum.md) -- another "Claude Code as platform" tool. [exocortex](exocortex.md) -- the skill system BAREclaw would serve as transport for.
