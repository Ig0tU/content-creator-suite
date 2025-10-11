# gem.md: State & Quality Charter for ./content-creator-suite

## 1. Directory Scope & Purpose
Delivers the Content Creator MCP suite that guides viral idea ideation, script generation, and growth optimization for social platforms.

## 2. Architectural & Quality Mandate
- Maintain separation of concerns per stage (ideas, scripts, growth); cross-cutting logic resides in `src/shared`.
- Enforce framework-agnostic adapters that expose MCP tools while delegating AI/provider specifics to shared abstractions.
- Keep build/test automation current (`tsc`, `jest`); ensure stage parity across CLI binaries and documentation.
- Capture environment requirements for API integrations (YouTube, TikTok, etc.) in clearly documented form.

## 3. Content Manifest
- package.json — Package metadata, CLI entrypoints, and dependency manifests for the suite.
- tsconfig.json — TypeScript configuration governing adapter compilation.
- src/ — Source code for stage adapters and shared utilities; see nested gem.md files for detail.
- node_modules/ (ignored) — Dependency tree generated at install time.
- dist/ (generated) — Build artefacts for CLI binaries; excluded from version control.

## 4. State Change Log (Newest First)
- 2025-10-06T21:16:45Z | Created initial charter | gem.md | Documented suite scope, mandates, and manifest baseline.
