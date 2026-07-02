// Read-only info commands: models, account, usage, workflows, assets.

import pc from "picocolors";
import { apiCall } from "../api.js";

const VALID_MODEL_TYPES = ["image", "video", "audio", "3d", "text"] as const;

type ModelsData = {
  count: number;
  models: {
    id: string;
    type: string;
    description: string;
    credit_cost_indicative: number;
    accessible_to_user: boolean;
  }[];
};

export async function listModels(opts: { type?: string; json?: boolean }): Promise<void> {
  if (opts.type && !VALID_MODEL_TYPES.includes(opts.type as (typeof VALID_MODEL_TYPES)[number])) {
    throw new Error(
      `Invalid --type '${opts.type}'. Must be one of: ${VALID_MODEL_TYPES.join(", ")}.`
    );
  }
  const params = opts.type ? `?type=${encodeURIComponent(opts.type)}` : "";
  const r = await apiCall<ModelsData>(`/api/v1/models${params}`);
  if (opts.json) {
    console.log(JSON.stringify(r.data, null, 2));
    return;
  }
  console.log(pc.dim(`${r.data.count} models${opts.type ? ` (type: ${opts.type})` : ""}`));
  console.log("");
  for (const m of r.data.models) {
    const lock = m.accessible_to_user ? "  " : pc.yellow("🔒");
    const cost = pc.dim(`${m.credit_cost_indicative}cr`);
    console.log(
      `${lock} ${pc.bold(m.id.padEnd(28))} ${m.type.padEnd(7)} ${cost.padStart(8)}  ${pc.dim(m.description.slice(0, 50))}`
    );
  }
}

type AccountData = {
  user_id: string;
  plan_name: string | null;
  status: string | null;
  token_source: string;
  credits: { available: number; subscription: number; purchased: number; monthly_grant: number };
  flags: { payment_failed: boolean; generation_frozen: boolean };
  spend_today: { hourly_credits: number; daily_credits: number; hourly_cap: number; daily_cap: number };
};

export async function showAccount(opts: { json?: boolean }): Promise<void> {
  const r = await apiCall<AccountData>("/api/v1/account");
  if (opts.json) {
    console.log(JSON.stringify(r.data, null, 2));
    return;
  }
  console.log(pc.bold("Account"));
  console.log(`  User ID:        ${r.data.user_id}`);
  console.log(`  Plan:           ${r.data.plan_name ?? "No Plan"}`);
  console.log(`  Status:         ${r.data.status ?? "—"}`);
  console.log(`  Token source:   ${r.data.token_source}`);
  console.log("");
  console.log(pc.bold("Credits"));
  console.log(`  Available:      ${r.data.credits.available.toLocaleString()}`);
  console.log(`  Subscription:   ${r.data.credits.subscription.toLocaleString()}`);
  console.log(`  Purchased:      ${r.data.credits.purchased.toLocaleString()}`);
  console.log(`  Monthly grant:  ${r.data.credits.monthly_grant.toLocaleString()}`);
  console.log("");
  console.log(pc.bold("Spend (this token)"));
  console.log(`  This hour:      ${r.data.spend_today.hourly_credits} / ${r.data.spend_today.hourly_cap}`);
  console.log(`  Today:          ${r.data.spend_today.daily_credits} / ${r.data.spend_today.daily_cap}`);
  if (r.data.flags.payment_failed) console.log(pc.red("  ⚠ Payment failed"));
  if (r.data.flags.generation_frozen) console.log(pc.red("  ⚠ Generation frozen"));
}

type UsageData = {
  summary: { total_credits_used: number; credits_by_source: Record<string, number> };
  events: { created_at: string; method: string; status_code: number; credits_used: number; route: string }[];
};

export async function showUsage(opts: { days?: string; json?: boolean }): Promise<void> {
  const days = Number(opts.days ?? 7);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const r = await apiCall<UsageData>(`/api/v1/usage?since=${encodeURIComponent(since)}`);
  if (opts.json) {
    console.log(JSON.stringify(r.data, null, 2));
    return;
  }
  console.log(pc.bold(`Usage (last ${days} days)`));
  console.log(`  Total: ${r.data.summary.total_credits_used.toLocaleString()} credits`);
  for (const [src, n] of Object.entries(r.data.summary.credits_by_source)) {
    console.log(`    ${src.padEnd(20)} ${n.toLocaleString()}`);
  }
  console.log("");
  console.log(pc.bold("Recent requests"));
  for (const e of r.data.events.slice(0, 20)) {
    const status = e.status_code < 400 ? pc.green(String(e.status_code)) : pc.red(String(e.status_code));
    console.log(
      `  ${pc.dim(e.created_at)} ${e.method.padEnd(5)} ${status} ${pc.bold(e.credits_used.toString().padStart(4))}cr  ${e.route}`
    );
  }
}

type WorkflowsData = {
  count: number;
  workflows: { id: string; name: string; node_count: number; estimated_credit_cost: number }[];
};

export async function listWorkflows(opts: { json?: boolean }): Promise<void> {
  const r = await apiCall<WorkflowsData>("/api/v1/workflows");
  if (opts.json) {
    console.log(JSON.stringify(r.data, null, 2));
    return;
  }
  console.log(pc.dim(`${r.data.count} workflows`));
  for (const wf of r.data.workflows) {
    console.log(
      `  ${pc.bold(wf.id.padEnd(36))} ${pc.dim(`${wf.node_count}n / ${wf.estimated_credit_cost}cr`.padEnd(12))} ${wf.name}`
    );
  }
}

// ── Assets: browse the user's own media libraries ──────────────
// uploads (files they brought in) + generations (things they made) +
// elements (Film Studio Cast / Sets / Props). Any returned URL feeds
// straight back into a generation via --ref / --refs.

const VALID_ASSET_SOURCES = ["uploads", "generations", "elements", "all"] as const;
const VALID_ASSET_KINDS = ["image", "video", "audio", "3d"] as const;

type AssetsData = {
  count: number;
  assets: {
    url: string;
    kind: string;
    label: string;
    source: string;
    created_at: string;
    element_id?: string;
    element_type?: string;
    description?: string | null;
  }[];
};

export async function listAssets(opts: {
  source?: string;
  kind?: string;
  limit?: string;
  json?: boolean;
}): Promise<void> {
  if (opts.source && !VALID_ASSET_SOURCES.includes(opts.source as (typeof VALID_ASSET_SOURCES)[number])) {
    throw new Error(`Invalid --source '${opts.source}'. Must be one of: ${VALID_ASSET_SOURCES.join(", ")}.`);
  }
  if (opts.kind && !VALID_ASSET_KINDS.includes(opts.kind as (typeof VALID_ASSET_KINDS)[number])) {
    throw new Error(`Invalid --kind '${opts.kind}'. Must be one of: ${VALID_ASSET_KINDS.join(", ")}.`);
  }
  const params = new URLSearchParams();
  if (opts.source) params.set("source", opts.source);
  if (opts.kind) params.set("kind", opts.kind);
  if (opts.limit) params.set("limit", opts.limit);
  const qs = params.size > 0 ? `?${params.toString()}` : "";

  const r = await apiCall<AssetsData>(`/api/v1/assets${qs}`);
  if (opts.json) {
    console.log(JSON.stringify(r.data, null, 2));
    return;
  }
  console.log(pc.dim(`${r.data.count} asset(s), newest first`));
  console.log("");
  for (const a of r.data.assets) {
    const tag = a.source === "element" ? `element:${a.element_type}` : `${a.kind}/${a.source}`;
    console.log(`  ${pc.bold(tag.padEnd(20))} ${a.label.slice(0, 32).padEnd(34)} ${pc.dim(a.url)}`);
  }
  console.log("");
  console.log(pc.dim("Use a URL as a reference: stensyl image \"...\" --ref <url>"));
}
