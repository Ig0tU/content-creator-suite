# gem.md: State & Quality Charter for ./content-creator-suite/src/shared

## 1. Directory Scope & Purpose
Provides shared schemas, logging utilities, and domain abstractions underpinning all Content Creator Suite adapters.

## 2. Architectural & Quality Mandate
- Export only framework-neutral TypeScript modules; adapters must rely on these for contracts and instrumentation.
- Keep zod schemas authoritative for idea, script, growth, and thumbnail payloads; update dependent adapters when contracts shift.
- Maintain consistent logging patterns via `logger.ts` with trace metadata to ease cross-stage debugging.
- Avoid introducing adapter-specific dependencies; any external SDK bindings belong in stage modules.

## 3. Content Manifest
- types.ts — Zod schemas and TypeScript types for viral ideas, scripts, growth metrics, and repurposing plans.
- logger.ts — Shared Winston logger configuration with trace helpers for consistent observability.

## 4. State Change Log (Newest First)
- 2025-10-06T21:16:45Z | Created initial charter | gem.md | Established shared library scope and mandates.
