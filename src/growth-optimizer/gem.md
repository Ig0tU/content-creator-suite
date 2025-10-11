# gem.md: State & Quality Charter for ./content-creator-suite/src/growth-optimizer

## 1. Directory Scope & Purpose
Delivers growth optimization MCP tools that refine SEO, thumbnails, scheduling, repurposing, and experimentation to improve creator performance.

## 2. Architectural & Quality Mandate
- Keep analytics and optimization logic stateless; rely on shared logging and validation while leaving persistence to future adapters.
- Validate all tool arguments via zod schemas before hitting external APIs (YouTube analytics, trend endpoints, etc.).
- Guard third-party calls with resilient error handling and actionable log messaging.
- Encapsulate AI interactions (Gemini, etc.) to allow provider swaps without changing tool contracts.

## 3. Content Manifest
- server.ts — MCP server defining optimization toolset, schema validation, API calls, and logging instrumentation.

## 4. State Change Log (Newest First)
- 2025-10-06T21:16:45Z | Created initial charter | gem.md | Documented growth optimizer scope and quality mandates.
