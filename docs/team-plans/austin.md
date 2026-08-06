# Austin — Task 3: Client Memory Assistant + Task 5: Repeat-Question Cache Demo

> Read the **[integration contract](./integration-contract.md)** first. You have two thin "assistant
> layer" features. Task 5 is fully independent — **start with it** while Kevin lands Task 1; Task 3 only
> needs a valid `client_id` to exist.

---

## Task 3 — Client Memory Assistant

### Goal
An advisor sees persistent notes about a client and can add to them — e.g. opens `cli_10234` and reads
*"Prefers ESG-screened funds; reduced bond duration March 2026; wants quarterly check-ins,"* then adds
*"Interested in muni bonds"* and it persists for next time.

### Data model
**Reads + writes:** `client_memory` — key `client_memory::<client_id>`. Fields: `memory_summary`
(string), `key_facts` (string[]), `last_updated` (ISO), `source_meetings` (string[]). One doc per client.

### API surface (add to `index.js`)
```
GET   /api/copilot/clients/:clientId/memory
PATCH /api/copilot/clients/:clientId/memory
```
GET response (`{ data, error }`):
```jsonc
{ "data": { "client_id": "cli_10234", "memory_summary": "...", "key_facts": ["Prefers ESG/sustainable funds", ...], "last_updated": "2026-06-20T14:12:00Z", "source_meetings": ["mtg_2026_03_11", "mtg_2026_06_20"] }, "error": null }
```
PATCH request body — append a fact and/or replace the summary:
```jsonc
{ "add_fact": "Interested in muni bonds", "memory_summary": "(optional new summary)" }
```
PATCH behavior: KV-get the doc (or create an empty one if none exists), append `add_fact` to `key_facts`
(dedupe), overwrite `memory_summary` if provided, set `last_updated = new Date().toISOString()`, upsert
back under the same key. Return the updated doc in `data`.

### Sample SQL++ / access
This is a single-doc-by-key feature — prefer KV over query:
```js
const col = bucket.defaultCollection();
const { content } = await col.get(`client_memory::${clientId}`);  // wrap in try/catch for DocumentNotFound
await col.upsert(`client_memory::${clientId}`, updatedDoc);
```
(Equivalent query: `SELECT * FROM \`portfolio\` WHERE type='client_memory' AND client_id=$cid`.)

### Frontend hook
A **"Notes / Memory" side panel** on the client view: renders `key_facts` as a bullet list + the summary,
with a text input + "Add note" button hitting the PATCH route. Show `last_updated`.

### Dependencies
- Light dep on Task 1: you need a client to exist. You can create/patch a `client_memory` doc
  independently of holdings, so build and test with a hardcoded `cli_10234` before the seed lands.

### Definition of done (T3)
- [ ] GET returns memory for `cli_10234`; returns an empty-but-valid doc (not 500) for a client with no memory yet.
- [ ] PATCH appends a deduped fact, updates `last_updated`, persists across restarts.
- [ ] Memory panel renders and the add-note flow round-trips.

### Effort (T3): **S**

---

## Task 5 — Repeat-Question Cache Demo

### Goal
The advisor asks a question they (or a colleague) effectively asked before — *"is inflation hurting my
bonds?"* vs the cached *"How is inflation affecting my bond holdings?"* — and the system recognizes the
repeat and returns the cached answer instantly, showing it as a **cache hit**.

### Data model
**Reads (+ optional write-through):** `semantic_cache_entry` — key `semantic_cache_entry::<cache_id>`.
Fields: `canonical_query`, `observed_variants[]`, `cached_response`, `hit_count`, `ttl_seconds`,
`last_hit`, and an 8-dim `query_embedding` — **ignore the embedding** (contract §4). Only **one** entry
exists in the sample, so your matcher must degrade gracefully to "miss."

### API surface (add to `index.js`)
```
POST /api/copilot/ask
```
Request: `{ "question": "is inflation hurting my bond portfolio?" }`
Response (`{ data, error }`):
```jsonc
{
  "data": {
    "question": "is inflation hurting my bond portfolio?",
    "cache_hit": true,
    "matched_cache_id": "cache_fin_001",
    "match_score": 0.86,
    "matched_against": "is inflation hurting my bond portfolio",   // canonical or a variant
    "answer": "Based on our Q3 fixed income outlook, higher-for-longer rates are pressuring long-duration bonds..."
  },
  "error": null
}
```
On a miss: `cache_hit: false`, `matched_cache_id: null`, and `answer` falls back to a generic
"no cached answer — ask your advisor" string (or, stretch, hand off to Vani's research search).

**Similarity heuristic (defensible, no embeddings):** normalize + tokenize the question, compare against
each entry's `canonical_query` **and** every `observed_variants` string using Jaccard token overlap (or
cosine over term-frequency vectors). Take the max score across all strings of all entries. If
`maxScore >= COPILOT_CACHE_SIMILARITY_THRESHOLD` (default `0.82`, see contract §4) → hit. On a hit,
optionally write-through: increment `hit_count`, set `last_hit`, and append the new phrasing to
`observed_variants` if it's novel — this makes the demo visibly "learn."

### Sample SQL++
```sql
SELECT c.cache_id, c.canonical_query, c.observed_variants, c.cached_response, c.hit_count
FROM `portfolio` AS c
WHERE c.type = 'semantic_cache_entry'
```
(One row today — score in JS.)

### Frontend hook
A small **"Ask" bar** (could live on the research panel): input + answer area with a **HIT/MISS badge**
and the match score, so the demo visibly shows a reworded repeat being recognized.

### Dependencies
- **None.** Fully independent — reads only `semantic_cache_entry`. Best task to start Day 1 while Kevin
  works. Build against the single sample entry (hardcode it as a fixture until the seed lands).

### Definition of done (T5)
- [ ] `POST /api/copilot/ask` recognizes a reworded variant of the sample canonical query as a HIT with a shown score.
- [ ] A clearly-unrelated question returns a graceful MISS (no crash, sensible fallback answer).
- [ ] Threshold is read from env with a sane default.
- [ ] (Optional) write-through increments `hit_count` / appends the new variant.
- [ ] Ask bar wired in with a HIT/MISS badge.

### Effort (T5): **S–M** (heuristic + graceful-miss handling is the substance).

---

## Combined effort: **M** across both. Neither is on the critical path, which balances the double
assignment — do T5 first (unblocked), then T3.
