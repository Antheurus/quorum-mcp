import { z } from "zod";
import { readConsolidated } from "../storage/consolidated.ts";

export const name = "learn_recall";

export const schema = z.object({
  domain: z.string().describe("Knowledge domain to recall from"),
  hint: z.string().optional().describe("Optional substring to filter chunks by relevance"),
  max_tokens: z.number().int().positive().default(4000).describe("Approximate token budget for response (1 token ≈ 4 chars). Default 4000"),
});

type RecallInput = z.infer<typeof schema>;

function buildVersionHeader(domain: string, hash: string): string {
  const ts = new Date().toISOString();
  return `<!-- quorum | domain=${domain} | content_hash=${hash} | recall_ts=${ts} -->`;
}

function splitByHeaders(markdown: string): string[] {
  // Split on ## headings; each chunk starts with "## "
  const parts = markdown.split(/(?=^## )/m);
  return parts.filter((p) => p.trim() !== "");
}

function scoreChunk(chunk: string, hint: string): number {
  const lower = chunk.toLowerCase();
  const hintLower = hint.toLowerCase();
  let count = 0;
  let idx = lower.indexOf(hintLower);
  while (idx !== -1) {
    count++;
    idx = lower.indexOf(hintLower, idx + 1);
  }
  return count;
}

export async function handler(input: RecallInput): Promise<string> {
  try {
    const result = await readConsolidated(input.domain);

    if (!result) {
      const header = buildVersionHeader(input.domain, "");
      return `${header}\n\n(no consolidated knowledge for domain: ${input.domain})`;
    }

    const { entries, hash } = result;
    const header = buildVersionHeader(input.domain, hash);

    // Reconstruct markdown from the file (re-read raw to preserve section structure)
    // We operate on the entries to produce canonical markdown chunks
    const allChunks = entries.map((e) => {
      return [
        `## ${e.obs_id}`,
        `**status**: ${e.status}`,
        `**claim**: ${e.claim}`,
        `**evidence_refs**: ${e.evidence_refs.join(", ")}`,
        `**confirmed_by**: ${e.confirmed_by.join(", ")}`,
        `**ttl_expires_at**: ${e.ttl_expires_at}`,
        `**last_verified_at**: ${e.last_verified_at}`,
      ].join("\n");
    });

    const maxChars = (input.max_tokens ?? 4000) * 4;

    let selectedChunks: string[];
    if (input.hint) {
      // Score and sort by relevance, keep top until budget exhausted
      const scored = allChunks.map((chunk) => ({
        chunk,
        score: scoreChunk(chunk, input.hint!),
      }));
      scored.sort((a, b) => b.score - a.score);

      selectedChunks = [];
      let budget = maxChars - header.length - 2; // 2 for newlines
      for (const { chunk } of scored) {
        if (budget <= 0) break;
        selectedChunks.push(chunk);
        budget -= chunk.length + 2;
      }
    } else {
      // No hint — take chunks in order until budget exhausted
      selectedChunks = [];
      let budget = maxChars - header.length - 2;
      for (const chunk of allChunks) {
        if (budget <= 0) break;
        selectedChunks.push(chunk);
        budget -= chunk.length + 2;
      }
    }

    const body = selectedChunks.join("\n\n");
    return `${header}\n\n${body}`;
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}
