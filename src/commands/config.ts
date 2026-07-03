// `stensyl config` — view + set user defaults (stored in ~/.stensyl/config.json).
//
//   stensyl config set output_dir ~/stensyl-out
//   stensyl config set default_model_image gpt-image
//   stensyl config get                 — list all defaults
//   stensyl config get output_dir      — one value
//   stensyl config unset output_dir    — clear one
//
// Credentials (access_token / refresh_token / api_key) are NEVER settable or
// printable here — those are managed by `stensyl auth`.

import pc from "picocolors";
import { loadConfig, saveConfig, SETTABLE_KEYS, type Config } from "../config.js";

const SETTABLE = new Set<string>(SETTABLE_KEYS);
const SECRET = new Set(["access_token", "refresh_token", "api_key", "access_expires_at"]);

export async function configSet(key: string, value: string, opts: { json?: boolean }): Promise<void> {
  if (!SETTABLE.has(key)) {
    throw new Error(`Unknown config key '${key}'.\n  Settable: ${[...SETTABLE].join(", ")}`);
  }
  const cfg = loadConfig();
  (cfg as Record<string, unknown>)[key] = value;
  saveConfig(cfg);
  if (opts.json) console.log(JSON.stringify({ ok: true, key, value }));
  else console.log(pc.green(`✔ ${key} = ${value}`));
}

export async function configUnset(key: string, opts: { json?: boolean }): Promise<void> {
  if (!SETTABLE.has(key)) {
    throw new Error(`Unknown config key '${key}'.\n  Settable: ${[...SETTABLE].join(", ")}`);
  }
  const cfg = loadConfig();
  delete (cfg as Record<string, unknown>)[key];
  saveConfig(cfg);
  if (opts.json) console.log(JSON.stringify({ ok: true, key, value: null }));
  else console.log(pc.green(`✔ ${key} cleared`));
}

export async function configGet(key: string | undefined, opts: { json?: boolean }): Promise<void> {
  const cfg = loadConfig() as Record<string, unknown>;
  if (key) {
    if (SECRET.has(key)) throw new Error(`'${key}' is a credential — managed via 'stensyl auth', not shown here.`);
    const v = cfg[key];
    if (opts.json) console.log(JSON.stringify({ [key]: v ?? null }));
    else console.log(v != null ? String(v) : pc.dim("(not set)"));
    return;
  }
  // No key → list all settable defaults + a masked auth summary.
  const view: Record<string, unknown> = {};
  for (const k of SETTABLE_KEYS) view[k] = cfg[k] ?? null;
  const signedIn = Boolean(cfg.access_token || cfg.api_key);
  if (opts.json) {
    console.log(JSON.stringify({ ...view, signed_in: signedIn, user_email: cfg.user_email ?? null }, null, 2));
    return;
  }
  console.log(pc.dim("Defaults (set with: stensyl config set <key> <value>)"));
  console.log("");
  for (const [k, v] of Object.entries(view)) {
    console.log(`  ${pc.bold(k.padEnd(22))} ${v != null ? String(v) : pc.dim("(not set)")}`);
  }
  console.log("");
  console.log(`  ${pc.dim("signed in".padEnd(22))} ${signedIn ? pc.green(String(cfg.user_email ?? "yes")) : pc.dim("no — run: stensyl auth login")}`);
}

// Resolve the effective default model for a kind: config override → built-in.
export function configuredModel(kind: string): string | undefined {
  const cfg = loadConfig() as Record<string, unknown>;
  const v = cfg[`default_model_${kind}`];
  return typeof v === "string" && v ? v : undefined;
}

// Resolve the effective output directory (config → cwd handled by caller).
export function configuredOutputDir(): string | undefined {
  const dir = loadConfig().output_dir;
  return dir && dir.trim() ? dir : undefined;
}
