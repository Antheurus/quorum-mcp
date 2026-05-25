# quorum

Knowledge consolidation MCP server for Claude Code. Observes, clusters, and promotes project knowledge across domains — so your AI remembers what works and forgets what doesn't.

---

## Install

30-second path:

```bash
git clone <repo-or-copy>
cd ~/.claude/mcp-servers/quorum
bun install
bun bin/quorum.ts init
```

`init` creates `config.json`, sets up storage directories, and optionally registers the MCP server in `~/.claude/settings.json`.

---

## Claude Code registration

Run `quorum init` — it handles this interactively. Or add manually to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "quorum": {
      "command": "bun",
      "args": ["/Users/<you>/.claude/mcp-servers/quorum/src/index.ts"]
    }
  }
}
```

Replace `<you>` with your macOS username. Restart Claude Code after editing.

---

## Dashboard

Start the web UI:

```bash
bun bin/quorum.ts dashboard
```

Then open: [http://127.0.0.1:4729](http://127.0.0.1:4729)

The dashboard shows per-domain ledger stats, consolidated knowledge, quarantine pairs, and lets you trigger consolidation or update API keys.

---

## Backup

The `data/` directory lives inside the repo at `~/.claude/mcp-servers/quorum/data/`. It is **not** tracked by git. Back it up separately before reinstalling, or symlink it to a safe location:

```bash
# Move data out, then symlink
mv ~/.claude/mcp-servers/quorum/data ~/quorum-data-backup
ln -s ~/quorum-data-backup ~/.claude/mcp-servers/quorum/data
```

Reinstalling from git wipes the `data/` directory unless it is explicitly preserved or symlinked.

---

## Periodic consolidation

Add a crontab entry to consolidate every 15 minutes:

```cron
*/15 * * * * cd ~/.claude/mcp-servers/quorum && bun bin/quorum.ts consolidate
```

Edit with `crontab -e`.

Or use the `loop` skill inside Claude Code:

```
/loop 15m quorum consolidate
```

---

## CLI reference

```
quorum init              Initialize config and register MCP server
quorum consolidate       Consolidate all domains
quorum consolidate <d>   Consolidate a specific domain
quorum status            Print per-domain counts + last consolidation time
quorum dashboard         Start HTTP dashboard (http://127.0.0.1:4729)
quorum --help            Show help
```

---

## Troubleshooting

**Config not found**

```
Error: config.json not found
```

Run `bun bin/quorum.ts init` to create the default config.

---

**Port conflict**

```
Error: listen EADDRINUSE: address already in use 127.0.0.1:4729
```

Edit `config.json` and change `dashboard.port` to a free port:

```json
{
  "dashboard": {
    "port": 4730
  }
}
```

---

**API key invalid**

Similarity engines that need an API key (claude-haiku, openai, gemini) will log an auth error during consolidation. Update your key via the Settings page at [http://127.0.0.1:4729](http://127.0.0.1:4729), or edit `config.json` directly under `similarity.api_keys`.
