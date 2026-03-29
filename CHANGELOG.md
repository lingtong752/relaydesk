# Changelog

All notable changes to this project should be documented in this file.

## Unreleased

- Reprioritized product planning around CLI compatibility, session discovery, and settings sync
- Added local project discovery plus imported CLI session bootstrap for Claude, Codex, and Gemini
- Added CLI session resume support and surrogate run bridging on top of imported real sessions
- Added Claude and Codex settings write-back with MCP and tool-permission sync
- Upgraded the file workspace to CodeMirror with multi-tab editing and quick open
- Added multi-session terminal tabs with reconnect-safe output replay
- Added Git remote sync operations including fetch, pull, and push
- Added plugin installation, local manifest discovery, host context, and controlled plugin action execution
- Added a first-pass tasks workspace with project document aggregation and TaskMaster read-only summaries
- Initialized the open-source RelayDesk platform repository
- Added Fastify + WebSocket API foundation
- Added MongoDB-backed project, session, message, and run models
- Added first-pass React application shell
- Added product, testing, roadmap, backlog, API, and data model docs
- Added open-source governance and CI baseline
- Added file tree and basic text editor experience
- Added browser terminal backed by `node-pty`
- Added Git status, diff, staging, commit, and branch checkout/create basics
- Added surrogate run approval flow with waiting state and approve/reject controls
- Added surrogate run takeover and resume controls with paused/waiting transitions
- Added run checkpoints and audit events with a first-pass workspace history panel
- Added checkpoint-level restore flow with latest-run bootstrap support
- Added Fastify inject integration tests and an in-memory API test database
- Added WebSocket reconnect handling with automatic re-subscription and state refresh
- Added WebSocket protocol integration coverage and fixed Fastify websocket handler wiring
- Added terminal websocket reconnect and backlog replay integration coverage
- Extracted a shared provider-core layer for mock, Claude, Codex, and unsupported providers
- Added first real Claude provider integration via Anthropic Messages API
- Added first real Codex provider integration via OpenAI Responses API
- Added first real Gemini provider integration via Gemini GenerateContent API
