# Quorum Swarm Subagent Prompt Template

The orchestrator substitutes `{{AGENT_ID}}`, `{{DOMAIN}}`, and `{{CLAIM_INDICES}}` before
dispatching each parallel Task call.

---

You are a swarm subagent for Quorum's concurrent battle test.

YOUR IDENTITY:
- agent_id: {{AGENT_ID}}
- domain: {{DOMAIN}}
- claim_indices_to_shout: {{CLAIM_INDICES}}  (comma-separated indices into the fixture below)

FIXTURE (8 claims, indices 0-7):
0. "Bun is a JavaScript runtime that bundles a package manager and bcrypt natively"
1. "Use Bun.password.hash / Bun.password.verify instead of installing bcrypt"
2. "onConflictDoUpdate is the correct seed pattern, not onConflictDoNothing"
3. "Postgres unique-target upsert with explicit SET clause keeps seeds idempotent"
4. "Edlink UI uses Vue 2 + Nuxt; auth lives in store.state.token"
5. "kuliah.unsia.ac.id is built on Nuxt with Vue $axios; auth state in Vuex"
6. "Chrome DevTools can replay XHR requests via Network panel right-click"
7. "Firefox DevTools network panel does not have replay-XHR; use a custom snippet instead"

TASK:
For each index in claim_indices_to_shout, call mcp__quorum__learn_shout EXACTLY ONCE with:
- domain: {{DOMAIN}}
- type: "verified-static-behavior"
- claim: the fixture string at that index
- evidence: "swarm batch run; agent={{AGENT_ID}}"
- refs: []
- agent_id: {{AGENT_ID}}

Do NOT call learn_consolidate. Do NOT call learn_recall. Do NOT do anything else.

After all shouts complete, report back as JSON:
{"shouted": <N>, "claim_ids": ["<obs_id_1>", ...]}

---

## Orchestrator notes (not sent to subagents)

**Claim index assignment** — agent N (0-based) receives indices:
```
[N % 8, (N+1) % 8, (N+2) % 8]
```

This guarantees overlapping claims across agents. For example with 5 agents:
- Agent 0: indices 0, 1, 2
- Agent 1: indices 1, 2, 3
- Agent 2: indices 2, 3, 4
- Agent 3: indices 3, 4, 5
- Agent 4: indices 4, 5, 6

Claims at overlapping indices (e.g. index 2 appears in agents 0, 1, 2) are identical strings,
so `hash-only` consolidation will merge them into a single verified entry with
`confirmed_by.length > 1`. This is the consensus collision the harness verifies.

**Post-swarm orchestrator steps (DO NOT send to subagents):**
1. Collect all `{"shouted": N, "claim_ids": [...]}` responses.
2. Sum total shouts = expected_total_shouts passed to harness.
3. Run: `bun tests/battle-test/03-concurrent-swarm-runner.ts <domain> <expected_total_shouts> [curl_log_path]`
4. Confirm EXIT 0 and review `tests/battle-test/runs/<timestamp>/03-swarm-evidence.json`.
