import { writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import ora from "ora";
import pc from "picocolors";
import { apiCall, downloadToFile } from "../api.js";

type GenerateOptions = {
  model?: string;
  resolution?: string;
  aspectRatio?: string;
  duration?: string;
  ref?: string;
  refs?: string[];
  endFrame?: string;
  ttsVariant?: "flash" | "v2";
  voiceControl?: boolean;
  voiceRef?: string;
  out?: string;
  json?: boolean;
  noWait?: boolean;
};

const DEFAULT_MODELS = {
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

export async function generate(
  kind: keyof typeof DEFAULT_MODELS,
  prompt: string,
  opts: GenerateOptions
): Promise<void> {
  const modelId = opts.model ?? DEFAULT_MODELS[kind];

  const body: Record<string, unknown> = {
    model_id: modelId,
    prompt,
  };
  if (opts.resolution) body.resolution = opts.resolution;
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.duration) body.duration_seconds = Number(opts.duration);
  if (opts.ref) body.reference_image_url = opts.ref;
  if (opts.refs && opts.refs.length > 0) body.reference_image_urls = opts.refs;
  if (opts.endFrame) body.end_frame_url = opts.endFrame;
  if (opts.ttsVariant) body.tts_variant = opts.ttsVariant;
  if (opts.voiceControl) body.voice_control = true;
  if (opts.voiceRef) body.voice_reference_url = opts.voiceRef;

  const spinner = !opts.json
    ? ora({ text: `${kind} via ${pc.bold(modelId)}…`, color: "yellow" }).start()
    : null;

  try {
    const result = await apiCall<{
      generation_id: string;
      job_id?: string;
      output_url?: string;
      kind: string;
      generation_time_ms?: number;
    }>("/api/v1/generations", {
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
      spinner?.start(`Submitted ${pc.dim(jobId)} — polling…`);
      const final = await pollUntilDone(jobId, spinner);
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

async function pollUntilDone(
  jobId: string,
  spinner: ReturnType<typeof ora> | null
): Promise<{ job_id: string; output_url?: string; kind: string }> {
  const startedAt = Date.now();
  while (true) {
    const r = await apiCall<{
      job_id: string;
      state: string;
      output_url: string | null;
      error: string | null;
      kind: string;
      eta_seconds: number | null;
    }>(`/api/v1/jobs/${jobId}`);

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

async function handleCompletion(
  result: { job_id: string; output_url?: string; kind: string },
  kind: string,
  opts: GenerateOptions,
  spinner: ReturnType<typeof ora> | null
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
