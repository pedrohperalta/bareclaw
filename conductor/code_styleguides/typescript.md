# TypeScript Style Guide

Conventions inferred from the Bareclaw codebase.

## General

- **Strict mode** enabled (`"strict": true` in tsconfig)
- **ESM** module system (`"type": "module"`, NodeNext resolution)
- **Target**: ES2022
- No linter or formatter config — rely on TypeScript strict mode and code review

## Naming

- **Files**: kebab-case (`process-manager.ts`, `push-registry.ts`)
- **Test files**: co-located, `<name>.test.ts` suffix
- **Classes**: PascalCase (`ProcessManager`, `PushRegistry`)
- **Interfaces/Types**: PascalCase (`SendMessageResponse`, `ChannelContext`)
- **Functions**: camelCase (`loadConfig`, `createHttpAdapter`)
- **Constants**: UPPER_SNAKE_CASE for true constants (`MAX_MESSAGE_LENGTH`, `FILLER_MAX_LENGTH`)
- **Private members**: no prefix, use `private` keyword

## Patterns

- **Factory functions** over classes for adapters (`createHttpAdapter`, `createTelegramAdapter`)
- **Classes** for stateful core components (`ProcessManager`, `PushRegistry`)
- **Config via environment variables** — single `loadConfig()` function, no scattered `process.env` reads
- **Explicit error handling** — try/catch at boundaries, `.catch(() => {})` for fire-and-forget
- **No default exports** — use named exports exclusively

## Imports

- Node built-ins first, then external packages, then local modules
- Use `.js` extensions in imports (NodeNext resolution requires it)

## Types

- Prefer `interface` for object shapes, `type` for unions and aliases
- Use `string | ContentBlock[]` union patterns for flexible inputs
- Index signatures (`[key: string]: unknown`) for extensible protocol types

## Functions

- Keep functions focused — one responsibility
- Use early returns to reduce nesting
- Async/await over raw promises, except for socket-level event handling
- Callbacks for event-driven code (socket handlers, readline)

## Error Handling

- Catch at boundaries (route handlers, event handlers)
- Log errors with `console.error` and a `[prefix]` tag (e.g., `[bareclaw]`, `[telegram]`)
- Return error info to callers via response objects (`is_error` field), not thrown exceptions

## Testing

- **Vitest** as test runner
- Co-located test files (`foo.test.ts` next to `foo.ts`)
- Test exported functions directly — no mocking of internal state
- Group with `describe`, use clear `it` descriptions
- Use real Express instances with `fetch` for HTTP tests (no supertest)
