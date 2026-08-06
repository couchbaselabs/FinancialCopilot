# Prompt for Claude Code — Wealth Management Advisor Copilot: Team Task Breakdown

> Paste everything below into Claude Code, run from inside the `FinancialCopilot` repo root.

---

## Context

We're building a **Wealth Management Advisor Copilot** as a team hackathon-style challenge. The pain point: a regional wealth management firm's advisors spend hours before every client meeting manually pulling portfolio holdings, re-reading research notes, and checking compliance guidance. We're building five small assistant features to fix that.

This repo (`FinancialCopilot`, codenamed **Vertex**) is our starting scaffold:

- **Backend**: Node.js + Express (`index.js`), Couchbase Capella access via `db.js`
- **Database**: Couchbase Capella — currently one bucket (`portfolio`), documents discriminated by a `type` field (e.g. `type: 'holding'`, `type: 'transaction'`), keyed like `holding::<TICKER>` and `transaction::<uuid>`. `db.js` exposes `connect()` and a raw `query(statement, params)` helper over SQL++ (N1QL).
- **Frontend**: single-page vanilla HTML/CSS/JS (`index.html`) with Chart.js, no build step, calling the Express API directly.
- **Seeding**: `seed.js` shows the pattern for upserting sample docs into Couchbase.

The challenge references a sample data file, **`financial_services_samples.json`**, covering: client profiles, holdings, research_notes, client_memory, and semantic_cache_entries. **Check whether this file exists anywhere in the repo or uploads. If it does not exist, generate a realistic mock version of it** (5–8 fictional clients is enough) so the team can start building against real shapes today. Follow the existing doc/key conventions in `db.js`/`seed.js` when you invent the schema (e.g. `client::<client_id>`, `research_note::<uuid>`, `client_memory::<client_id>`, `semantic_cache_entry::<uuid>`), and extend `holding` docs with a `client_id` field so holdings can be scoped to a client (right now they aren't).

## The five mini-tasks

1. **Client lookup & summary** — given a `client_id`, pull the client profile and holdings and produce a plain-English portfolio summary (e.g. "Jane Doe holds $2.1M across 12 positions, 61% equities, up 8.4% YTD, concentrated in Technology").
2. **Research note search** — let an advisor ask a question in natural language and surface the most relevant `research_notes`.
3. **Client memory assistant** — read and update `client_memory` so preferences/notes persist across a conversation (e.g. "prefers ESG-screened options," "sensitive about crypto exposure").
4. **ESG exposure calculator** — query holdings to compute ESG-screened vs. non-screened exposure per client.
5. **Repeat-question cache demo** — a simple layer that recognizes when a reworded question has effectively been asked before, using `semantic_cache_entries` as a model (doesn't need real embeddings — a defensible heuristic/demo is fine).

## Team

Four people, five tasks: **Kevin, Vani, Austin, JC**.

Suggested default mapping (adjust if your repo/data exploration suggests a better split — e.g. if one task is clearly heavier than the others, rebalance):

- **Kevin** — Task 1: Client lookup & summary (this is the foundation everyone else's demo leans on, so it should land first)
- **Vani** — Task 2: Research note search
- **JC** — Task 4: ESG exposure calculator
- **Austin** — Task 3: Client memory assistant **and** Task 5: Repeat-question cache demo (paired because both are thin "assistant layer" features sitting next to the core lookup, rather than net-new query/aggregation work)

## What I need from you

Produce **one plan per person**, written so each person can start coding immediately without needing to re-read the whole repo or ask clarifying questions. Also produce **one shared integration contract** so four people working in parallel don't collide.

### Per-person plan — include for each task

- **Goal**, in one or two sentences, phrased as the demo moment ("advisor types a client_id, gets back...").
- **Data model**: which Couchbase doc type(s)/fields it reads or writes, keyed per the conventions above. Call out any fields you're adding to existing docs (e.g. `client_id` on `holding`).
- **API surface to add** in `index.js`: exact route(s), method, request body/query params, response JSON shape (with a realistic example payload).
- **Sample SQL++ query** against the `portfolio` bucket for the core lookup.
- **Frontend hook**: where in `index.html`'s existing nav/sidebar this would surface, and roughly what UI element is needed (doesn't need to be built, just scoped).
- **Dependencies on other people's work** (e.g. Task 3 and 4 both need Task 1's client-scoped holdings query to exist first — call this out explicitly and suggest a stub/mock they can build against in the meantime).
- **Definition of done**: a short, concrete checklist.
- **Rough effort estimate** (S/M/L is fine).

### Shared integration contract — one file, covering

- Endpoint naming convention (e.g. all new copilot routes under `/api/copilot/*`, existing portfolio routes untouched).
- A consistent response envelope (do we wrap in `{ data, error }` or return raw objects like the existing endpoints do? — recommend one and justify it against the existing code style).
- Shared env vars / config additions needed (extend `.env.example` if so).
- Git workflow: one branch per person (`feature/<name>-<task>`), suggested PR order given the Task 1 dependency called out above.
- A suggested build order / rough timeline across the team, given the dependency graph.

## Output format

Write the plans as real files in this repo, not just chat output:

- `docs/team-plans/kevin.md`
- `docs/team-plans/vani.md`
- `docs/team-plans/jc.md`
- `docs/team-plans/austin.md`
- `docs/team-plans/integration-contract.md`

Each person's file should be self-contained — someone should be able to open only their file and start working. Do not write the actual feature implementation code yet; this is a planning/spec pass. Before finishing, sanity-check that the suggested task mapping and dependency order actually hold given whatever sample data you generated or found — flag anywhere the plan had to make an assumption.
