// OAuth 2.0 Device Authorization Grant (RFC 8628) client for `stensyl auth login`.
// No pasted keys: the user approves in a browser, the CLI polls for tokens.

import { spawn } from "node:child_process";
import { resolveApiUrl, saveTokens, loadConfig, saveConfig, type TokenPair } from "./config.js";

const CLIENT_ID = "stensyl-cli";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
};

function base(): string {
  return resolveApiUrl().replace(/\/$/, "");
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(`${base()}/api/oauth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.device_code) {
    throw new Error(body?.error_description ?? `Could not start login (${res.status})`);
  }
  return body as DeviceCodeResponse;
}

// Poll the token endpoint until the user approves (or the code expires).
export async function pollForToken(d: DeviceCodeResponse): Promise<void> {
  const deadline = Date.now() + d.expires_in * 1000;
  let intervalMs = Math.max(1, d.interval) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const res = await fetch(`${base()}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: DEVICE_GRANT,
        device_code: d.device_code,
        client_id: CLIENT_ID,
      }),
    });
    const body = await res.json().catch(() => null);

    if (res.ok && body?.access_token) {
      saveTokens(body as TokenPair);
      return;
    }

    const err = body?.error;
    if (err === "authorization_pending") continue;
    if (err === "slow_down") {
      intervalMs += 5000;
      continue;
    }
    if (err === "access_denied") throw new Error("Sign-in was denied in the browser.");
    if (err === "expired_token") throw new Error("The login timed out. Run `stensyl auth login` again.");
    throw new Error(body?.error_description ?? `Login failed (${res.status})`);
  }
  throw new Error("The login timed out. Run `stensyl auth login` again.");
}

// Exchange the stored refresh token for a fresh access+refresh pair.
// Returns the new access token, or null if there's nothing to refresh.
export async function refreshTokens(): Promise<string | null> {
  const cfg = loadConfig();
  if (!cfg.refresh_token) return null;

  const res = await fetch(`${base()}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: cfg.refresh_token,
      client_id: CLIENT_ID,
    }),
  });
  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.access_token) {
    // Refresh failed (revoked/expired) — clear the dead tokens so the next call
    // gives a clean "not signed in".
    saveConfig({ ...cfg, access_token: undefined, refresh_token: undefined, access_expires_at: undefined });
    return null;
  }
  saveTokens(body as TokenPair);
  return body.access_token as string;
}

// Best-effort open the verification URL in the user's browser. If it fails,
// the printed URL is the fallback.
export function openBrowser(url: string): void {
  try {
    const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // ignore — the printed URL is the fallback
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
