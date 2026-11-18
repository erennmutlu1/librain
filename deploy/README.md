# Public demo: librain.erenmutlu.me

| Part | Where | Cost |
|---|---|---|
| Web UI (public build) | GitHub Pages, `librain.erenmutlu.me` | free |
| API (public mode) | Render free web service, Frankfurt (`render.yaml`) | free, no card |
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
(a **read-only** database key: Qdrant Cloud, Clusters, librain, API Keys, Create).

1. **GitHub settings** (Settings, Secrets and variables, Actions):
   ```sh
   gh variable set PUBLIC_DEMO --body true
   security find-generic-password -s librain-qdrant-url -w | gh secret set QDRANT_URL
   security find-generic-password -s librain-qdrant-readonly-key -w | gh secret set QDRANT_READONLY_KEY
   ```
2. **Image.** Push to `main` (or run the Publish workflow). Then, under the repository's
   Packages, open `librain-api`, Package settings, and set the visibility to Public, so Render
   can pull it without credentials.
3. **Render.** Sign up with GitHub (the free plan needs no card). New, Blueprint, this
   repository. Render asks for two values; copy each to the clipboard and paste it:
   ```sh
   security find-generic-password -s librain-qdrant-url -w | sed -E 's#^https?://##; s#[:/].*$##' | pbcopy   # Qdrant__Host
   security find-generic-password -s librain-qdrant-readonly-key -w | pbcopy                                 # Qdrant__ApiKey
   ```
   Apply. Note the service URL (`https://librain-api-….onrender.com`).
4. **Redeploys.** In the Render service, Settings, Deploy Hook: copy it, then
   `pbpaste | gh secret set RENDER_DEPLOY_HOOK`.
5. **UI.** `gh variable set LIBRAIN_API_URL --body https://librain-api-….onrender.com`. In
   Settings, Pages: source "GitHub Actions", custom domain `librain.erenmutlu.me`, Enforce HTTPS.
6. **DNS (Namecheap).** Advanced DNS, add a CNAME record: host `librain`, value
   `erennmutlu1.github.io.`
7. Run the Publish workflow once more (or push to `main`).

After that, every push to `main` republishes the UI and the image and redeploys the API.

## Hosts that were ruled out

Checked from a Turkish connection in November 2026: `pages.dev` (Cloudflare Pages, blocked
since a 25 November 2025 order against illegal match streams), `vercel.app`, `fly.dev`,
`run.app` and `northflank.app` do not load. Koyeb and the Azure free trial need a card;
Hugging Face Docker Spaces need a paid plan. `github.io`, `onrender.com` and the custom
subdomain load normally.
