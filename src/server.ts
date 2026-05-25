import { Hono } from "hono";
import path from "path";
import { loadConfig, saveConfig } from "./config.ts";
import { readLedgerSince } from "./storage/ledger.ts";
import { readConsolidated } from "./storage/consolidated.ts";
import * as quarantine from "./storage/quarantine.ts";
import { handler as statusHandler } from "./tools/status.ts";
import { handler as consolidateHandler } from "./tools/consolidate.ts";

const app = new Hono();

const DASHBOARD_DIR = path.join(import.meta.dir, "dashboard");

// --- Helper: mask API key value ---
function maskApiKey(value: string | null): string | null {
  if (value === null) return null;
  if (value.length <= 8) return value;
  return value.slice(0, 4) + "..." + value.slice(-4);
}

// --- GET /api/domains ---
app.get("/api/domains", async (c) => {
  const result = await statusHandler({});
  const parsed = JSON.parse(result);
  if (parsed.error) {
    return c.json({ error: parsed.error }, 500);
  }
  return c.json(parsed.domains);
});

// --- GET /api/domain/:name/ledger?since=ts&limit=N ---
app.get("/api/domain/:name/ledger", async (c) => {
  const domain = c.req.param("name");
  const sinceParam = c.req.query("since");
  const limitParam = c.req.query("limit");

  const since = sinceParam ? Number(sinceParam) : 0;
  const limit = limitParam ? Number(limitParam) : undefined;

  const observations = await readLedgerSince(domain, since);
  const result = limit !== undefined ? observations.slice(0, limit) : observations;
  return c.json(result);
});

// --- GET /api/domain/:name/consolidated ---
app.get("/api/domain/:name/consolidated", async (c) => {
  const domain = c.req.param("name");
  const data = await readConsolidated(domain);
  return c.json(data?.entries ?? []);
});

// --- GET /api/domain/:name/quarantine ---
app.get("/api/domain/:name/quarantine", async (c) => {
  const domain = c.req.param("name");
  const pairs = await quarantine.list(domain);
  return c.json(pairs);
});

// --- POST /api/domain/:name/consolidate ---
app.post("/api/domain/:name/consolidate", async (c) => {
  const domain = c.req.param("name");
  const result = await consolidateHandler({ domain });
  const parsed = JSON.parse(result);
  if (parsed.error) {
    return c.json({ error: parsed.error }, 500);
  }
  return c.json(parsed);
});

// --- GET /api/config ---
app.get("/api/config", async (c) => {
  const config = await loadConfig();
  const masked = {
    ...config,
    similarity: {
      ...config.similarity,
      api_keys: {
        anthropic: maskApiKey(config.similarity.api_keys.anthropic),
        openai: maskApiKey(config.similarity.api_keys.openai),
        gemini: maskApiKey(config.similarity.api_keys.gemini),
        deepseek: maskApiKey(config.similarity.api_keys.deepseek),
        minimax: maskApiKey(config.similarity.api_keys.minimax),
      },
    },
  };
  return c.json(masked);
});

// --- POST /api/config ---
app.post("/api/config", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  try {
    // Preserve real API keys — masked values (containing "...") must not overwrite real keys
    const current = await loadConfig();
    const typedBody = body as Parameters<typeof saveConfig>[0];
    if (typedBody?.similarity?.api_keys) {
      for (const k of Object.keys(typedBody.similarity.api_keys) as Array<keyof typeof typedBody.similarity.api_keys>) {
        const incoming = typedBody.similarity.api_keys[k];
        if (typeof incoming === "string" && incoming.includes("...")) {
          typedBody.similarity.api_keys[k] = current.similarity.api_keys[k];
        }
      }
    }
    await saveConfig(typedBody);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// --- Static files: dashboard ---
app.get("/", async (c) => {
  const filePath = path.join(DASHBOARD_DIR, "index.html");
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    return c.text("Dashboard coming soon (Phase 8)", 404);
  }
  return new Response(await file.text(), {
    headers: { "Content-Type": "text/html" },
  });
});

app.get("/app.js", async (c) => {
  const filePath = path.join(DASHBOARD_DIR, "app.js");
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    return c.text("Coming soon", 404);
  }
  return new Response(await file.text(), {
    headers: { "Content-Type": "application/javascript" },
  });
});

app.get("/style.css", async (c) => {
  const filePath = path.join(DASHBOARD_DIR, "style.css");
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    return c.text("Coming soon", 404);
  }
  return new Response(await file.text(), {
    headers: { "Content-Type": "text/css" },
  });
});

// --- Bun server export ---
const config = await loadConfig();

export default {
  fetch: app.fetch,
  port: config.dashboard.port,
  hostname: "127.0.0.1",
};
