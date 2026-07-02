import ora, { type Ora } from "ora";
import pc from "picocolors";
import { apiCall } from "../api.js";

type Job = {
  job_id: string;
  state: string;
  output_url: string | null;
  error: string | null;
  credits_used: number;
};

export async function status(jobId: string, opts: { json?: boolean }): Promise<void> {
  const r = await apiCall<Job>(`/api/v1/jobs/${jobId}`);
  if (opts.json) {
    console.log(JSON.stringify(r.data, null, 2));
    return;
  }
  console.log(`${pc.bold("Job:")}    ${r.data.job_id}`);
  console.log(`${pc.bold("State:")}  ${r.data.state}`);
  if (r.data.output_url) console.log(`${pc.bold("Output:")} ${r.data.output_url}`);
  if (r.data.error) console.log(pc.red(`Error:  ${r.data.error}`));
  console.log(`${pc.bold("Credits:")} ${r.data.credits_used}`);
}

export async function wait(jobId: string, opts: { json?: boolean }): Promise<void> {
  const spinner: Ora | null = !opts.json ? ora(`Waiting on ${jobId}…`).start() : null;
  const startedAt = Date.now();
  while (true) {
    const r = await apiCall<Job>(`/api/v1/jobs/${jobId}`);
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (spinner) spinner.text = `Waiting on ${jobId} — ${elapsed}s elapsed (${r.data.state})`;
    if (r.data.state === "completed") {
      spinner?.succeed(`Completed: ${pc.bold(r.data.output_url ?? "(no output url)")}`);
      if (opts.json) console.log(JSON.stringify(r.data, null, 2));
      return;
    }
    if (r.data.state === "failed") {
      spinner?.fail(r.data.error ?? "Generation failed");
      if (opts.json) console.log(JSON.stringify({ ok: false, error: r.data.error }));
      process.exit(1);
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
}
