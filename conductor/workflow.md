# Workflow

## TDD Policy

**Moderate** — Tests are encouraged but do not block progress. Write tests for non-trivial logic, especially core session management and adapter behavior. Trivial changes can proceed without tests.

## Commit Strategy

**Conventional Commits** — All commit messages follow the format:

- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code restructuring without behavior change
- `test:` — Adding or updating tests
- `docs:` — Documentation changes
- `chore:` — Build, config, dependency updates

## Code Review

**Optional / self-review OK** — Contributors are trusted. Self-merge is acceptable for all changes.

## Verification Checkpoints

**At track completion only** — Manual verification is required when a full track (feature, bug fix, refactor) is complete. Individual tasks and phases do not require manual checkpoints.

## Task Lifecycle

1. **Pending** — Task defined but not started
2. **In Progress** — Actively being worked on
3. **Complete** — Implementation done, tests passing
4. **Verified** — Manually verified at track completion
