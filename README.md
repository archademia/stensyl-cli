# @stensyl_ai/cli

Stensyl from your terminal. Generate images, video, and audio via the Stensyl API — works in shell scripts, CI pipelines, and anywhere else you'd reach for curl.

```bash
npm install -g @stensyl_ai/cli
```

## Authenticate

Browser-based sign-in, no keys to paste:

```bash
stensyl auth login
# Prints a code, opens your browser, waits for approval.
# Tokens stored in ~/.stensyl/config.json (chmod 600 on Unix).
```

## Generate

```bash
stensyl image "neobrutal coffee shop" --model nano-banana-2 --out cafe.png
stensyl video "panning shot of a city at dusk" --model kling-2-6 --duration 5
stensyl audio "synth-wave bassline, 120 bpm" --duration 30
stensyl 3d "weathered bronze astrolabe"
```

Reference images go in by URL — use your own library or any public image:

```bash
stensyl image "the same product on a marble plinth" --ref https://…/product.png
stensyl video "she walks through the market" --refs https://…/cast.png https://…/set.png
```

## Your library

```bash
stensyl assets                          # uploads + generations + elements, newest first
stensyl assets --source uploads         # just your uploads
stensyl assets --source elements        # just your Cast / Sets / Props
stensyl elements                        # the Film Studio library with image URLs
```

Any URL it prints can be fed straight back into `--ref` / `--refs`.

## Elements: reusable cast, sets, and props

Create a Film Studio element from the terminal — same reference-sheet spec, engines, and pricing as the in-app wizards (26 credits for a character or prop, flat 52 for a set):

```bash
stensyl element character "Raymond" --desc "a weathered fisherman in his 60s, grey stubble, cable-knit jumper"
stensyl element set "Harbour at dawn" --desc "a small Cornish fishing harbour, low golden light, moored boats"
stensyl element prop "The compass" --desc "a battered brass pocket compass with a cracked glass face"
```

The element lands in your Cast / Sets / Props library (importable into any film), and the returned image URL is a strong identity reference for keeping the subject consistent across later generations:

```bash
stensyl video "Raymond checks the compass on the quayside" --refs <raymond_url> <compass_url>
```

## Other commands

```bash
stensyl models                  # list available models
stensyl models --type image     # filter by type
stensyl account                 # plan, credits, spend caps
stensyl usage                   # last 7 days of API requests
stensyl jobs status <job_id>    # poll an async job
stensyl jobs wait <job_id>      # block until a job completes
stensyl workflows               # list saved workflows
```

Add `--json` to any command for machine-parseable output:

```bash
stensyl image "frosted ice cube" --model flux-2-pro --json | jq '.data.output_url'
```

## Configuration

| Variable | Purpose |
|---|---|
| `STENSYL_API_KEY` | Override the stored token (useful for CI) |
| `STENSYL_API_URL` | Override the API base URL (default: https://stensyl.ai) |

## Documentation

Full API reference: https://stensyl.ai/api/v1/openapi.json

Account dashboard: https://stensyl.ai/api
