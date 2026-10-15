// The THOOK prize agent (Claude). The deterministic scorer ranks the week's
// losers; Claude then audits the top candidates and may DISQUALIFY wallets
// that aren't real holders (pools, routers, bridges, exchanges, contracts that
// aren't user wallets, obvious farming) — with a written reason that goes into
// the public report. Claude can never pick a winner outside the ranking or
// reorder it: final winners = ranking minus disqualified, top N.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "./config.js";

const Verdict = z.object({
  disqualified: z.array(z.object({ address: z.string(), reason: z.string() })),
  summary: z.string(),
  announcement: z.string(),
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["disqualified", "summary", "announcement"],
  properties: {
    disqualified: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["address", "reason"],
        properties: { address: { type: "string" }, reason: { type: "string" } },
      },
    },
    summary: { type: "string" },
    announcement: { type: "string" },
  },
};

const SYSTEM = `You are the THOOK prize auditor.
$THOOK (Tax Hook) is a token on Robinhood Chain. Every swap pays a 4% ETH tax; once a week the whole pot is airdropped to the holder whose ENTIRE on-chain portfolio lost the most USD that week.

A deterministic scorer has already ranked the candidates. Rules it applied:
- loss per asset = (lowest balance held during the week) × (price at week start − price at week end); portfolio loss = sum over all assets, gains offset losses.
- only wallets holding the minimum THOOK in every daily snapshot qualify.

Your job is ONLY to protect the prize from non-human or abusive recipients. Disqualify a candidate if, and only if, the evidence shows it is:
- a contract that is not a personal wallet (DEX pool, router, vault, bridge, exchange hot wallet, token contract, multisig treasury of a project). EIP-7702 delegated wallets and personal smart wallets are personal wallets;
- clearly part of a farming setup (e.g. the loss comes almost entirely from a token with no real market, with near-zero liquidity, or from a price that was clearly manipulated).
When unsure, do NOT disqualify — a real person who lost money is exactly who this prize is for. Never disqualify for being large, small, new, or for the size of the loss.

Then write:
- summary: 2–4 plain sentences for the public report explaining who won and why (cite the biggest losing assets), and any disqualifications.
- announcement: one short, upbeat post for X (max 260 characters) congratulating the winner (shortened address 0x1234…abcd), stating the ETH amount, no hashtags spam (at most one: $THOOK).`;

export async function reviewCandidates({ epoch, candidates, potEth, ethUsd, topN }) {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY not set", disqualified: [] };
  const client = new Anthropic();
  const payload = {
    epoch,
    potEth,
    potUsd: ethUsd ? potEth * ethUsd : null,
    winnersToPay: topN,
    candidates: candidates.map((c, i) => ({
      rank: i + 1,
      address: c.address,
      lossUsd: Math.round(c.lossUsd * 100) / 100,
      lossPct: Math.round(c.lossPct * 100) / 100,
      startValueUsd: Math.round(c.startValueUsd),
      endValueUsd: Math.round(c.endValueUsd),
      biggestLosingAssets: c.assets.slice(0, 6).map((a) => ({
        asset: a.asset === "eth" ? "ETH" : a.symbol ? `${a.symbol} (${a.asset})` : a.asset,
        held: a.held,
        priceStart: a.priceStart,
        priceEnd: a.priceEnd,
        lossUsd: Math.round(a.lossUsd * 100) / 100,
        liquidityUsd: a.liquidityUsd ?? null,
      })),
      onchain: c.facts,
    })),
  };
  try {
    const res = await client.beta.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `Audit this week's ranking and respond with the JSON verdict.\n\n${JSON.stringify(payload, null, 2)}` }],
    });
    if (res.stop_reason === "refusal") return { ok: false, error: "model refused", disqualified: [] };
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = Verdict.safeParse(JSON.parse(text));
    if (!parsed.success) return { ok: false, error: "invalid verdict JSON", disqualified: [] };
    const known = new Set(candidates.map((c) => c.address.toLowerCase()));
    const disqualified = parsed.data.disqualified.filter((d) => known.has(d.address.toLowerCase()));
    return { ok: true, model: res.model, ...parsed.data, disqualified };
  } catch (err) {
    if (err instanceof Anthropic.APIError) return { ok: false, error: `Claude API ${err.status}: ${err.message}`, disqualified: [] };
    return { ok: false, error: String(err?.message || err), disqualified: [] };
  }
}
