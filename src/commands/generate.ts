import { writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import ora, { type Ora } from "ora";
import pc from "picocolors";
import { apiCall, downloadToFile } from "../api.js";

export type GenerateKind = "image" | "video" | "audio" | "3d" | "text";

type GenerateOptions = {
  model?: string;
  resolution?: string;
  aspectRatio?: string;
  duration?: string;
  ref?: string;
  refs?: string[];
  element?: string[];
  endFrame?: string;
  voiceControl?: boolean;
  voiceRef?: string;
  ttsVariant?: string;
  out?: string;
  json?: boolean;
  noWait?: boolean;
};

type GenerationData = {
  generation_id?: string;
  job_id?: string;
  output_url?: string;
  kind?: string;
  eta_seconds?: number | null;
};

type JobData = {
  job_id: string;
  state: string;
  output_url?: string | null;
  kind?: string;
  error?: string | null;
  eta_seconds?: number | null;
};

const DEFAULT_MODELS: Record<GenerateKind, string> = {
  image: "nano-banana-2",
  video: "kling-2-6",
  audio: "elevenlabs-tts",
  "3d": "tripo-text-to-3d",
  text: "claude-sonnet",
};

const EXT_BY_KIND: Record<string, string> = {
  image: ".png",
  video: ".mp4",
  audio: ".mp3",
  "3d": ".glb",
  text: ".txt",
};

// Resolve --element names (e.g. "Kelly") to their library image URLs, so a user
// never has to paste raw asset URLs. Case-insensitive match against the user's
// Cast / Sets / Props. Throws with the available names if one isn't found.
async function resolveElementRefs(names: string[]): Promise<string[]> {
  const r = await apiCall<{ elements: { name: string; image_url: string }[] }>(
    "/api/v1/elements?limit=50"
  );
  const lib = r.data.elements ?? [];
  const urls: string[] = [];
  const missing: string[] = [];
  for (const wanted of names) {
    const hit = lib.find((e) => e.name.toLowerCase() === wanted.toLowerCase());
    if (hit) urls.push(hit.image_url);
    else missing.push(wanted);
  }
  if (missing.length > 0) {
    const available = lib.map((e) => `"${e.name}"`).join(", ") || "(your library is empty)";
    throw new Error(
      `Element${missing.length > 1 ? "s" : ""} not found: ${missing.map((m) => `"${m}"`).join(", ")}.\n  Your library: ${available}\n  (Run: stensyl elements)`
    );
  }
  return urls;
}

export async function generate(kind: GenerateKind, prompt: string, opts: GenerateOptions): Promise<void> {
  const modelId = opts.model ?? DEFAULT_MODELS[kind];

  const body: Record<string, unknown> = {
    model_id: modelId,
    prompt,
  };
  if (opts.resolution) body.resolution = opts.resolution;
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.duration) body.duration_seconds = Number(opts.duration);

  // References: combine raw URLs (--ref / --refs) with library elements resolved
  // by name (--element "Kelly"). Sets BOTH reference_image_url (first) and the
  // plural array so single- and multi-ref backends both receive them.
  const refUrls: string[] = [...(opts.ref ? [opts.ref] : []), ...(opts.refs ?? [])];
  if (opts.element && opts.element.length > 0) {
    refUrls.push(...(await resolveElementRefs(opts.element)));
  }
  if (refUrls.length > 0) {
    body.reference_image_url = refUrls[0];
    body.reference_image_urls = refUrls;
  }
  if (opts.endFrame) body.end_frame_url = opts.endFrame;
  if (opts.ttsVariant) body.tts_variant = opts.ttsVariant;
  if (opts.voiceControl) body.voice_control = true;
  if (opts.voiceRef) body.voice_reference_url = opts.voiceRef;

  const spinner: Ora | null = !opts.json
    ? ora({ text: `${kind} via ${pc.bold(modelId)}…`, color: "yellow" }).start()
    : null;

  try {
    const result = await apiCall<GenerationData>("/api/v1/generations", {
      method: "POST",
      body: JSON.stringify(body),
    });

    // Async job (returned 202 with status 'processing')
    if (result.status === "processing" && !result.data.output_url) {
      const jobId = result.data.job_id ?? result.data.generation_id;
      if (opts.noWait) {
        spinner?.succeed(`Submitted: job_id=${jobId}`);
        if (opts.json) {
          console.log(JSON.stringify(result));
        }
        return;
      }
      // Poll.
      spinner?.start(`Submitted ${pc.dim(jobId ?? "")} — polling…`);
      const final = await pollUntilDone(jobId!, spinner);
      await handleCompletion(final, kind, opts, spinner);
      return;
    }

    // Sync completion.
    await handleCompletion(
      {
        job_id: result.data.generation_id,
        output_url: result.data.output_url,
        kind: result.data.kind,
      },
      kind,
      opts,
      spinner
    );
  } catch (e) {
    spinner?.fail((e as Error).message);
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: (e as Error).message }));
    }
    process.exit(1);
  }
}

// Hard cap on how long the CLI will poll. The drain cron will eventually
// abandon stuck jobs at 15 min, so this is a defence against the CLI process
// hanging in CI pipelines beyond a reasonable wait.
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 30 * 60 * 1000; // 30 minutes

async function pollUntilDone(jobId: string, spinner: Ora | null): Promise<CompletionResult> {
  const startedAt = Date.now();
  while (true) {
    const r = await apiCall<JobData>(`/api/v1/jobs/${jobId}`);
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (spinner) {
      spinner.text = `Generating… ${elapsed}s elapsed${r.data.eta_seconds ? ` (eta ~${r.data.eta_seconds}s)` : ""}`;
    }
    if (r.data.state === "completed" && r.data.output_url) {
      return { job_id: r.data.job_id, output_url: r.data.output_url, kind: r.data.kind };
    }
    if (r.data.state === "failed") {
      throw new Error(r.data.error ?? "Generation failed");
    }
    if (Date.now() - startedAt > POLL_MAX_MS) {
      throw new Error(
        `Generation has been pending for over ${Math.floor(POLL_MAX_MS / 60000)} minutes. The job may still complete — check with: stensyl jobs status ${jobId}`
      );
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }
}

type CompletionResult = { job_id?: string; output_url?: string; kind?: string };

async function handleCompletion(
  result: CompletionResult,
  kind: GenerateKind,
  opts: GenerateOptions,
  spinner: Ora | null
): Promise<void> {
  if (!result.output_url) {
    spinner?.fail("No output URL returned");
    process.exit(1);
  }

  // Save to disk.
  const ext = EXT_BY_KIND[kind] ?? extname(result.output_url) ?? "";
  const outPath = opts.out ?? join(process.cwd(), `${result.job_id}${ext}`);

  if (kind === "text") {
    // Text outputs may not be file URLs — handle inline.
    const txt = await fetch(result.output_url).then((r) => r.text());
    writeFileSync(outPath, txt);
  } else {
    await downloadToFile(result.output_url, outPath);
  }

  spinner?.succeed(`Saved: ${pc.bold(outPath)}`);
  if (opts.json) {
    console.log(
      JSON.stringify({
        ok: true,
        data: { job_id: result.job_id, output_url: result.output_url, saved_to: outPath },
      })
    );
  }
}
