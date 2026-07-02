// Thin fetch wrapper around the Stensyl REST gateway.

import { resolveAuthToken, resolveApiUrl } from "./config.js";
import { refreshTokens } from "./oauth.js";

export type ApiError = {
  status: "error";
  error: { type: string; message: string; details?: Record<string, unknown> };
  credits: { remaining: number | null };
  request_id: string;
};

export type ApiSuccess<T> = {
  status: "completed" | "processing";
  data: T;
  credits: { used: number; remaining: number | null };
  request_id: string;
};

export class CliApiError extends Error {
  type: string;
  details?: Record<string, unknown>;
  requestId: string;
  constructor(payload: ApiError) {
    super(payload.error.message);
    this.type = payload.error.type;
    this.details = payload.error.details;
    this.requestId = payload.request_id;
  }
}

export async function apiCall<T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
): Promise<ApiSuccess<T>> {
  const url = resolveApiUrl().replace(/\/$/, "") + path;

  const doFetch = async (token: string | undefined) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "@stensyl/cli",
      ...((init?.headers ?? {}) as Record<string, string>),
    };
    if (!init?.skipAuth) {
      if (!token) throw new Error("Not signed in. Run: stensyl auth login");
      headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(url, { ...init, headers });
  };

  let res = await doFetch(resolveAuthToken());

  // Access token expired? Refresh once (device-flow tokens last ~1h) and retry.
  if (res.status === 401 && !init?.skipAuth) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      res = await doFetch(refreshed);
    }
  }

  const body = await res.json().catch(() => null);

  if (!res.ok || (body && body.status === "error")) {
    throw new CliApiError(body as ApiError);
  }

  return body as ApiSuccess<T>;
}

export async function downloadToFile(url: string, dest: string): Promise<void> {
  const { writeFileSync } = await import("node:fs");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}
