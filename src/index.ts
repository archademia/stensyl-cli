#!/usr/bin/env node
// @stensyl/cli — Stensyl from your terminal.
//
// Auth: paste an API key from https://stensyl.ai/api#keys.
// Storage: ~/.stensyl/config.json (chmod 600 on Unix).
// Override: STENSYL_API_KEY env var (useful for CI).

import { Command } from "commander";
import pc from "picocolors";
import { login, logout, whoami } from "./commands/auth.js";
import { generate } from "./commands/generate.js";
import { status as jobStatus, wait as jobWait } from "./commands/jobs.js";
import { listModels, showAccount, showUsage, listWorkflows } from "./commands/info.js";
import { CliApiError } from "./api.js";

const program = new Command();

program
  .name("stensyl")
  .description("Stensyl from your terminal — generate images, video, and audio via the Stensyl API.")
  .version("0.1.0");

// ── Auth ─────────────────────────────────────────────────────
const auth = program.command("auth").description("Authenticate with Stensyl");
auth
  .command("login")
  .description("Sign in with an API key (create one at https://stensyl.ai/api#keys)")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    await login(opts);
  });
auth
  .command("logout")
  .description("Clear local credentials")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    await logout(opts);
  });
auth
  .command("whoami")
  .description("Show the currently authenticated account")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    await whoami(opts);
  });

// ── Generation ──────────────────────────────────────────────
function addGenCommands(kind: "image" | "video" | "audio" | "3d" | "text") {
  const cmd = program
    .command(`${kind} <prompt>`)
    .description(`Generate ${kind === "3d" ? "a 3D model" : kind}`)
    .option("--model <id>", "Model ID (defaults to a sensible per-kind default)")
    .option("--resolution <res>", "e.g. 1K, 2K, 720p, 1080p")
    .option("--aspect-ratio <ratio>", "e.g. 16:9, 1:1, 9:16")
    .option("--ref <url>", "Reference image URL")
    .option("--refs <urls...>", "Multiple reference image URLs")
    .option("--out <path>", "Output file path (default: ./<job_id>.<ext>)")
    .option("--json", "Output JSON")
    .option("--no-wait", "Return immediately with job_id (don't poll)");

  if (kind === "video" || kind === "audio") {
    cmd.option("--duration <seconds>", "Duration in seconds");
  }
  if (kind === "video") {
    cmd
      .option("--end-frame <url>", "End-frame image URL (first-last-frame mode)")
      .option("--voice-control", "Enable voice control (Kling)")
      .option("--voice-ref <url>", "Voice reference audio URL");
  }
  if (kind === "audio") {
    cmd.option("--tts-variant <variant>", "ElevenLabs TTS variant: flash | v2", "flash");
  }

  cmd.action(async (prompt: string, opts) => {
    await generate(kind, prompt, opts);
  });
}

addGenCommands("image");
addGenCommands("video");
addGenCommands("audio");
addGenCommands("3d");
addGenCommands("text");

// ── Jobs ────────────────────────────────────────────────────
const jobs = program.command("jobs").description("Inspect and wait on async jobs");
jobs
  .command("status <jobId>")
  .description("Get the current state of a job")
  .option("--json", "Output JSON")
  .action(async (jobId, opts) => {
    await jobStatus(jobId, opts);
  });
jobs
  .command("wait <jobId>")
  .description("Long-poll a job until completion")
  .option("--json", "Output JSON")
  .action(async (jobId, opts) => {
    await jobWait(jobId, opts);
  });

// ── Info ────────────────────────────────────────────────────
program
  .command("models")
  .description("List available models (filtered by your tier access)")
  .option("--type <type>", "Filter: image | video | audio | 3d | text")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    await listModels(opts);
  });

program
  .command("account")
  .description("Show plan, credits, and spend caps")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    await showAccount(opts);
  });

program
  .command("usage")
  .description("Show recent API requests and credit spend")
  .option("--days <days>", "Window in days (default 7)", "7")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    await showUsage(opts);
  });

program
  .command("workflows")
  .description("List your saved workflows")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    await listWorkflows(opts);
  });

// ── Error handling ──────────────────────────────────────────
program.exitOverride();

(async () => {
  try {
    await program.parseAsync();
  } catch (e) {
    if (e instanceof CliApiError) {
      console.error(pc.red(`✗ ${e.type}: ${e.message}`));
      console.error(pc.dim(`  request_id: ${e.requestId}`));
      if (e.type === "auth") {
        console.error(pc.dim(`  Try: stensyl auth login`));
      }
      process.exit(1);
    }
    if ((e as { code?: string }).code === "commander.help" || (e as { code?: string }).code === "commander.helpDisplayed") {
      process.exit(0);
    }
    if ((e as { code?: string }).code === "commander.version") {
      process.exit(0);
    }
    if ((e as { code?: string }).code === "commander.unknownCommand" || (e as { code?: string }).code === "commander.missingArgument") {
      // commander has already printed the error
      process.exit(1);
    }
    console.error(pc.red(`✗ ${(e as Error).message}`));
    process.exit(1);
  }
})();
