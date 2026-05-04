import prompts from "prompts";
import pc from "picocolors";
import { apiCall } from "../api.js";
import { saveConfig, loadConfig, clearConfig } from "../config.js";

export async function login(opts: { json?: boolean }): Promise<void> {
  const response = await prompts({
    type: "password",
    name: "key",
    message:
      "Paste your Stensyl API key (create one at https://stensyl.ai/api#keys):",
    validate: (val: string) =>
      val.startsWith("stensyl_sk_") || "Key must start with stensyl_sk_",
  });

  if (!response.key) {
    if (!opts.json) console.log(pc.yellow("Login cancelled."));
    process.exit(1);
  }

  // Save first so apiCall can pick it up.
  const existing = loadConfig();
  saveConfig({ ...existing, api_key: response.key });

  // Verify by calling /api/v1/account.
  try {
    const account = await apiCall<{ user_id: string; tier: string | null; plan_name: string | null; credits: { available: number; monthly_grant: number } }>("/api/v1/account");
    saveConfig({ ...loadConfig(), user_email: account.data.user_id });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, account: account.data }));
    } else {
      console.log(pc.green("✓ Signed in"));
      console.log(`  Plan: ${pc.bold(account.data.plan_name ?? "No Plan")}`);
      console.log(
        `  Credits: ${pc.bold(account.data.credits.available.toLocaleString())} / ${account.data.credits.monthly_grant.toLocaleString()}`
      );
    }
  } catch (e) {
    clearConfig();
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: (e as Error).message }));
    } else {
      console.log(pc.red(`✗ Verification failed: ${(e as Error).message}`));
      console.log(pc.dim("  Key was not saved."));
    }
    process.exit(1);
  }
}

export async function logout(opts: { json?: boolean }): Promise<void> {
  clearConfig();
  if (opts.json) {
    console.log(JSON.stringify({ ok: true }));
  } else {
    console.log(pc.green("✓ Signed out. Local credentials cleared."));
    console.log(pc.dim("  Revoke the key from https://stensyl.ai/api#keys to prevent further use."));
  }
}

export async function whoami(opts: { json?: boolean }): Promise<void> {
  try {
    const account = await apiCall<{
      user_id: string;
      tier: string | null;
      plan_name: string | null;
      status: string | null;
      credits: { available: number; monthly_grant: number };
      token_source: string;
    }>("/api/v1/account");

    if (opts.json) {
      console.log(JSON.stringify(account.data, null, 2));
    } else {
      console.log(`${pc.bold("User:")}    ${account.data.user_id}`);
      console.log(`${pc.bold("Plan:")}    ${account.data.plan_name ?? "No Plan"}`);
      console.log(`${pc.bold("Status:")}  ${account.data.status ?? "—"}`);
      console.log(
        `${pc.bold("Credits:")} ${account.data.credits.available.toLocaleString()} / ${account.data.credits.monthly_grant.toLocaleString()}`
      );
      console.log(`${pc.bold("Source:")}  ${account.data.token_source}`);
    }
  } catch (e) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: (e as Error).message }));
    } else {
      console.log(pc.red(`✗ ${(e as Error).message}`));
    }
    process.exit(1);
  }
}
