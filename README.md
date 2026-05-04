# @stensyl/cli

Stensyl from your terminal. Generate images, video, and audio via the Stensyl API — works in shell scripts, CI pipelines, and anywhere else you'd reach for curl.

```bash
npm install -g @stensyl/cli
```

## Authenticate

Create an API key at https://stensyl.ai/api#keys, then:

```bash
stensyl auth login
# Paste the key when prompted. Stored in ~/.stensyl/config.json (chmod 600).
```

## Generate

```bash
stensyl image "neobrutal coffee shop" --model nano-banana-2 --out cafe.png
stensyl video "panning shot of a city at dusk" --model kling-3-pro --duration 5
stensyl audio "synth-wave bassline, 120 bpm" --model elevenlabs-music --duration 30
```

## Other commands

```bash
stensyl models                  # list available models
stensyl models --type image     # filter by type
stensyl account                 # plan, credits, spend caps
stensyl usage                   # last 7 days of API requests
stensyl jobs status <job_id>    # poll an async job
```

Add `--json` to any command for machine-parseable output:

```bash
stensyl image "frosted ice cube" --model flux-2-pro --json | jq '.data.output_url'
```

## Configuration

| Variable | Purpose |
|---|---|
| `STENSYL_API_KEY` | Override the stored key (useful for CI) |
| `STENSYL_API_URL` | Override the API base URL (default: https://stensyl.ai) |

## Documentation

Full API reference: https://stensyl.ai/api/v1/openapi.json

Account dashboard: https://stensyl.ai/api
