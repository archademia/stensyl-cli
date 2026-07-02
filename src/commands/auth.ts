import pc from "picocolors";
import ora, { type Ora } from "ora";
import { apiCall } from "../api.js";
import { saveConfig, loadConfig, clearConfig } from "../config.js";
import { requestDeviceCode, pollForToken, openBrowser, type DeviceCodeResponse } from "../oauth.js";

type AccountData = {
  user_id: string;
  plan_name: string | null;
  status: string | null;
  token_source: string;
  credits: { available: number; monthly_grant: number };
};

// Browser-based sign-in (OAuth 2.0 Device Authorization Grant). No keys to
// paste: the CLI prints a code, opens your browser, and waits for approval.
export async function login(opts: { json?: boolean }): Promise<void> {
  let device: DeviceCodeResponse;
  try {
    device = await requestDeviceCode();
  } catch (e) {
    return fail(opts, (e as Error).message);
  }

  if (opts.json) {
    // Machine mode: emit the verification details, then block on approval.
    console.log(
      JSON.stringify({
        verification_uri: device.verification_uri,
        verification_uri_complete: device.verification_uri_complete,
        user_code: device.user_code,
      })
    );
  } else {
    console.log("");
    console.log(`  Open ${pc.cyan(pc.underline(device.verification_uri))}`);
    console.log(`  and enter the code:  ${pc.bold(pc.green(device.user_code))}`);
    console.log("");
    console.log(pc.dim("  Opening your browser…"));
    openBrowser(device.verification_uri_complete);
  }

  const spinner: Ora | null = opts.json ? null : ora("Waiting for approval…").start();
  try {
    await pollForToken(device);
  } catch (e) {
    spinner?.fail("Sign-in failed");
    return fail(opts, (e as Error).message);
  }

  // Approved + tokens stored. Verify by calling /api/v1/account.
  try {
    const account = await apiCall<AccountData>("/api/v1/account");
    saveConfig({ ...loadConfig(), user_email: account.data.user_id });
    spinner?.succeed("Signed in");
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, account: account.data }));
    } else {
      console.log(`  Plan: ${pc.bold(account.data.plan_name ?? "No Plan")}`);
      console.log(
        `  Credits: ${pc.bold(account.data.credits.available.toLocaleString())} / ${account.data.credits.monthly_grant.toLocaleString()}`
      );
    }
  } catch (e) {
    clearConfig();
    spinner?.fail("Verification failed");
    return fail(opts, (e as Error).message);
  }
}

function fail(opts: { json?: boolean }, message: string): void {
  if (opts.json) {
    console.log(JSON.stringify({ ok: false, error: message }));
  } else {
    console.log(pc.red(`✗ ${message}`));
  }
  process.exit(1);
}

export async function logout(opts: { json?: boolean }): Promise<void> {
  clearConfig();
  if (opts.json) {
    console.log(JSON.stringify({ ok: true }));
  } else {
    console.log(pc.green("✓ Signed out. Local credentials cleared."));
    console.log(pc.dim("  This device's access has been removed locally."));
  }
}

export async function whoami(opts: { json?: boolean }): Promise<void> {
  try {
    const account = await apiCall<AccountData>("/api/v1/account");
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
