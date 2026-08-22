# AnswerAI — Port Spec (TypeScript/Express → Python/FastAPI + LangChain v1)

> **Purpose of this document.** The existing `agent/` backend is a course project built on
> LangChain's LCEL/Runnable orchestration, which LangChain v1 has de-emphasized. This spec
> captures *what the app does* (behaviour, contract, design decisions worth keeping) separately
> from *how it currently does it* (framework APIs that are now legacy), so a fresh Python +
> FastAPI backend can be generated that is **behaviourally identical** but built on current
> LangChain v1 / LangGraph patterns.
>
> **Audience:** Claude Code, in a later session, generating the new backend.
> **Rule:** Port the *design*, do not transcribe the code. The reference implementation contains
> known bugs (see §7) and legacy patterns (§4). Both are called out explicitly.
>
> **Verified:** All library versions and doc URLs in this file were checked against PyPI and
> `docs.langchain.com` on 2026-08-22. Re-verify before generating code if significant time has passed.

---

## 1. What the app is

A **cited-answer search tool**. The user asks a question; the backend decides whether the question
genuinely needs live web data or can be answered from model knowledge alone, then returns a short
answer plus the list of source URLs it actually read.

The central design idea — and the thing worth preserving — is **cost-aware routing**. Browsing is
expensive: it means a search API call, N page fetches, and N summarisation LLM calls. Most questions
don't need it. So a cheap deterministic classifier runs first and sends only the queries that need
freshness down the expensive path.

### Two execution paths

| Path | Trigger | What it does | Cost |
|---|---|---|---|
| **`direct`** | Default | Single LLM call, no browsing. `sources: []` | 1 LLM call |
| **`web`** | Query looks freshness-/ranking-/price-sensitive | Tavily search → fetch top 5 pages → summarise each → compose cited answer | 1 search + 5 fetches + 6 LLM calls |

### Routing rules (deterministic, no LLM)

Route to `web` if **any** of these hold (current impl: `agent/src/search_tool/routeStrategy.ts:4`):

1. Query length > 70 characters
2. Query mentions a recent year — regex `\b20(2[4-9]|3[0-9])\b`
3. Query matches any intent pattern:
   - **Ranking/comparison:** `top N`, `best`, `rank/ranking`, `which is better`, `vs`/`versus`, `compare`/`comparison`
   - **Commerce:** `price`/`pricing`/`cost`/`cheapest`/`affordable`, `under <N>`/`under <N>k`, currency symbol + digits (`\p{Sc}\s*\d+`)
   - **Freshness:** `latest`/`today`/`now`/`current`, `news`/`breaking`/`trending`, `released`/`launch`/`announced`/`updated`, `changelog`/`release notes`
   - **Lifecycle:** `deprecated`/`eol`/`end of life`/`sunset`, `roadmap`
   - **Compatibility:** `works with`/`compatible with`/`supported on`, `install`/`installation`
   - **Local:** `near me`/`nearby`

Otherwise route to `direct`.

> These patterns are **domain-specific by design** — the original author's comment notes they'd
> change for a different product (e-commerce, PPT generation, etc.). Keep them configurable, not
> hardcoded deep in the graph.

### Fault-tolerance behaviour (must be preserved)

The web path degrades in stages rather than failing:

1. **Happy path** — pages open and summarise → answer cites those URLs.
2. **Some pages fail** — failures are dropped, remaining summaries used. (Current impl uses
   `Promise.allSettled` and filters to `fulfilled`.)
3. **All pages fail** — fall back to Tavily's own snippets as pseudo-summaries (`fallback: "snippets"`).
4. **Search returns nothing** — fall back to a direct LLM answer with `sources: []` and flip
   `mode` to `"direct"` (`fallback: "no-results"`).

---

## 2. API contract — **frozen, do not change**

The Next.js client (`client/`, unchanged by this port) depends on exactly this. Verified at
`client/src/app/page.tsx:47`.

**Request**
```http
POST /search
Content-Type: application/json

{ "q": "top 10 engineering colleges in India 2025" }
```

**Success — 200**
```json
{
  "answer": "string, non-empty",
  "sources": ["https://…", "https://…"]
}
```

**Error — 400**
```json
{ "error": "human-readable message" }
```

### Contract details that matter

- Request field is **`q`**, not `query`. Minimum length **5**, message: `"Please ask a specific query"`.
- Response has **exactly** `answer` and `sources`. The internal `mode` field (`"web"`/`"direct"`)
  is deliberately **not** exposed — it stays internal.
- `sources` defaults to `[]` and is always present, never `null`.
- The client reads `res.ok` to branch, then `res.json()`. Any non-2xx must still return valid JSON.
- CORS must allow the client origin (`ALLOWED_ORIGIN` env var).

---

## 3. Current architecture (reference implementation)

```
agent/src/
├── index.ts                      Express app, CORS, JSON body parsing, mounts /search
├── routes/search_lcel.ts         POST / → validate body → runSearch() → 200 | 400
├── shared/
│   ├── env.ts                    Zod-validated process.env
│   └── models.ts                 switch on MODEL_PROVIDER → ChatOpenAI | ChatGoogleGenerativeAI | ChatGroq
├── utils/
│   ├── schemas.ts                All Zod schemas + inferred types
│   ├── webSearch.ts              Hand-rolled fetch() to api.tavily.com/search
│   ├── openUrl.ts                fetch page → html-to-text → strip nav/header/footer/script/style → cap 8000 chars
│   └── summarize.ts              LLM summarise, clip input 4000 chars, cap output 2500 chars
└── search_tool/
    ├── types.ts                  candidate = { answer, sources, mode }
    ├── routeStrategy.ts          regex classifier + routerStep (RunnableLambda)
    ├── directPipeline.ts         directPath (RunnableLambda) — single LLM call
    ├── webPipeline.ts            webSearchStep → openAndSummarizeStep → ComposeStep (RunnableSequence)
    ├── finalValidate.ts          Zod validate → on failure, LLM "repair" → validate again
    └── searchChain.ts            RunnableSequence[ routerStep, RunnableBranch, finalValidate ]
```

**Chain shape:** `routerStep → RunnableBranch(mode === "web" ? webPath : directPath) → finalValidateAndPolish`

**Tuning constants to carry over:** top-5 results from Tavily, 8000-char page cap, 4000-char
summariser input clip, 2500-char summary cap, `temperature: 0.2` everywhere, summaries 5–8 sentences,
max 10 results in the results schema.

---

## 4. What is outdated

Ordered by how much it should change the new implementation.

### 4.1 LCEL / Runnable orchestration — **the headline issue**

`RunnableSequence`, `RunnableBranch`, `RunnableLambda` are used as the app's orchestration layer.

**Status: not deprecated, but no longer the recommended way to build pipelines.** Precisely:

- The `Runnable` base class still exists and is fully supported in `@langchain/core` /
  `langchain-core`. Models, prompts and parsers *are* Runnables — that hasn't changed.
- But **LangChain v1 removed LCEL and Runnable conceptual documentation entirely.** Grepping the
  official v1 docs index for both languages returns zero LCEL/Runnable pages. The old
  `js.langchain.com/docs/concepts/lcel/` now 308-redirects to a generic overview.
- Orchestration guidance now points to **LangGraph** (`StateGraph`) for custom control flow, and
  **`create_agent`** for tool-calling loops.

**Implication:** Writing new orchestration in LCEL means building on an API with no conceptual
docs, no tutorials, and no examples going forward. Port to LangGraph.

### 4.2 `@langchain/classic` dependency

`agent/package.json` depends on `@langchain/classic@^1.0.1`. That package *is* the v0-compatibility
shim — its presence is the marker of legacy-pattern code. The new backend should not need an
equivalent.

### 4.3 Hand-rolled JSON repair — **replaced by a real feature**

`finalValidate.ts` implements: validate with Zod → if it fails, ask the LLM to "fix this JSON" →
substring-extract braces → parse → validate again.

This entire mechanism exists to work around unreliable JSON from models. **LangChain v1 has
first-class structured output** (`response_format` with `ProviderStrategy` / `ToolStrategy`, or
`model.with_structured_output(Schema)`), which uses provider-native constrained decoding where
available. The model returns a validated Pydantic object directly.

Delete the repair path. Keep a validation boundary, but the LLM-repair-and-regex-extract hack goes.

### 4.4 Multi-provider switching — **removed entirely in the new backend**

`shared/models.ts` is a 25-line `switch` over `MODEL_PROVIDER` constructing `ChatOpenAI` /
`ChatGoogleGenerativeAI` / `ChatGroq`, backed by three optional API keys in `env.ts`.

**Decision: the new backend is single-provider, OpenAI only.** See §6.4. This removes the switch,
two provider packages, two API-key env vars, and the `MODEL_PROVIDER` enum. LangChain v1 reduces
what remains to one call:

```python
init_chat_model("openai:gpt-5.6-luna", temperature=0.2)
```

### 4.5 Hand-rolled Tavily HTTP client

`utils/webSearch.ts` does a raw `fetch()` against `https://api.tavily.com/search` with manual
auth headers, response normalisation and error handling. The maintained `langchain-tavily` package
provides `TavilySearch` — a proper tool with retries and typed results.

### 4.6 Stale model IDs

`shared/env.ts` defaults: `gpt-4o-mini`, `gemini-2.0-flash-lite`, `llama-3.1-8b-instant`. All three
are superseded. Do **not** copy any of them across — the new backend uses a single fixed model,
`openai:gpt-5.6-luna` (§6.4).

### 4.7 No streaming

The whole app is `.invoke()`-only. The web path does a search + 5 page fetches + 6 LLM calls behind
one blocking HTTP request — easily 15–30 seconds of spinner. The original author's own note in
`types.ts` (*"types in ui -> search the web -> visit every result page -> summarize"*) shows
progress streaming was the intent but never built.

v1's current answer is **event streaming**: `stream_events(..., version="v3")`, introduced in
LangChain v1.3, which exposes typed projections (`.messages`, `.values`, `.tool_calls`, `.output`)
consumable independently.

### 4.8 No observability

No LangSmith tracing, no structured logging, no timing. Every LangGraph node is traceable for free
by setting env vars.

### 4.9 Minor / hygiene

- Express 4.21 (Express 5 is current); `@types/express` sits in `dependencies` instead of `devDependencies`.
- Port default disagrees with itself: `env.ts` says `5000`, `index.ts` says `5174`.
- `ALLOWED_ORIGIN` defaults to `http://localhost:5000` — not the Next.js dev port.
- `safeText()` (in both `webSearch.ts` and `openUrl.ts`) is named "text" but calls `res.json()`.
- No timeouts on any outbound `fetch` — a slow page can hang a request indefinitely.
- No dependency lockfile discipline: `agent/node_modules` isn't even installed in this checkout.

---

## 5. What is **not** outdated — port these deliberately

This is the majority of the value in the reference implementation. None of it is framework-specific.

| Design decision | Why it still matters |
|---|---|
| **Deterministic cost router** | Still the right call. An LLM-based router costs a call to save calls; regex costs nothing. |
| **"The LLM cannot browse"** | The core insight in `openUrl.ts`. Your code is the browser; you decide what content reaches the model. Unchanged. |
| **Fetch → strip chrome → cap length** | Context windows are finite and nav/footer text is pure noise. The stripping step is what makes summaries clean. |
| **Summarise-then-compose (map-reduce)** | Don't stuff 5 raw pages into one prompt. Summarise each, then compose. Standard, still correct. |
| **Graceful degradation ladder** | Real web pages 403, time out and return junk. The 3-tier fallback is genuinely good engineering. |
| **Concurrent page fetches** | `Promise.allSettled` → `asyncio.gather(..., return_exceptions=True)`. Same idea, direct translation. |
| **Schema as the boundary** | Validating what leaves the system is correct. Only the *repair mechanism* is obsolete, not the validation. |
| **Sources tracked through the pipeline** | Citations come from URLs actually opened and summarised, not from the model. This is how you avoid fabricated citations. |
| **Low temperature (0.2)** | Right for factual summarisation. |
| **Explicit anti-hallucination prompts** | *"Use only the provided summaries; do not invent new facts"* — still the correct instruction. |

---

## 6. Target architecture

### 6.1 Orchestration decision: LangGraph `StateGraph`

**Use `StateGraph`, not `create_agent`.** Rationale:

- The app is a **deterministic pipeline with one branch**, not an agent loop. Nodes and conditional
  edges map 1:1 onto the existing design.
- `create_agent` would hand routing to the model, which **defeats the app's stated purpose** — the
  router exists specifically to avoid paying for browsing. It also makes behaviour non-reproducible.
- A 1:1 structural port means the new backend can be **diffed against the old one** on the same
  queries to verify correctness. That verification is impossible if the architecture changes at the
  same time.

Mapping:

| Current (LCEL) | New (LangGraph) |
|---|---|
| `RunnableLambda.from(fn)` | plain `async def` node function |
| `RunnableSequence.from([a, b, c])` | `add_edge("a", "b")`, `add_edge("b", "c")` |
| `RunnableBranch.from([[cond, x], y])` | `add_conditional_edges("router", pick_path, {...})` |
| `{...input, extra}` spreading | state `TypedDict` + reducers |
| `chain.invoke(x)` | `graph.ainvoke(x)` |

> **Documented alternative, phase 2 only:** a `create_agent` version with `TavilySearch` as a tool
> is worth building *afterwards* as a comparison — it's the idiomatic v1 shape and less code. But it
> is a **different application** with different cost and latency characteristics. Do not conflate
> the two in one migration.

### 6.2 Target layout

```
api/
├── pyproject.toml
├── .env.example
├── README.md
└── app/
    ├── main.py                 FastAPI app, CORS, router mount, lifespan
    ├── config.py               pydantic-settings Settings   ← shared/env.ts
    ├── schemas.py              Pydantic models              ← utils/schemas.ts
    ├── models.py               init_chat_model wrapper      ← shared/models.ts
    ├── routes/
    │   └── search.py           POST /search                 ← routes/search_lcel.ts
    ├── tools/
    │   ├── web_search.py       TavilySearch                 ← utils/webSearch.ts
    │   ├── open_url.py         httpx + trafilatura          ← utils/openUrl.ts
    │   └── summarize.py        summarisation chain          ← utils/summarize.ts
    └── graph/
        ├── state.py            SearchState TypedDict        ← search_tool/types.ts
        ├── router.py           regex classifier + node      ← routeStrategy.ts
        ├── web_path.py         search/open/compose nodes    ← webPipeline.ts
        ├── direct_path.py      direct node                  ← directPipeline.ts
        ├── finalize.py         validation node              ← finalValidate.ts
        └── build.py            StateGraph assembly          ← searchChain.ts
```

### 6.3 Dependencies — verified on PyPI, 2026-08-22

```toml
# pyproject.toml
requires-python = ">=3.11"

dependencies = [
    "fastapi>=0.141.1",
    "uvicorn[standard]>=0.52.4",
    "pydantic>=2.13.4",
    "pydantic-settings>=2.15.0",
    "langchain>=1.3.16",
    "langchain-core>=1.6.0",
    "langgraph>=1.2.11",
    "langchain-tavily>=0.2.18",
    "langchain-openai>=1.6.0",          # the only provider package — see §6.4
    "httpx>=0.28.1",
    "trafilatura>=2.2.0",
]
```

**Note on `trafilatura`:** chosen over a BeautifulSoup hand-roll as the `html-to-text` replacement.
It does main-content extraction natively, which is strictly better than the current
skip-`nav`/`header`/`footer`/`script`/`style` selector list — that's an approximation of exactly
what trafilatura is built to do.

### 6.4 Model configuration — **fixed, single provider**

The new backend uses **OpenAI only**, and within OpenAI a **single model: `gpt-5.6-luna`**.
No provider switching, no per-task model selection.

```python
# app/models.py
from langchain.chat_models import init_chat_model

def get_chat_model(temperature: float = 0.2):
    return init_chat_model("openai:gpt-5.6-luna", temperature=temperature)
```

**Env vars** — the entire model config reduces to:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6-luna    # keep configurable for upgrades, but no provider dimension
```

Everything else goes: `MODEL_PROVIDER`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `GEMINI_MODEL`,
`GROQ_MODEL`.

**Why Luna fits this app well.** GPT-5.6 ships as three variants — Sol, Terra, Luna — trading
capability against speed and cost. Luna is the fast/cheap tier ($0.20 per M input, $1.20 per M
output as of 2026-07-30) with a **1M-token context window**. This workload is exactly its target
profile: the web path makes **6 LLM calls per query** (5 page summaries + 1 compose), all of them
summarisation and composition rather than hard reasoning. High volume, low difficulty, latency-
sensitive — Luna's brief.

> **Verify at generation time.** `gpt-5.6-luna` was confirmed against the LangChain models doc and
> OpenAI's API docs on 2026-08-22. Model IDs and pricing move fast; re-check
> https://docs.langchain.com/oss/python/langchain/models before generating.

#### Architectural consequence of the 1M context window

Several tuning constants in the reference implementation exist to work around **small context
windows**, not because they're inherently correct:

| Constant | Original reason | Still needed with Luna? |
|---|---|---|
| 8000-char page cap | Page wouldn't fit in context | Cost/latency control only |
| 4000-char summariser input clip | Same | Cost/latency control only |
| Summarise-then-compose (5 extra calls) | 5 raw pages couldn't fit in one prompt | **No longer a hard constraint** |

With 1M tokens available, all 5 raw pages (~5 × 2k tokens ≈ 10k tokens ≈ **$0.002** at Luna
pricing) fit comfortably in a single compose call. That would eliminate 5 LLM round trips and cut
web-path latency substantially.

**Do not make this change during the port.** Phase 3 is about behavioural parity — keep the
map-reduce so the new backend can be diffed against the old one. Revisit it in Phase 4 as a
measured optimisation, weighing the real tradeoff: summarisation denoises page content and degrades
gracefully when one page is junk, whereas single-shot composition over raw HTML-derived text is
noisier and loses the per-page fallback granularity described in §1.

### 6.5 Graph shape

```
        START
          │
          ▼
      ┌────────┐
      │ router │  regex classify → mode
      └────────┘
          │  add_conditional_edges
     ┌────┴──────────┐
     ▼               ▼
┌─────────┐    ┌──────────┐
│ direct  │    │  search  │
└─────────┘    └──────────┘
     │               ▼
     │         ┌──────────────┐
     │         │ open+summarise│  asyncio.gather(return_exceptions=True)
     │         └──────────────┘
     │               ▼
     │         ┌──────────┐
     │         │ compose  │
     │         └──────────┘
     └────────┬──────┘
              ▼
        ┌──────────┐
        │ finalize │  Pydantic validation boundary
        └──────────┘
              │
              ▼
             END
```

---

## 7. Known bugs in the reference implementation — **do not port**

Found while reading the source. Fix in the new implementation; do not faithfully reproduce.

1. **`finalValidate.ts:24` — silent `undefined` return.** If both `safeParse` calls fail, the
   function falls off the end returning `undefined`. The route then sends `res.json(undefined)`
   with HTTP 200, and the client renders an empty answer. The new `finalize` node must always
   return a valid object or raise.

2. **`finalValidate.ts:65` — `extractJson` truncates.** Uses `input.indexOf("}")` (the **first**
   closing brace) instead of `lastIndexOf`. Any JSON with nesting or multiple keys gets cut
   mid-object, `JSON.parse` throws, and it silently returns `{}`. Moot once structured output
   replaces the repair path (§4.3), but worth understanding as a lesson in why the hack was fragile.

3. **No outbound timeouts.** Neither `openUrl` nor `webSearch` sets a fetch timeout. Set explicit
   `httpx` timeouts in the port.

4. **`safeText()` misnomer** (both files) — calls `res.json()` on an error path that is very likely
   *not* JSON, so the `catch` swallows the real error body.

---

## 8. Migration steps

Phased so each step is independently verifiable. Do not skip §8.0.

### Phase 0 — Capture golden outputs (do this first, while TS still runs)

1. `cd agent && npm install` (currently not installed).
2. Start the TS backend with a working `.env`.
3. Run a fixed query set through `POST /search` and save responses as golden files:
   - `direct` path: *"what is docker"*, *"explain rest apis"*
   - `web` path — length: a >70-char question
   - `web` path — year: *"best laptops 2025"*
   - `web` path — pattern: *"top 5 python frameworks"*, *"iphone 16 price under 80k"*, *"latest node lts"*
   - Edge: 4-char query (must 400), empty body (must 400)
4. Also record which `mode` each query routed to (add a temporary log line).

**Acceptance:** a JSON fixture file of query → `{answer, sources}` + expected mode. This is the
regression baseline for the whole port. Answers won't match verbatim (LLMs are non-deterministic) —
what must match is **routing decision, sources count, error codes, and response shape**.

### Phase 1 — Scaffold

1. Create `api/` per §6.2 with `pyproject.toml` per §6.3.
2. `app/config.py` — port `env.ts` to `pydantic-settings`. **Do not keep every var** — drop
   `MODEL_PROVIDER`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `GEMINI_MODEL`, `GROQ_MODEL` per §6.4. The
   model config is just `OPENAI_API_KEY` + `OPENAI_MODEL`. `OPENAI_API_KEY` is **required**, not
   optional — with one provider there's no fallback, so fail fast at startup if it's missing. Fix
   the port/origin inconsistencies from §4.9.
3. `app/schemas.py` — port Zod → Pydantic:
   - `SearchInput` (`q: str`, `min_length=5`)
   - `SearchAnswer` (`answer: str` non-empty, `sources: list[HttpUrl] = []`)
   - `SearchResult` (`title`, `url`, `snippet=""`), `SearchResults` (max 10)
   - `OpenUrlOutput`, `SummarizeOutput`
4. `app/main.py` — FastAPI app + CORS from `ALLOWED_ORIGIN` + mount router.
5. `app/routes/search.py` — `POST /search` returning a stub `{answer, sources}`.

**Acceptance:** `POST /search` returns 200 with correct shape; a 3-char `q` returns 422/400 with
`{"error": …}`. Client can talk to it.

> **Contract note:** FastAPI's default validation error is 422 with a `detail` envelope. The client
> expects **400** and `{"error": "..."}`. Add an exception handler to translate — this is a real
> contract mismatch, not a detail to discover later.

### Phase 2 — Port the leaf tools (no graph yet)

1. `app/models.py` — `init_chat_model("openai:gpt-5.6-luna", temperature=0.2)` per §6.4. Single
   provider, single model. No `switch`, no provider dimension. Re-verify the model ID against the
   live models doc before generating.
2. `app/tools/open_url.py` — `httpx.AsyncClient` (explicit timeout, custom UA) + `trafilatura`
   extraction + whitespace collapse + 8000-char cap + URL scheme validation (http/https only).
3. `app/tools/summarize.py` — clip 4000 → LLM with the existing system prompt (keep the
   anti-hallucination lines verbatim) → cap 2500.
4. `app/tools/web_search.py` — `TavilySearch` from `langchain-tavily`, `max_results=5`, normalised
   to `SearchResults`.

**Acceptance:** unit-test each tool standalone. `open_url` on a real URL returns clean text;
`summarize` on a long string returns 5–8 sentences; `web_search` returns ≤5 typed results.

### Phase 3 — Build the graph

1. `app/graph/state.py` — `SearchState` TypedDict: `q`, `mode`, `results`, `page_summaries`,
   `fallback`, `answer`, `sources`.
2. `app/graph/router.py` — port the regex rules from §1 **exactly**. Keep patterns in a module-level
   list so they stay editable. Unit-test against the Phase 0 routing fixtures.
3. `app/graph/direct_path.py` — one LLM call, `sources=[]`, `mode="direct"`.
4. `app/graph/web_path.py` — three nodes:
   - `search_node` → Tavily
   - `open_and_summarize_node` → `asyncio.gather(*, return_exceptions=True)`, filter exceptions,
     implement the snippet fallback and the no-results fallback (§1)
   - `compose_node` → cited answer from summaries, `sources` = URLs actually summarised
5. `app/graph/finalize.py` — validate into `SearchAnswer`. **Use structured output instead of the
   repair hack.** On unrecoverable failure, raise (never return `undefined`-equivalent — bug §7.1).
6. `app/graph/build.py` — assemble with `add_conditional_edges`, compile, expose `run_search()`.
7. Wire `routes/search.py` to `graph.ainvoke()`.

**Acceptance:** run the Phase 0 fixture set. **Routing decisions must match 100%.** Response shape,
`sources` behaviour and error codes must match. Answer text will differ.

### Phase 4 — Add what the original couldn't do

Only after Phase 3 passes.

1. **Streaming** — add `POST /search/stream` (SSE) using `stream_events(version="v3")`, emitting
   progress: *searching → reading page N → summarising → composing*. Keep the non-streaming
   endpoint for contract compatibility; the client can migrate separately.
2. **Tracing** — enable LangSmith via `LANGSMITH_TRACING=true` + `LANGSMITH_API_KEY`.
3. **Resilience** — retry/backoff on Tavily and page fetches; per-node timeouts.
4. **Caching** — cache `open_url` results by URL; identical queries currently re-fetch everything.

### Phase 5 — Optional comparison build

Build the `create_agent` + `TavilySearch` variant behind a feature flag. Compare cost, latency and
answer quality against the graph version on the same fixture set. This is a learning exercise, not
a replacement — see §6.1.

---

## 9. Reference URLs

All verified reachable on 2026-08-22.

**LangChain v1 (Python)**
- Overview — https://docs.langchain.com/oss/python/langchain/overview
- Quickstart — https://docs.langchain.com/oss/python/langchain/quickstart
- Models / `init_chat_model` — https://docs.langchain.com/oss/python/langchain/models
- Agents / `create_agent` — https://docs.langchain.com/oss/python/langchain/agents
- Structured output — https://docs.langchain.com/oss/python/langchain/structured-output
- Tools — https://docs.langchain.com/oss/python/langchain/tools
- Streaming — https://docs.langchain.com/oss/python/langchain/streaming
- **Event streaming (v1.3, preferred)** — https://docs.langchain.com/oss/python/langchain/event-streaming
- Middleware — https://docs.langchain.com/oss/python/langchain/middleware
- Short-term memory — https://docs.langchain.com/oss/python/langchain/short-term-memory

**LangGraph**
- Overview — https://docs.langchain.com/oss/python/langgraph/overview
- Graph API (`StateGraph`) — https://docs.langchain.com/oss/python/langgraph/graph-api
- Workflows vs agents — https://docs.langchain.com/oss/python/langgraph/workflows-agents

**Integrations**
- Tavily — https://docs.langchain.com/oss/python/integrations/tools/tavily_search
- OpenAI (the only provider — §6.4) — https://docs.langchain.com/oss/python/integrations/chat/openai
- GPT-5.6 Luna model card — https://developers.openai.com/api/docs/models/gpt-5.6-luna

**Doc indexes** (fetch these first to discover current pages — structure changes between versions)
- All docs — https://docs.langchain.com/llms.txt
- Python — https://docs.langchain.com/oss/python/llms.txt

**Legacy (for reading the old TS code only — do not build against)**
- Runnable class ref — https://reference.langchain.com/javascript/langchain-core/runnables/classes/Runnable

---

## 10. Open decisions

Resolve before or during generation:

~~1. **Model provider + IDs.**~~ **RESOLVED** — OpenAI only, `gpt-5.6-luna` only. See §6.4.

~~2. **Keep multi-provider switching?**~~ **RESOLVED** — no. Single provider, switching removed
entirely. See §4.4 and §6.4.

Still open:

1. **Streaming endpoint shape.** SSE vs NDJSON, and whether the Next.js client gets updated in the
   same pass or later.
2. **Async-only or sync fallback?** Recommendation: async throughout (FastAPI + `ainvoke` +
   `httpx.AsyncClient` + `asyncio.gather`).
3. **Testing depth.** Minimum: unit tests for the router regexes (pure functions, high value) and
   contract tests for the endpoint.
4. **Collapse the map-reduce?** Luna's 1M context makes single-shot composition viable, removing 5
   LLM calls per web query. Deferred to Phase 4 with the tradeoff documented — see §6.4.
