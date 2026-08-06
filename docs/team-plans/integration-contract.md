# Vertex Copilot — Shared Integration Contract

> **Read this first.** Four people are building five features in parallel against one Couchbase
> `portfolio` bucket and one `index.js`. This file is the set of rules that keep us from colliding.
> If you deviate, say so in your PR description.

---

## 1. Endpoint naming convention

- **All new copilot routes live under `/api/copilot/*`.** One noun-ish segment per feature:
  - `GET  /api/copilot/clients/:clientId/summary`      (Kevin — Task 1)
  - `GET  /api/copilot/research/search?q=...`          (Vani — Task 2)
  - `GET  /api/copilot/clients/:clientId/memory`       (Austin — Task 3)
  - `PATCH /api/copilot/clients/:clientId/memory`      (Austin — Task 3)
  - `GET  /api/copilot/clients/:clientId/esg`          (JC — Task 4)
  - `POST /api/copilot/ask`                            (Austin — Task 5, cache demo)
- **Do not touch the existing `/api/portfolio/*`, `/api/holdings`, `/api/transactions`, `/api/health`
  routes.** They back the current dashboard and the legacy `holding::<TICKER>` docs. Leave them alone.
- Register your route in the section of `index.js` marked `// ─── Copilot routes ───` (add it if you're
  first). Keep each person's routes in their own clearly-commented block to minimize merge conflicts.

## 2. Response envelope

**Decision: new `/api/copilot/*` routes wrap every response in `{ data, error }`.**

```jsonc
// success
{ "data": { ...payload... }, "error": null }
// failure
{ "data": null, "error": "human-readable message" }
```

**Why, given the existing code:** the legacy endpoints are inconsistent — success returns a raw object
or bare array (`res.json(holdings)`), but failure returns `{ error }` (see `index.js:52`, `index.js:74`).
A client can't tell success from failure by shape alone. With four people shipping endpoints the frontend
has to consume uniformly, a single predictable envelope is worth the small divergence from legacy. We
scope the envelope to `/api/copilot/*` only so we don't have to touch/retest the working dashboard.

Add this helper near the top of `index.js` and use it everywhere in copilot routes:

```js
const ok   = (res, data)              => res.json({ data, error: null });
const fail = (res, err, code = 500)   => res.status(code).json({ data: null, error: err.message || String(err) });
```

## 3. Data model — canonical conventions

The sample file `financial_services_samples.json` uses a `doc_type` field. The existing app code
discriminates on **`type`** and every existing SQL++ query filters `WHERE type = '...'`.

**Decision: on seed we normalize `doc_type` → `type`.** Every doc written to Couchbase carries a `type`
field. Do **not** query on `doc_type`; it won't exist in the bucket. (See `seed-copilot.js`, owned by
Kevin as part of Task 1 — §6 build order.)

Canonical document keys (all in the default collection of the `portfolio` bucket):

| Doc `type`             | Key pattern                        | Source in sample file        |
|------------------------|------------------------------------|------------------------------|
| `client_profile`       | `client::<client_id>`              | `client_profiles[]`          |
| `holding`              | `holding::<client_id>::<symbol>`   | `holdings[]`                 |
| `transaction`          | `transaction::<txn_id>`            | `transactions[]`             |
| `research_note`        | `research_note::<note_id>`         | `research_notes[]`           |
| `client_memory`        | `client_memory::<client_id>`       | `client_memory[]`            |
| `semantic_cache_entry` | `semantic_cache_entry::<cache_id>` | `semantic_cache_entries[]`   |

**⚠️ Holding key change — everyone read this.** Legacy holdings are keyed `holding::<TICKER>` with no
client scope (`seed.js:40`). The sample data has holdings belonging to different clients, and two clients
can hold the same symbol. So copilot holdings are keyed **`holding::<client_id>::<symbol>`** and every
`holding` doc gets a **`client_id`** field. Legacy client-less holdings (`holding::AAPL` etc.) may still
be in the bucket from an earlier `npm run seed`; copilot queries MUST filter `WHERE type = 'holding' AND
client_id IS NOT MISSING` so they never pick up the legacy docs. (Flagged again in Kevin's & JC's plans.)

## 4. Shared env / config

No new secrets are required for the core features. Extend `.env.example` **only if** you add optional
config; if you do, append with a comment and a safe default so nobody's `.env` breaks:

```
# Copilot (optional)
COPILOT_CACHE_SIMILARITY_THRESHOLD=0.82   # Task 5: min score to count as a cache hit
```

Real embeddings are **out of scope**. The `embedding` / `query_embedding` arrays in the sample are
8-dim toys — treat them as opaque. Task 2 and Task 5 use keyword/heuristic matching, not vector search.

## 5. Git workflow

- One branch per person: **`feature/<name>-<task>`** — e.g. `feature/kevin-client-summary`,
  `feature/austin-memory-cache`.
- Small PRs, rebase on `main` before opening.
- **PR merge order is dependency-driven (see §6).** Kevin's Task 1 (client-scoped holdings + seed script)
  must merge first because Tasks 3, 4, and the summary all read client-scoped holdings.
- Anyone blocked on Task 1 builds against the **stub** described in their own plan and swaps to the real
  query once Kevin's PR lands. Don't sit idle.

## 6. Suggested build order / timeline

```
Day 1 ┌─ Kevin  T1: seed-copilot.js + client-scoped holdings query + /summary   ◀── unblocks everyone
      │           (publishes the `holding::<client_id>::<symbol>` + client_id contract)
      │
      ├─ Vani   T2: research search  ── independent, can start immediately (reads research_note only)
      └─ Austin T5: cache demo       ── independent, can start immediately (reads semantic_cache_entry only)

Day 2 ┌─ JC     T4: ESG calculator   ── needs T1's client-scoped holdings (stub until T1 merges)
      └─ Austin T3: memory assistant ── needs a valid client_id to exist (light dep on T1's seed)

Day 3 ── Integration: wire all five into index.html nav, smoke-test envelope consistency, demo run.
```

Critical path is **T1 → {T4, T3}**. T2 and T5 are off the critical path and should be started first by
whoever is free, so the team is never all blocked on Kevin.

## 7. Assumptions flagged (sanity-check of the mapping)

- **The default task→person mapping holds.** T1 is genuinely the foundation (client-scoped holdings), so
  Kevin-first is correct. T2 and T5 are independent, so pairing T5 with Austin (who also has the light
  T3) is fine — neither of Austin's tasks is on the critical path, balancing his double assignment.
- **`portfolio_data.json` is a red herring for these five tasks.** It contains 100+ `type: "trade"` docs
  (fund-level trading blotter: `trade_id`, `notional`, `venue`, `risk_score`) with **no `client_id`**.
  None of the five features reference trades. Do **not** seed it into the copilot flow; it will only add
  noise to `holding`/`transaction` queries. (If someone wants a stretch "trade surveillance" demo later,
  it's self-contained — but it's not one of the five.)
- **Sample data is thin (2 clients, not 5–8).** The prompt anticipated generating 5–8 fictional clients;
  the provided file only has `cli_10234` and `cli_10891`. That's enough to build and demo every feature,
  but if we want a fuller demo, Kevin's seed script should be trivially extendable (array-driven) so we
  can add more client rows without code changes. Flagged in Kevin's plan.
- **Only one `semantic_cache_entry` exists.** Task 5's heuristic must degrade gracefully to "cache miss"
  when nothing is similar — don't assume the cache is populated. Flagged in Austin's plan.
