# Contributing to LIBRAIN

Thanks for your interest in LIBRAIN. This is a solo research and engineering
project, but issues and pull requests are welcome.

## Reporting issues

Open a GitHub issue with: what you ran, what you expected, what happened, and
the relevant log lines (every request is keyed by a correlation ID, so include
it when you can). For reproducibility questions, say which experiment command
you ran and which corpus you used.

## Development setup

- .NET 10 SDK (the solution and every project target `net10.0`).
- A running Qdrant instance (local Docker or Qdrant Cloud).
- API keys for Anthropic (Claude) and OpenAI (embeddings), supplied via
  user-secrets or environment variables.

Build and test (mirrors CI):

```bash
dotnet build LIBRAIN.sln --nologo
dotnet test LIBRAIN.Tests/LIBRAIN.Tests.csproj --no-build --nologo
```

Run the API in one terminal, then drive the experiment CLI in another; see
`docs/EXPERIMENTS.md` for the full runbook.

## Pull requests

- Keep commits atomic. A feature and its tests usually land together; data
  housekeeping and code changes are kept in separate commits.
- Commit subjects follow `type(scope):`, for example `feat(discovery):`,
  `fix(claim-validation):`, `docs:`, `chore(experiments):`, `test:`.
- New tests should target a pure static helper (the scoring and validation
  helpers), following the patterns in `LIBRAIN.Tests/Agents/`.
- Reference Anthropic models through the `AnthropicModels.*` constants, never
  raw model strings.
- Do not break the test suite (81/81 green at the time of writing).

## License

By contributing you agree that your contributions are licensed under the
MIT License (see `LICENSE`).
