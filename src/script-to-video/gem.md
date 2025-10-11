# gem.md: State & Quality Charter for ./content-creator-suite/src/script-to-video

## 1. Directory Scope & Purpose
Provides MCP adapters that convert vetted ideas into production-ready video scripts, storyboards, voiceovers, and NLE exports.

## 2. Architectural & Quality Mandate
- Keep AI-driven script and storyboard generation mediated through provider factories; avoid direct SDK coupling in business logic.
- Validate every tool argument using zod schemas and sanitize outputs (e.g., ensure durations/hook timings comply with platform specs).
- Manage file exports and voiceover generation with proper error handling and environment checks; never write outside caller-approved paths.
- Record detailed trace logs covering platform, duration targets, and export formats for reproducibility.

## 3. Content Manifest
- server.ts — MCP server defining script/storyboard/voiceover/export tools with schema enforcement and AI integrations.

## 4. State Change Log (Newest First)
- 2025-10-06T21:16:45Z | Created initial charter | gem.md | Documented script-to-video adapter scope and mandates.
