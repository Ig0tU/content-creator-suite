# gem.md: State & Quality Charter for ./content-creator-suite/src/idea-generator

## 1. Directory Scope & Purpose
Implements ideation MCP tools that mine trends, generate viral concepts, and score virality across social platforms.

## 2. Architectural & Quality Mandate
- Use shared logging/trace utilities to track scraping and AI usage; flag any rate-limit or credential issues quickly.
- Ensure all scraped or API-derived data respects platform TOS; encapsulate adapters to enable compliant replacements.
- Validate payloads with `ViralIdeaSchema` and related shared types; never return unvalidated AI output.
- Keep the module stateless and provider-agnostic by routing AI work through shared abstractions when added.

## 3. Content Manifest
- server.ts — MCP server exposing viral idea generation, trend analysis, and virality scoring tools with validation and logging.

## 4. State Change Log (Newest First)
- 2025-10-06T21:16:45Z | Created initial charter | gem.md | Captured ideation adapter responsibilities and guardrails.
