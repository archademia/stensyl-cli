// Film Studio elements: the user's Cast / Sets / Props library.
//
// `stensyl elements`                          — list the library
// `stensyl element <type> <name> --desc "…"`  — create one to Film's wizard spec
//
// Created elements are identical to wizard-made ones: same prompt builders,
// same forced engines, same wizard pricing (26cr character/prop, flat 52cr
// set), regenerable in Film Studio, and their image URL is a strong identity
// reference for keeping the subject consistent across later generations.

import { join } from "node:path";
import ora, { type Ora } from "ora";
import pc from "picocolors";
import { apiCall, downloadToFile } from "../api.js";

export const ELEMENT_TYPES = ["character", "set", "prop"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

type ElementRow = {
  element_id: string;
  element_type: string;
  name: string;
  image_url: string;
  description: string | null;
  created_at?: string;
};

type ElementsListData = { count: number; elements: ElementRow[] };

type ElementCreateData = {
  element_id: string;
  element_type: string;
  name: string;
  image_url: string;
  generation_id: string;
  model_id: string;
};

export async function listElements(opts: { limit?: string; json?: boolean }): Promise<void> {
  const qs = opts.limit ? `?limit=${encodeURIComponent(opts.limit)}` : "";
  const r = await apiCall<ElementsListData>(`/api/v1/elements${qs}`);
  if (opts.json) {
    console.log(JSON.stringify(r.data, null, 2));
    return;
  }
  console.log(pc.dim(`${r.data.count} element(s), newest first`));
  console.log("");
  for (const el of r.data.elements) {
    // DB stores sets as "location" — show the user-facing name.
    const type = el.element_type === "location" ? "set" : el.element_type;
    console.log(`  ${pc.bold(type.padEnd(10))} ${el.name.slice(0, 32).padEnd(34)} ${pc.dim(el.image_url)}`);
  }
  console.log("");
  console.log(pc.dim("Use one as a reference: stensyl image \"...\" --ref <image_url>"));
}

export async function createElement(
  type: string,
  name: string,
  opts: { desc?: string; ref?: string; refs?: string[]; out?: string; json?: boolean }
): Promise<void> {
  if (!ELEMENT_TYPES.includes(type as ElementType)) {
    throw new Error(`Invalid element type '${type}'. Must be one of: ${ELEMENT_TYPES.join(", ")}.`);
  }
  if (!opts.desc || !opts.desc.trim()) {
    throw new Error(
      `--desc is required: a plain subject description (who/what, features, wardrobe/materials). Composition, poses, and lighting are added by Film Studio's prompt builder.`
    );
  }

  const refs = [...(opts.ref ? [opts.ref] : []), ...(opts.refs ?? [])];

  const body: Record<string, unknown> = {
    element_type: type,
    name,
    description: opts.desc.trim(),
  };
  if (refs.length > 0) body.reference_image_urls = refs;

  const spinner: Ora | null = !opts.json
    ? ora({ text: `Creating ${type} ${pc.bold(name)}…`, color: "yellow" }).start()
    : null;

  try {
    const r = await apiCall<ElementCreateData>("/api/v1/elements", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const library = type === "character" ? "Cast" : type === "set" ? "Sets" : "Props";
    spinner?.succeed(`Saved to your ${library} library (${r.credits.used}cr)`);

    if (opts.out) {
      const outPath = opts.out === "" ? join(process.cwd(), `${r.data.element_id}.png`) : opts.out;
      await downloadToFile(r.data.image_url, outPath);
      if (!opts.json) console.log(`  Sheet:   ${pc.bold(outPath)}`);
    }

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, data: r.data, credits: r.credits }));
    } else {
      console.log(`  Element: ${r.data.element_id}`);
      console.log(`  Engine:  ${r.data.model_id}`);
      console.log(`  Image:   ${pc.dim(r.data.image_url)}`);
      console.log("");
      console.log(pc.dim(`Keep it consistent in later shots: stensyl image "..." --ref ${r.data.image_url.slice(0, 40)}…`));
      console.log(pc.dim(`In Film Studio it appears under ${library} via Import from Library.`));
    }
  } catch (e) {
    spinner?.fail((e as Error).message);
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: (e as Error).message }));
    }
    process.exit(1);
  }
}
