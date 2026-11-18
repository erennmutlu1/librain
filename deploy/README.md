# Public demo: librain.erenmutlu.me

| Part | Where | Cost |
|---|---|---|
| Web UI (public build) | GitHub Pages, `librain.erenmutlu.me` | free |
| API (public mode), https://librain.onrender.com | Render free web service, built from this repo (`render.yaml`) | free, no card |
| Corpus (55 papers, 2,210 chunks) | Qdrant Cloud free cluster, Frankfurt | free |
| Keep-alive | GitHub Actions, one read every 3 days (`qdrant-keepalive.yml`) | free |
| Claude and OpenAI | **the visitor's own keys** | billed to the visitor |

The free Render instance sleeps after 15 minutes without traffic; the first live request
after that waits up to about a minute while it wakes, and the UI says so. Recorded runs never
touch the API.

## What public mode guarantees (`Public__Enabled=true`)

- No Anthropic or OpenAI key is configured on the server. Each live call uses the keys the
  visitor sent with that request (`X-Anthropic-Key`, `X-OpenAI-Key`), and configured keys are
  never read in this mode, so there is nothing to fall back on.
- Keys are not stored, logged or echoed in errors. `LIBRAIN.Tests/Api/PublicModeTests.cs`
  checks this, including two visitors calling at the same moment.
- The corpus is read-only. Ingest, delete, server-side run history, the OpenAI port and the
  research endpoints answer 403. Only `GET /api/papers`, `/health` and the visitor pipelines
  (discover, query, compare, naive-rag, single-llm) are reachable.
- A visitor's topics and results are not saved on the server. The UI keeps their history in
  their own browser.
- Requests without keys are refused (401) before any work, and a rejected key, an empty
  account or a provider rate limit comes back as a clear message.

## First deployment

Values that are secret go from the macOS Keychain straight into the service that needs them,
without being shown. The Keychain holds `librain-qdrant-url` and `librain-qdrant-readonly-key`
(a **read-only** database key: Qdrant Cloud, Clusters, librain, API Keys, Create, read-only).

1. **GitHub settings** (Settings, Secrets and variables, Actions):
   ```sh
   gh variable set PUBLIC_DEMO --body true
   security find-generic-password -s librain-qdrant-url -w | gh secret set QDRANT_URL
   security find-generic-password -s librain-qdrant-readonly-key -w | gh secret set QDRANT_READONLY_KEY
   ```
2. **Render.** Sign up with GitHub (the free plan needs no card). New, Web Service, this
   repository: language Docker, branch `main`, instance type **Free** (the footer must say
   $0 / month). Environment Variables, "Add from .env": put the ten settings on the clipboard
   with the command below and paste them. Advanced: Health Check Path `/health`; Build Filters,
   Included Paths `LIBRAIN/**` and `Dockerfile` (so only API changes rebuild it). Deploy.
   (New, Blueprint with `render.yaml` sets up the same service.)
   ```sh
   U=$(security find-generic-password -s librain-qdrant-url -w); H=${U#https://}; H=${H%%/*}; H=${H%%:*}
   printf 'Public__Enabled=true\nQdrant__Host=%s\nQdrant__ApiKey=%s\nQdrant__Port=6334\nQdrant__UseHttps=true\nCors__AllowedOrigins__0=https://librain.erenmutlu.me\nRateLimiting__PaidRequestsPerHour=30\nASPNETCORE_ENVIRONMENT=Production\nPORT=8080\nDOTNET_gcServer=0\n' \
     "$H" "$(security find-generic-password -s librain-qdrant-readonly-key -w)" | pbcopy
   ```
   Copy something else afterwards so the key does not stay on the clipboard.
3. **UI.** `gh variable set LIBRAIN_API_URL --body https://librain.onrender.com` (the address
   Render shows). GitHub Pages, source "GitHub Actions":
   ```sh
   gh api -X POST repos/erennmutlu1/librain/pages -f build_type=workflow
   ```
4. **DNS (Namecheap).** Advanced DNS, add a CNAME record: host `librain`, value
   `erennmutlu1.github.io.` Once it resolves, attach it and, when the certificate is issued,
   enforce HTTPS:
   ```sh
   gh api -X PUT repos/erennmutlu1/librain/pages -f cname=librain.erenmutlu.me
   gh api -X PUT repos/erennmutlu1/librain/pages -F https_enforced=true -f cname=librain.erenmutlu.me
   ```
5. Push to `main` (or run the Publish workflow).

After that, every push to `main` republishes the UI, and Render rebuilds the API when `LIBRAIN/`
or the `Dockerfile` changed. The Publish workflow also pushes the API image to
`ghcr.io/erennmutlu1/librain-api` for anyone who wants to run it themselves.

## Checking it

```sh
curl -s https://librain.onrender.com/health                         # {"status":"ok"} (may take a minute to wake)
curl -s https://librain.onrender.com/api/papers | jq length         # 55
curl -s -X POST -H 'content-type: application/json' -d '{"topicA":"a","topicB":"b"}' \
  https://librain.onrender.com/api/discover | jq .title             # "provider keys required"
curl -s -o /dev/null -w '%{http_code}\n' https://librain.onrender.com/api/runs   # 403
```

## Hosts that were ruled out

Checked from a Turkish connection in November 2026: `pages.dev` (Cloudflare Pages, blocked
since a 25 November 2025 order against illegal match streams), `vercel.app`, `fly.dev`,
`run.app` and `northflank.app` do not load. Koyeb and the Azure free trial need a card;
Hugging Face Docker Spaces need a paid plan. `github.io`, `onrender.com` and the custom
subdomain load normally.
