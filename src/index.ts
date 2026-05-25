import { loadConfig } from "./config.ts";

const config = await loadConfig();
console.log("Quorum MCP server starting — config loaded, version " + config.version);
