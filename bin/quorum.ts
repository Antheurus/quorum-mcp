import { homedir } from "os";
import path from "path";
import { DEFAULT_CONFIG, DEFAULT_CONFIG_PATH, loadConfig, saveConfig } from "../src/config.ts";
import { expandHome, ensureStorageDirs } from "../src/paths.ts";
import { handler as consolidateHandler } from "../src/tools/consolidate.ts";
import { handler as statusHandler } from "../src/tools/status.ts";

const QUORUM_ROOT = path.join(homedir(), ".claude", "mcp-servers", "quorum");
const CLAUDE_SETTINGS_PATH = path.join(homedir(), ".claude", "settings.json");
const CLAUDE_SETTINGS_BAK_PATH = CLAUDE_SETTINGS_PATH + ".bak";

async function promptLine(question: string): Promise<string> {
  process.stdout.write(question);
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
    const joined = Buffer.concat(chunks).toString("utf8");
    const newline = joined.indexOf("\n");
    if (newline !== -1) {
      return joined.slice(0, newline).trim();
    }
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function runInit(): Promise<void> {
  const configPath = DEFAULT_CONFIG_PATH;
  const configFile = Bun.file(configPath);
  const configExists = await configFile.exists();

  const storageDir = expandHome(DEFAULT_CONFIG.storage_dir);
  await ensureStorageDirs(storageDir);

  if (configExists) {
    console.log("Config already exists at " + configPath + " — skipping write.");
  } else {
    await saveConfig(DEFAULT_CONFIG, configPath);
    console.log("Config written to " + configPath);
  }

  console.log("Storage dirs ensured at " + storageDir);

  const answer = await promptLine("Add quorum to ~/.claude/settings.json? [y/N] ");

  if (answer.toLowerCase() === "y") {
    await registerMcpServer();
  } else {
    printManualSnippet();
  }
}

async function registerMcpServer(): Promise<void> {
  const settingsFile = Bun.file(CLAUDE_SETTINGS_PATH);
  const settingsExists = await settingsFile.exists();

  let settings: Record<string, unknown> = {};
  if (settingsExists) {
    const raw = await settingsFile.text();
    await Bun.write(CLAUDE_SETTINGS_BAK_PATH, raw);
    console.log("Backed up settings.json to " + CLAUDE_SETTINGS_BAK_PATH);
    settings = JSON.parse(raw);
  }

  const mcpServers = (settings.mcpServers as Record<string, unknown> | undefined) ?? {};
  mcpServers["quorum"] = {
    command: "bun",
    args: [path.join(QUORUM_ROOT, "src", "index.ts")],
  };
  settings.mcpServers = mcpServers;

  await Bun.write(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
  console.log("Registered quorum MCP server in ~/.claude/settings.json");
}

function printManualSnippet(): void {
  console.log("\nAdd this to ~/.claude/settings.json manually:");
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          quorum: {
            command: "bun",
            args: [path.join(QUORUM_ROOT, "src", "index.ts")],
          },
        },
      },
      null,
      2
    )
  );
}

async function runConsolidate(domain?: string): Promise<void> {
  let domains: string[];
  if (domain) {
    domains = [domain];
  } else {
    const config = await loadConfig();
    const storageDir = expandHome(config.storage_dir);
    const consolidatedDir = path.join(storageDir, "consolidated");
    const { promises: fs } = await import("fs");
    let files: string[] = [];
    try {
      files = await fs.readdir(consolidatedDir);
    } catch {
      files = [];
    }
    domains = files
      .filter((f) => f.endsWith(".json") && f !== ".keep")
      .map((f) => f.replace(/\.json$/, ""));
  }

  if (domains.length === 0) {
    console.log("No domains found. Run 'quorum init' then use learn_observe to add observations.");
    return;
  }

  const rows: Array<{ domain: string; merged: number; promoted: number; archived: number; quarantined: number }> = [];

  for (const d of domains) {
    const result = await consolidateHandler({ domain: d });
    const parsed = JSON.parse(result);
    if (parsed.error) {
      console.error(`Error consolidating domain '${d}': ${parsed.error}`);
      rows.push({ domain: d, merged: 0, promoted: 0, archived: 0, quarantined: 0 });
    } else {
      rows.push({ domain: d, merged: parsed.merged, promoted: parsed.promoted, archived: parsed.archived, quarantined: parsed.quarantined });
    }
  }

  console.log("| Domain | Merged | Promoted | Archived | Quarantined |");
  console.log("|--------|--------|----------|----------|-------------|");
  for (const row of rows) {
    console.log(`| ${row.domain} | ${row.merged} | ${row.promoted} | ${row.archived} | ${row.quarantined} |`);
  }
}

async function runStatus(): Promise<void> {
  const result = await statusHandler({});
  const parsed = JSON.parse(result);
  if (parsed.error) {
    console.error("Error fetching status:", parsed.error);
    process.exit(1);
  }

  const domains = parsed.domains as Array<{
    name: string;
    ledger_count: number;
    consolidated_count: number;
    quarantine_count: number;
    last_consolidated_ts: number;
  }>;

  if (domains.length === 0) {
    console.log("No domains found. Run 'quorum init' then use learn_observe to add observations.");
    return;
  }

  console.log("| Domain | Ledger | Consolidated | Quarantine | Last Consolidated |");
  console.log("|--------|--------|--------------|------------|-------------------|");
  for (const d of domains) {
    const lastTs = d.last_consolidated_ts > 0
      ? new Date(d.last_consolidated_ts).toLocaleString()
      : "never";
    console.log(`| ${d.name} | ${d.ledger_count} | ${d.consolidated_count} | ${d.quarantine_count} | ${lastTs} |`);
  }
}

async function runDashboard(): Promise<void> {
  const config = await loadConfig();
  const port = config.dashboard.port;
  console.log(`Starting dashboard at http://127.0.0.1:${port}`);
  await import("../src/server.ts");
  // Bun keeps the process alive while the server is running
}

function printHelp(): void {
  console.log("Usage: quorum <subcommand> [options]");
  console.log("");
  console.log("Subcommands:");
  console.log("  init              Initialize config and register MCP server in Claude Code settings");
  console.log("  consolidate       Consolidate all domains (or a specific domain if provided)");
  console.log("  status            Print per-domain observation counts and last consolidation time");
  console.log("  dashboard         Start the HTTP dashboard server (http://127.0.0.1:4729)");
  console.log("  --help, -h        Show this help message");
}

const subcommand = Bun.argv[2];

switch (subcommand) {
  case "init":
    await runInit();
    break;
  case "consolidate":
    await runConsolidate(Bun.argv[3]);
    break;
  case "status":
    await runStatus();
    break;
  case "dashboard":
    await runDashboard();
    break;
  case "--help":
  case "-h":
    printHelp();
    process.exit(0);
    break;
  default:
    if (subcommand) {
      console.log(`Unknown command: ${subcommand}. Run 'quorum --help' for usage.`);
    } else {
      printHelp();
    }
    process.exit(1);
}
