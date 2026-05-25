---
descriptor: 2026-05-25-quorum-mcp
plan: docs/plan/2026-05-25-quorum-mcp/plan.md
research: docs/plan/2026-05-25-quorum-mcp/research.md
written_at: 2026-05-25 03:55 UTC
written_by: planning session (Opus 4.7), edlink project context
reason: user-request (context > 250k, user invoked /od-handover)
---

# Handover — Quorum MCP

## State snapshot

**Current DAG block:** Block 1 of 9 — sequential (no parallel batches in plan)

**Phase registry:**

| Phase | Name | Status | Notes |
|---|---|---|---|
| 1 | Foundation (config + types + storage primitives + init CLI) | partial — package.json + tsconfig.json written; remaining: src/types.ts, src/config.ts, src/paths.ts, src/index.ts (boot proof), bin/quorum.ts (init subcommand), config.example.json |
| 2 | Storage layer (ledger, consolidated, quarantine, archive, state) | pending | blocked by Phase 1 |
| 3 | Similarity engines (hash-only + claude + openai + gemini + 3 stubs) | pending | blocked by Phase 1 |
| 4 | Lifecycle (TTL + promote — pure functions) | pending | blocked by Phase 1 |
| 5 | MCP tools (6 tools, zod schemas) | pending | blocked by Phases 2, 3, 4 |
| 6 | MCP server entry (stdio) | pending | blocked by Phase 5 |
| 7 | HTTP dashboard backend (Hono) | pending | blocked by Phases 2, 3, 4, 5 |
| 8 | Frontend dashboard (HTML + Alpine.js + CSS) | pending | blocked by Phase 7 |
| 9 | CLI completion + README | pending | blocked by all prior |

Note: TaskList (#1–#10) was created earlier and is slightly misaligned with the 9-phase plan structure (Task #7 bundles Phase 6 + Phase 7; Tasks #9+#10 both map to Phase 9; Task #2 is subsumed by Phase 1). **Treat plan.md as authoritative; the next session should reconcile the task registry by re-creating 9 tasks aligned 1:1 with phases, or use the plan directly without the task layer.**

**Last completed action:** Plan + research documents written to disk, status updated to `approved`, 3 open questions resolved verbatim from user (auto-consolidate = cron-only, init = interactive prompt with .bak backup, storage path = `~/.claude/mcp-servers/quorum/data/`). Confidence 9/10, execution readiness 9/10, risk medium.

**Immediate next action:** Re-align TaskList to 9 phase-aligned tasks (delete the 10 existing misaligned ones), then dispatch `orchestration-executor` subagent for Phase 1 with the brief at `plan.md §Phase 1`. Phase 1 has 2 files already on disk (`package.json`, `tsconfig.json`) — executor must NOT recreate them, only fill the missing files listed in plan §Phase 1.

---

## In-flight context

### User confirmations (verbal, not yet captured in research/plan if subtle)

- **No Opus for Claude similarity engine** — Haiku + Sonnet model variants only. Default to Haiku (cheap). Stated by user verbatim: "claude itu haiku, dan sonnet, opus jangan dimasukkan terlalu mahal".
- **Non-Anthropic providers acceptable** — DeepSeek, Gemini, Minimax explicitly OK ("yang china juga ok kok minimax"). Don't gate on Anthropic-only.
- **Dropdown UI required** — engine selection must be a dropdown in the dashboard Settings page, not just a config file edit. Centralized config is non-negotiable.
- **Frontend is required, not optional** — user explicitly compared to claude-mem and said "biar bisa dicek langsung pula". Phase 8 cannot be deferred.
- **Anti-poisoning is structural, not nice-to-have** — user framed Anthropic's KV cache as adversarial because they bill cache hit/miss equally so have no incentive to evict stale. Architecture must defeat this from outside. All 5 anti-poison primitives in research.md are load-bearing — TTL, evidence pointer, contradiction quarantine, version-header cache-bust, periodic re-verification.

### Discoveries made mid-run

- **KV cache framing crystallized the architecture** — the version-header cache-bust on `learn_recall` output (first line `<!-- quorum | domain=X | content_hash=Y -->`) is what makes this MCP structurally different from existing memory MCPs. Every time consolidator updates a domain's md, content_hash changes → prefix hash differs byte-for-byte → KV cache must miss → fresh fetch forced. Anthropic can't ignore byte differences.
- **User uses Bun extensively** — confirmed in edlink project. Plan commits to Bun runtime + TypeScript no-build. Do not reach for Node/npm.
- **claude-mem comparison is the reference UX** — user wants dashboard browse-ability comparable to claude-mem, not just a JSON dump endpoint.

### Deviations from plan (not yet logged in plan.md progress log)

- None. No executor has dispatched. Plan is pristine.

### Environment / tooling notes

- **No git init yet** in `~/.claude/mcp-servers/quorum/`. The first executor or next orchestrator should `git init` and stage the existing files as the baseline commit before Phase 1 work continues, so progress is reviewable.
- **MCP not yet registered in `~/.claude/settings.json`** — registration is intentionally deferred until Phase 1 completion (the `quorum init` interactive prompt handles this). Do not pre-register manually.
- **Dashboard port 4729** — chosen for `q`=`4`+`7`+`2`+`9` mnemonic. Configurable. No collision check done; verify port free before Phase 7 testing.
- **No API keys configured** — config.json defaults all engine api_keys to null. Similarity testing in Phase 3 should use hash-only first; user adds API keys via Settings page after Phase 8 lands.

---

## Known issues and blockers

| # | Severity | Description | Status |
|---|---|---|---|
| 1 | watch | Bun `fs.appendFile` is atomic only when each write is < PIPE_BUF (4 KB on macOS). Plan mitigates by capping `evidence` field at 800 chars in shout — enforce this in Phase 5 (`src/tools/shout.ts`) via zod `.max(800)`. | mitigated by plan |
| 2 | watch | Hono native Bun support assumed but not empirically verified by writing code. Phase 7 may hit a surprise. Fallback: switch to `Bun.serve()` directly (drops 1 dep, costs some routing ergonomics). | unresolved |
| 3 | watch | TaskList (#1–#10) misaligned with 9-phase plan structure. Risk: next orchestrator dispatches executor using wrong task as brief. **Mitigation: first action in next session is to recreate tasks 1:1 with plan phases.** | unresolved |
| 4 | risk | Phase 8 frontend depends on CDN Alpine.js — offline dashboard breaks if CDN down. Acceptable for v0.1, document in README. | accepted |
| 5 | risk | Plan says "User pref over recommendation" for storage path co-located with code. Implication: a future MCP reinstall that wipes `~/.claude/mcp-servers/quorum/` would erase all learnings. README §Backup must call this out loudly. | accepted, document in Phase 9 |
| 6 | watch | `package.json` lists `@hono/node-server` dependency. On Bun native, this is unneeded. Phase 7 executor should remove it from package.json if Hono native Bun confirmed. | unresolved |

---

## Resume prompt

Copy this entire block and paste it as the first message in the new session.

---

```
RESUME ORCHESTRATION

Descriptor: 2026-05-25-quorum-mcp
Handover: ~/.claude/mcp-servers/quorum/docs/plan/2026-05-25-quorum-mcp/handover.md
Plan: ~/.claude/mcp-servers/quorum/docs/plan/2026-05-25-quorum-mcp/plan.md
Research: ~/.claude/mcp-servers/quorum/docs/plan/2026-05-25-quorum-mcp/research.md

Read all three in order: handover.md → plan.md → research.md (skim).

Then do exactly this:
1. cd ~/.claude/mcp-servers/quorum && git init && git add -A && git commit -m "baseline: plan + scaffolding"
2. Reconcile TaskList: delete existing 10 misaligned tasks, create 9 phase-aligned tasks 1:1 with plan §Phase breakdown, wire addBlockedBy per phase deps.
3. Invoke od-execute with plan path. Phase 1 is the first dispatch. NOTE: package.json + tsconfig.json already exist — executor must NOT recreate them, only fill remaining Phase 1 files (src/types.ts, src/config.ts, src/paths.ts, src/index.ts boot proof, bin/quorum.ts init subcommand, config.example.json).

Do not re-plan. Do not re-ask the 3 questions already resolved (auto-consolidate=cron-only, init=interactive prompt, storage=co-located). Do not register MCP in ~/.claude/settings.json until Phase 1's quorum init handles it.
```
