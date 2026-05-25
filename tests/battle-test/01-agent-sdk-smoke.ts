// @ts-ignore — claude-agent-sdk types may lag behind runtime shape
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, writeFileSync } from "fs";
import { ClaudeEngine } from "../../src/similarity/claude.ts";

const CLAIMS = [
  "Edlink UI uses Vue 2 + Nuxt; auth lives in store.state.token",
  "kuliah.unsia.ac.id is built on Nuxt with Vue $axios; auth state in Vuex",
  "Edlink frontend is a Nuxt app, $axios is pre-configured with auth interceptor",
  "Bun is a JavaScript runtime that bundles a package manager and bcrypt natively",
  "Use Bun.password.hash / Bun.password.verify instead of installing bcrypt",
  "Bun ships with native bcrypt — no npm install needed",
  "onConflictDoUpdate is the correct seed pattern, not onConflictDoNothing",
  "Seed scripts should self-heal by re-applying values via onConflictDoUpdate",
  "Use onConflictDoUpdate so reruns correct drift from prior seeds",
  "Postgres unique-target upsert with explicit SET clause keeps seeds idempotent",
];

const SYSTEM_PROMPT = `You are a claim clustering assistant. Given a list of claims, group them by topic similarity.
Return ONLY a JSON array of arrays of zero-based indices. Each inner array is one cluster.
Every index 0..N-1 must appear in exactly one cluster.
Example for 3 claims where 0 and 1 are similar: [[0,1],[2]]
Do not include any explanation, markdown, or text outside the JSON.`;

async function clusterWithRawCapture(
  claims: string[],
  model: string
): Promise<{ clusters: number[][]; resultText: string; elapsed_ms: number }> {
  const userMessage = claims.map((c, i) => `${i}: ${c}`).join("\n");
  const prompt = `${SYSTEM_PROMPT}\n\nCluster these ${claims.length} claims:\n${userMessage}`;

  let resultText = "";
  const t0 = Date.now();

  const queryResult = query({
    prompt,
    options: {
      model,
      disallowedTools: ["Bash", "Edit", "Write", "Task"],
    },
  });

  for await (const event of queryResult) {
    if ((event as any).type === "result" && (event as any).subtype === "success") {
      resultText = (event as any).result;
      break;
    }
  }

  const elapsed_ms = Date.now() - t0;

  if (!resultText) throw new Error("Claude returned empty result");

  const jsonMatch = resultText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Claude returned no JSON array: ${resultText}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Claude returned non-JSON response: ${resultText}`);
  }

  if (!Array.isArray(parsed)) throw new Error(`Claude response is not an array: ${resultText}`);

  return { clusters: parsed as number[][], resultText, elapsed_ms };
}

async function main() {
  const engine = new ClaudeEngine("claude-haiku-4-5-20251001");

  const isAvailable = await engine.available();
  if (!isAvailable) {
    console.error("engine.available() returned false — claude binary not found. Aborting.");
    process.exit(1);
  }
  console.log("engine.available() =", isAvailable);

  const costEstimate = engine.estimateCost(10);
  console.log("estimateCost(10) =", costEstimate);
  if (!costEstimate.includes("CC OAuth")) {
    throw new Error(`estimateCost did not contain "CC OAuth": ${costEstimate}`);
  }

  console.log(`Calling cluster with ${CLAIMS.length} claims...`);
  const { clusters, resultText, elapsed_ms } = await clusterWithRawCapture(
    CLAIMS,
    "claude-haiku-4-5-20251001"
  );

  console.log("elapsed_ms =", elapsed_ms);
  console.log("resultText (preview) =", resultText.slice(0, 200));
  console.log("clusters =", JSON.stringify(clusters));

  const allIndices = clusters.flat();
  const indexSet = new Set(allIndices);
  for (let i = 0; i < CLAIMS.length; i++) {
    if (!indexSet.has(i)) throw new Error(`Index ${i} missing from clusters`);
    if (allIndices.filter((x) => x === i).length > 1) throw new Error(`Index ${i} appears more than once`);
  }
  if (allIndices.length !== CLAIMS.length) {
    throw new Error(`Total indices ${allIndices.length} != ${CLAIMS.length}`);
  }

  const clusterCount = clusters.length;
  if (clusterCount < 2 || clusterCount > 4) {
    throw new Error(`Expected 2-4 clusters, got ${clusterCount}: ${JSON.stringify(clusters)}`);
  }

  const ts = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
  const runDir = `tests/battle-test/runs/${ts}`;
  mkdirSync(runDir, { recursive: true });

  const evidencePath = `${runDir}/01-agent-sdk-evidence.json`;
  const evidence = {
    elapsed_ms,
    claims: CLAIMS,
    resultText,
    clusters,
    engine_available: isAvailable,
    cost_estimate: costEstimate,
  };
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log("Evidence written to:", evidencePath);

  console.log("ALL ASSERTIONS PASSED");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
