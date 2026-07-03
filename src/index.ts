#!/usr/bin/env node
// @stensyl/cli — Stensyl from your terminal.
//
// Auth: browser sign-in via `stensyl auth login` (OAuth device flow).
// Storage: ~/.stensyl/config.json (chmod 600 on Unix).
// Override: STENSYL_API_KEY env var (useful for CI).

import { Command } from "commander";
import pc from "picocolors";
import { login, logout, whoami } from "./commands/auth.js";
import { generate, type GenerateKind } from "./commands/generate.js";
import { status as jobStatus, wait as jobWait } from "./commands/jobs.js";
import { listModels, showAccount, showUsage, listWorkflows, listAssets } from "./commands/info.js";
import { listElements, createElement } from "./commands/elements.js";
import { configSet, configGet, configUnset } from "./commands/config.js";
import { CliApiError } from "./api.js";

const program = new Command();

program
  .name("stensyl")
  .description("Stensyl from your terminal — generate images, video, and audio via the Stensyl API.")
  .version("0.4.0");

// ── Auth ─────────────────────────────────────────────────────
const auth = program.command("auth").description("Authenticate with Stensyl");
auth
  .command("login")
  .description("Sign in with your Stensyl account (opens your browser)")
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
function addGenCommands(kind: GenerateKind) {
  const cmd = program
    .command(`${kind} <prompt>`)
    .description(`Generate ${kind === "3d" ? "a 3D model" : kind}`)
    .option("--model <id>", "Model ID (defaults to a sensible per-kind default)")
    .option("--resolution <res>", "e.g. 1K, 2K, 720p, 1080p")
    .option("--aspect-ratio <ratio>", "e.g. 16:9, 1:1, 9:16")
    .option("--ref <url>", "Reference image URL")
    .option("--refs <urls...>", "Multiple reference image URLs")
    .option("--element <names...>", "Reference Cast/Sets/Props BY NAME from your library (e.g. --element \"Kelly\" \"Yorkie\")")
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
  .action(async (jobId: string, opts) => {
    await jobStatus(jobId, opts);
  });
jobs
  .command("wait <jobId>")
  .description("Long-poll a job until completion")
  .option("--json", "Output JSON")
  .action(async (jobId: string, opts) => {
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

// ── Library ─────────────────────────────────────────────────
program
  .command("assets")
  .description("Browse your media libraries — uploads, generations, and elements")
  .option("--source <source>", "Filter: uploads | generations | elements | all (default all)")
  .option("--kind <kind>", "Filter: image | video | audio | 3d")
  .option("--limit <n>", "Max items (1-50, default 15)")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    await listAssets(opts);
  });
program
  .command("elements")
  .description("List your Film Studio Cast / Sets / Props library")
  .option("--limit <n>", "Max items (1-50, default 50)")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    await listElements(opts);
  });
program
  .command("element <type> <name>")
  .description("Create a Film Studio element (character | set | prop) and save it to your library")
  .requiredOption("--desc <description>", "Plain subject description — who/what, features, wardrobe/materials")
  .option("--ref <url>", "Reference image URL to base the element on")
  .option("--refs <urls...>", "Multiple reference image URLs (up to 6)")
  .option("--out <path>", "Also save the reference sheet PNG to a file")
  .option("--json", "Output JSON")
  .action(async (type: string, name: string, opts) => {
    await createElement(type, name, opts);
  });

// ── Config ──────────────────────────────────────────────────
const config = program
  .command("config")
  .description("View or set CLI defaults (output dir, per-kind default model)");
config
  .command("set <key> <value>")
  .description("Set a default, e.g. config set output_dir ~/stensyl-out")
  .option("--json", "Output JSON")
  .action(async (key: string, value: string, opts) => {
    await configSet(key, value, opts);
  });
config
  .command("get [key]")
  .description("Show all defaults, or one key")
  .option("--json", "Output JSON")
  .action(async (key: string | undefined, opts) => {
    await configGet(key, opts);
  });
config
  .command("unset <key>")
  .description("Clear a default")
  .option("--json", "Output JSON")
  .action(async (key: string, opts) => {
    await configUnset(key, opts);
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
    const err = e as { code?: string; message?: string };
    if (err.code === "commander.help" || err.code === "commander.helpDisplayed") {
      process.exit(0);
    }
    if (err.code === "commander.version") {
      process.exit(0);
    }
    if (err.code === "commander.unknownCommand" || err.code === "commander.missingArgument" || err.code === "commander.missingMandatoryOptionValue") {
      // commander has already printed the error
      process.exit(1);
    }
    console.error(pc.red(`✗ ${err.message}`));
    process.exit(1);
  }
})();
