// Redirect console.log to stderr — stdout is reserved for MCP JSON-RPC frames
console.log = console.error.bind(console);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { name as shoutName, schema as shoutSchema, handler as shoutHandler } from "./tools/shout.ts";
import { name as recallName, schema as recallSchema, handler as recallHandler } from "./tools/recall.ts";
import { name as consolidateName, schema as consolidateSchema, handler as consolidateHandler } from "./tools/consolidate.ts";
import { name as contradictName, schema as contradictSchema, handler as contradictHandler } from "./tools/contradict.ts";
import { name as verifyName, schema as verifySchema, handler as verifyHandler } from "./tools/verify.ts";
import { name as statusName, schema as statusSchema, handler as statusHandler } from "./tools/status.ts";

const server = new McpServer(
  { name: "quorum", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.tool(shoutName, shoutSchema.shape, async (input) => {
  const text = await shoutHandler(input as Parameters<typeof shoutHandler>[0]);
  return { content: [{ type: "text", text }] };
});

server.tool(recallName, recallSchema.shape, async (input) => {
  const text = await recallHandler(input as Parameters<typeof recallHandler>[0]);
  return { content: [{ type: "text", text }] };
});

server.tool(consolidateName, consolidateSchema.shape, async (input) => {
  const text = await consolidateHandler(input as Parameters<typeof consolidateHandler>[0]);
  return { content: [{ type: "text", text }] };
});

server.tool(contradictName, contradictSchema.shape, async (input) => {
  const text = await contradictHandler(input as Parameters<typeof contradictHandler>[0]);
  return { content: [{ type: "text", text }] };
});

server.tool(verifyName, verifySchema.shape, async (input) => {
  const text = await verifyHandler(input as Parameters<typeof verifyHandler>[0]);
  return { content: [{ type: "text", text }] };
});

server.tool(statusName, statusSchema.shape, async (input) => {
  const text = await statusHandler(input as Parameters<typeof statusHandler>[0]);
  return { content: [{ type: "text", text }] };
});

const transport = new StdioServerTransport();

process.stderr.write(JSON.stringify({ level: "info", msg: "Quorum MCP server starting" }) + "\n");

await server.connect(transport);
