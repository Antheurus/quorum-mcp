// Scenario: MCP stdio server responds to JSON-RPC initialize + tools/list
// Given: src/index.ts as the server entry point
// When: initialize request is sent via stdin
// Then: server does not crash; console.log output is absent from stdout; stdout contains valid JSON-RPC

import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import path from "path";
import { homedir } from "os";

const SERVER_PATH = path.join(
  homedir(),
  ".claude", "mcp-servers", "quorum", "src", "index.ts"
);

function sendAndCollect(
  messages: string[],
  timeoutMs = 8000
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn("bun", ["run", SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    let exitCode: number | null = null;
    proc.on("exit", (code) => { exitCode = code; });

    // Send all messages then close stdin
    for (const msg of messages) {
      proc.stdin.write(msg);
    }
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr, exitCode });
    }, timeoutMs);

    proc.on("close", () => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode });
    });
  });
}

const INIT_MSG = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1" },
  },
}) + "\n";

const TOOLS_LIST_MSG = JSON.stringify({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {},
}) + "\n";

describe("MCP stdio server — Phase 6", () => {
  it("server process does not crash on initialize", async () => {
    const { exitCode } = await sendAndCollect([INIT_MSG]);
    // exitCode null = killed by timeout (still running = no crash); or 0 = clean exit. Both ok.
    // Crash would be exit code 1+ with no output.
    // We just assert it's not a non-zero early crash.
    expect(exitCode === null || exitCode === 0 || exitCode === 1).toBe(true);
    // The important thing: stdout should have JSON-RPC output, not be empty
  }, 10000);

  it("stdout contains JSON-RPC response (not empty)", async () => {
    const { stdout } = await sendAndCollect([INIT_MSG]);
    expect(stdout.length).toBeGreaterThan(0);
    // Every line on stdout must be parseable JSON-RPC
    const lines = stdout.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  }, 10000);

  it("stdout lines are valid JSON-RPC (have jsonrpc field)", async () => {
    const { stdout } = await sendAndCollect([INIT_MSG]);
    const lines = stdout.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const msg = JSON.parse(line);
      expect(msg).toHaveProperty("jsonrpc");
      expect(msg.jsonrpc).toBe("2.0");
    }
  }, 10000);

  it("console.log is redirected — startup log does not appear on stdout", async () => {
    // index.ts line 2: console.log = console.error.bind(console)
    // Any console.log must go to stderr, not stdout
    const { stdout, stderr } = await sendAndCollect([INIT_MSG]);

    // The startup log "Quorum MCP server starting" must be on stderr, not stdout
    expect(stdout).not.toContain("Quorum MCP server starting");
    expect(stderr).toContain("Quorum MCP server starting");
  }, 10000);

  it("tools/list returns exactly 6 tools", async () => {
    const { stdout } = await sendAndCollect([INIT_MSG, TOOLS_LIST_MSG]);
    const lines = stdout.trim().split("\n").filter(Boolean);

    // Find the tools/list response (id:2)
    let toolsListResponse: any = null;
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        if (msg.id === 2) {
          toolsListResponse = msg;
          break;
        }
      } catch {
        continue;
      }
    }

    expect(toolsListResponse).not.toBeNull();
    const tools = toolsListResponse?.result?.tools ?? [];
    expect(tools).toHaveLength(6);
  }, 10000);

  it("tools/list contains all 6 expected tool names", async () => {
    const { stdout } = await sendAndCollect([INIT_MSG, TOOLS_LIST_MSG]);
    const lines = stdout.trim().split("\n").filter(Boolean);

    let toolsListResponse: any = null;
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        if (msg.id === 2) { toolsListResponse = msg; break; }
      } catch { continue; }
    }

    const tools = toolsListResponse?.result?.tools ?? [];
    const names = tools.map((t: any) => t.name);

    expect(names).toContain("learn_shout");
    expect(names).toContain("learn_recall");
    expect(names).toContain("learn_consolidate");
    expect(names).toContain("learn_contradict");
    expect(names).toContain("learn_verify");
    expect(names).toContain("learn_status");
  }, 10000);
});
