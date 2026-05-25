import { homedir } from "os";
import path from "path";
import { DEFAULT_CONFIG, DEFAULT_CONFIG_PATH, saveConfig } from "../src/config.ts";
import { expandHome, ensureStorageDirs } from "../src/paths.ts";

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

const subcommand = Bun.argv[2];

switch (subcommand) {
  case "init":
    await runInit();
    break;
  default:
    console.log("Usage: quorum <subcommand>");
    console.log("Subcommands: init");
    process.exit(1);
}
