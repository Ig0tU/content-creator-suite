# gem.md: State & Quality Charter for ./content-creator-suite/src

## 1. Directory Scope & Purpose
Contains stage-specific MCP adapters and shared abstractions powering the content creator workflow from ideation through growth optimization.

## 2. Architectural & Quality Mandate
- Keep AI prompt/response logic centralized in shared utilities to ensure consistent experimentation across stages.
- Enforce DI boundaries: adapters may depend on `shared` for contracts, logging, and provider factories but never on each other.
- Maintain schema validation for every tool input/output using shared zod definitions.
- Encourage mirrored testing conventions across stages to validate behavior before release.

## 3. Content Manifest
- idea-generator/ — Tooling for ideation, trend mining, and concept validation.
- script-to-video/ — Adapters converting scripts into video-ready narratives and production cues.
- growth-optimizer/ — Optimization engines for SEO, hook testing, and analytics-driven tweaks.
- shared/ — Cross-cutting contracts, logging, and provider utilities.

## 4. State Change Log (Newest First)
- 2025-10-06T21:16:45Z | Created initial charter | gem.md | Established source tree responsibilities and mandates.
