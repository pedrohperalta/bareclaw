# Product Definition

## Project Name

Bareclaw

## Description

A thin multiplexer that routes messages from HTTP, Telegram, and other channels into long-lived, persistent Claude CLI sessions — turning Claude Code into a personal AI agent daemon.

## Problem Statement

Claude Code is powerful but locked to a terminal — there's no way to interact with it persistently from Telegram, HTTP, or other channels.

## Target Users

Developers who want a persistent Claude agent accessible from multiple channels.

## Key Goals

1. **Persistent sessions** — Sessions survive restarts, crashes, and reconnections. One channel, one brain.
2. **Multi-channel routing** — HTTP, Telegram, and future adapters all feed into the same session model.
3. **Minimal config** — Environment variables only. No YAML, no dashboards, no admin panels.
