// Local config — stored in ~/.stensyl/config.json with chmod 600 on Unix.
// On Windows we just write the file; ACLs are inherited from the user profile.

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".stensyl");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export type Config = {
  api_key?: string;
  api_url?: string;
  user_email?: string;
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

export function resolveApiKey(): string | undefined {
  return process.env.STENSYL_API_KEY ?? loadConfig().api_key;
}

export function resolveApiUrl(): string {
  return (
    process.env.STENSYL_API_URL ??
    loadConfig().api_url ??
    "https://stensyl.ai"
  );
}
