// Local config — stored in ~/.stensyl/config.json with chmod 600 on Unix.
// On Windows we just write the file; ACLs are inherited from the user profile.

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".stensyl");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export type Config = {
  // Legacy pasted API key (pre-OAuth). Still honoured if present.
  api_key?: string;
  // OAuth device-flow token pair.
  access_token?: string;
  refresh_token?: string;
  access_expires_at?: number;
  api_url?: string;
  user_email?: string;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  // Best-effort permission lock on Unix-likes.
  if (process.platform !== "win32") {
    try {
      chmodSync(CONFIG_FILE, 0o600);
    } catch {
      // non-fatal
    }
  }
}

export function clearConfig(): void {
  saveConfig({});
}

// The bearer token to send with API calls. Priority: an explicit env override,
// then the OAuth access token, then a legacy pasted API key. (The gateway
// accepts both stensyl_at_ access tokens and stensyl_sk_ API keys.)
export function resolveAuthToken(): string | undefined {
  if (process.env.STENSYL_API_KEY) return process.env.STENSYL_API_KEY;
  const cfg = loadConfig();
  return cfg.access_token ?? cfg.api_key;
}

// Store a freshly issued OAuth token pair. `expires_in` is seconds.
export function saveTokens(tokens: TokenPair): void {
  const existing = loadConfig();
  saveConfig({
    ...existing,
    api_key: undefined, // moving to OAuth — drop any stale legacy key
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_expires_at: Date.now() + tokens.expires_in * 1000,
  });
}

// Legacy alias kept so older code paths still resolve.
export function resolveApiKey(): string | undefined {
  return resolveAuthToken();
}

export function resolveApiUrl(): string {
  return (
    process.env.STENSYL_API_URL ??
    loadConfig().api_url ??
    "https://stensyl.ai"
  );
}
