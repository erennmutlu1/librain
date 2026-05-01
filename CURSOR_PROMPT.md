# Cursor Master Prompt

This file contains the prompt you paste into Cursor (Cmd+L chat or Cmd+I composer) to bootstrap the project. **Paste it once at the start.** After that, you'll have shorter conversations referencing `PROJECT_PLAN.md`.

---

## Setup (do this FIRST, before pasting the prompt)

1. Create the project folder and copy `PROJECT_PLAN.md` and `README.md` into it:
   ```bash
   mkdir -p ~/projects/librain && cd ~/projects/librain
   # Copy PROJECT_PLAN.md and README.md into this folder
   git init
   ```

2. Create a `.cursorrules` file in the project root with the constraints (see "Cursor Rules File" below).

3. Open the folder in Cursor: `cursor .`

4. Open the chat (Cmd+L) and select **Claude Sonnet 4.6** as the model.

5. Paste the prompt below.

---

## The Prompt (paste this into Cursor chat)

```
You are my engineering partner on a portfolio project called LIBRAIN. Read 
PROJECT_PLAN.md in this repository in full before doing anything else. That 
document is the single source of truth for scope, architecture, tech stack, 
and constraints. Also read README.md to understand the public framing.

Context about me:
- I am a .NET / Node.js full-stack developer with 3+ years of experience.
- I am job hunting for senior roles in EU (Netherlands, Germany, Ireland 
  preferred) with visa sponsorship.
- This project is a portfolio piece that must demonstrate senior-level .NET 
  + AI engineering. It is also aligned with Microsoft AI-200 certification.
- I have a full-time job, so I work on this evenings and weekends. Be 
  efficient with my time.
- I use macOS on Apple Silicon (M3) with Cursor as my IDE.

Working agreement:
1. Always defer to PROJECT_PLAN.md. If I ask for something outside its scope, 
   surface the conflict and ask before implementing.
2. Respect the locked tech stack in §2 of PROJECT_PLAN.md. Do not propose 
   alternatives.
3. Follow the constraints in §6 of PROJECT_PLAN.md (single project, no 
   premature abstraction, atomic commits, structured logging, etc.).
4. When implementing, write minimal viable code first, then iterate. Do NOT 
   write the entire feature in one shot.
5. Explain non-obvious decisions briefly inline (one line). Do not over-comment.
6. Use file-scoped namespaces, nullable reference types, primary constructors 
   where natural, records for DTOs, ILogger<T> always injected.
7. After each meaningful change, suggest a commit message in conventional 
   commit format (feat:, fix:, refactor:, docs:, chore:).

Today's task — Phase 1, Step 1 (project scaffold):

Create the initial solution structure as described in §3 and §6 of 
PROJECT_PLAN.md. Specifically:

1. Create a single ASP.NET Core Web API project named "LIBRAIN" using minimal 
   APIs (.NET 9). 
2. Add NuGet packages: 
   - Anthropic.SDK
   - OpenAI (official)
   - Microsoft.Azure.Cosmos
   - Microsoft.SemanticKernel
   - UglyToad.PdfPig
   - Microsoft.ApplicationInsights.AspNetCore
3. Create the folder structure: Agents/, Embeddings/, Storage/, Models/.
4. Set up Program.cs with: dependency injection scaffold, App Insights wiring, 
   minimal API routing, Swagger/OpenAPI for development.
5. Create empty placeholder classes for: ReaderAgent, SynthesisAgent, 
   EvaluatorAgent, OpenAIEmbeddingClient, AnthropicClient, CosmosPaperRepository.
6. Create a configuration model class for the secrets I'll set via 
   user-secrets (Anthropic:ApiKey, OpenAI:ApiKey, Cosmos:Endpoint, Cosmos:Key, 
   ApplicationInsights:ConnectionString).
7. Add a `.gitignore` (use `dotnet new gitignore`).
8. Add MIT LICENSE.

Do NOT yet:
- Implement any agent logic
- Create endpoints beyond a /health check
- Add tests
- Configure Cosmos containers in code (we'll do that in Step 2)

Confirm when you've read PROJECT_PLAN.md and are ready to start. Then 
proceed step-by-step, pausing for my confirmation between major changes 
(e.g., after creating the project, after adding packages, after wiring DI).
```

---

## Cursor Rules File

Create `.cursorrules` in the repo root with this content. Cursor reads it automatically and applies it to every interaction:

```
This is the LIBRAIN project. Read PROJECT_PLAN.md before any structural decision.

HARD RULES:
- Single ASP.NET Core Web API project. No Core/Data/Tests splitting.
- Locked stack (see PROJECT_PLAN.md §2). Do not propose alternatives.
- No premature abstraction: no interfaces unless 2+ implementations exist; no 
  generic repositories; no MediatR; no AutoMapper; no FluentValidation.
- Tests only for: chunker logic, citation validator, evaluator scoring. 
  Nothing else.
- Atomic commits. One logical change per commit. Conventional commit messages.
- Every agent operation emits a structured log event with correlation ID.
- Configuration via appsettings.json + user-secrets only. No env vars in dev.

CODE STYLE:
- File-scoped namespaces.
- Nullable reference types enabled.
- Primary constructors where natural.
- `record` for DTOs and value objects.
- `ILogger<T>` always injected, never static loggers.
- No comments except for non-obvious decisions (one line max).
- Self-documenting names > comments.

WHEN UNSURE:
- Defer to PROJECT_PLAN.md.
- If the user asks for something outside the plan, surface the conflict 
  before implementing.
```

---

## Subsequent Prompts

After the initial scaffold is done, you'll have shorter, focused prompts. Examples:

**For Phase 1, Step 2 (PDF parsing + chunking):**
```
We're now on Phase 1, Step 2 from PROJECT_PLAN.md. Implement the PDF parsing 
and chunking pipeline per §4.1. Start with: a PdfTextExtractor that takes a 
file path and returns plain text + page metadata, using UglyToad.PdfPig. 
Then a RecursiveChunker per the spec (512-token target, 1024 max, 15% overlap, 
paragraph > sentence > hard cut boundary preference). Write unit tests for 
the chunker (chunker is one of the three components that gets tests per the 
constraints). Do NOT yet wire embeddings or Cosmos.
```

**For Phase 1, Step 3 (embeddings + Cosmos):**
```
Phase 1, Step 3. Implement OpenAIEmbeddingClient (uses text-embedding-3-small) 
and CosmosPaperRepository per §4.2 schema. Then wire them into ReaderAgent 
so that ingesting a PDF: extracts text → chunks it → embeds each chunk → 
persists to Cosmos. Add the POST /api/papers/ingest endpoint accepting a 
multipart PDF upload. Test with one real arXiv paper from data/papers/.
```

**For when you get stuck:**
```
I'm stuck on [specific problem]. Here's what I tried: [what you tried]. 
Here's the error: [error message]. Reference PROJECT_PLAN.md §[relevant 
section] for context. What's the most likely cause and what's the smallest 
change that would fix it?
```

---

## Tips for Working with Cursor on This Project

1. **Use Cmd+L for discussion, Cmd+I for execution.** Cmd+L is a chat — use it to think through a decision. Cmd+I (Composer) makes multi-file changes — use it after you've decided what to do.

2. **Reference PROJECT_PLAN.md explicitly.** Phrases like "per §4.3" or "see the chunking spec" make Cursor re-read the relevant section instead of guessing.

3. **Reject scope creep aggressively.** If Cursor proposes "while we're here, let me also add X" — reject it. The plan is the plan.

4. **Don't trust generated code blindly.** Read every diff. Especially around prompt strings (`§4.3`), Cosmos queries (vector search syntax is finicky), and citation validation logic.

5. **When in doubt, ask Claude (the chat assistant, not Cursor) to review.** Paste a code block here and ask "is this consistent with PROJECT_PLAN.md §X?" — I can catch drift.

6. **Commit often.** Every logical step. If Cursor breaks something you can `git reset --hard HEAD~1` instead of debugging.

---

*Once Phase 1 is complete, update this file with prompts for Phase 2 and 3 as you go.*
