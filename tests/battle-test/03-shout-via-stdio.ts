#!/usr/bin/env bun
import { spawn } from "child_process";
import { resolve as resolvePath } from "path";

const FIXTURE = [
  "Bun is a JavaScript runtime that bundles a package manager and bcrypt natively",
  "Use Bun.password.hash / Bun.password.verify instead of installing bcrypt",
  "onConflictDoUpdate is the correct seed pattern, not onConflictDoNothing",
  "Postgres unique-target upsert with explicit SET clause keeps seeds idempotent",
  "Edlink UI uses Vue 2 + Nuxt; auth lives in store.state.token",
  "kuliah.unsia.ac.id is built on Nuxt with Vue $axios; auth state in Vuex",
  "Chrome DevTools can replay XHR requests via Network panel right-click",
  "Firefox DevTools network panel does not have replay-XHR; use a custom snippet instead",
];

const [domain, agentId, indicesStr] = process.argv.slice(2);

if (!domain || !agentId || !indicesStr) {
  process.stderr.write(
    `usage: bun tests/battle-test/03-shout-via-stdio.ts <domain> <agent_id> <comma-separated-indices>\n`,
  );
  process.exit(2);
}

const indices = indicesStr.split(",").map((s) => Number(s.trim()));
for (const i of indices) {
  if (!Number.isInteger(i) || i < 0 || i >= FIXTURE.length) {
    process.stderr.write(`invalid claim index: ${i} (fixture length=${FIXTURE.length})\n`);
    process.exit(2);
  }
}

const repoRoot = resolvePath(import.meta.dir, "..", "..");
const serverEntry = resolvePath(repoRoot, "src/index.ts");

const server = spawn("bun", [serverEntry], {
  stdio: ["pipe", "pipe", "inherit"],
  cwd: repoRoot,
});

const pending = new Map<number, (msg: any) => void>();
let nextId = 0;
let buf = "";

server.stdout.on("data", (chunk: Buffer) => {
  buf += chunk.toString();
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let msg: any;
    try {
      msg = JSON.parse(t);
    } catch {
      continue;
    }
    if (typeof msg.id === "number" && pending.has(msg.id)) {
      pending.get(msg.id)!(msg);
      pending.delete(msg.id);
    }
  }
});

function request(method: string, params: unknown): Promise<any> {
  const id = ++nextId;
  return new Promise((resolveReq, rejectReq) => {
    pending.set(id, resolveReq);
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rejectReq(new Error(`timeout waiting for response to ${method} id=${id}`));
      }
    }, 30000);
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    const orig = pending.get(id);
    if (orig) {
      pending.set(id, (m) => {
        clearTimeout(timer);
        orig(m);
      });
    }
  });
}

function notify(method: string, params: unknown): void {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

try {
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "battle-test-swarm", version: "1.0" },
  });
  notify("notifications/initialized", {});

  const claim_ids: string[] = [];
  for (const i of indices) {
    const resp = await request("tools/call", {
      name: "learn_shout",
      arguments: {
        domain,
        type: "verified-static-behavior",
        claim: FIXTURE[i],
        evidence: `swarm batch run; agent=${agentId}`,
        refs: [],
        agent_id: agentId,
      },
    });
    const text = resp?.result?.content?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error(`unexpected response shape: ${JSON.stringify(resp)}`);
    }
    const inner = JSON.parse(text);
    if (!inner.obs_id) {
      throw new Error(`shout returned no obs_id: ${text}`);
    }
    claim_ids.push(inner.obs_id);
  }

  server.stdin.end();
  server.kill();

  process.stdout.write(JSON.stringify({ shouted: claim_ids.length, claim_ids }) + "\n");
  process.exit(0);
} catch (err) {
  server.kill();
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
