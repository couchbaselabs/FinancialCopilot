# Vani — Task 2: Research Note Search

> Read the **[integration contract](./integration-contract.md)** first. Good news: your feature is
> **fully independent** — it only reads `research_note` docs. Start immediately; you're not blocked on
> anyone.

## Goal
An advisor types a natural-language question — *"what should I do about bond duration risk?"* — and gets
back the most relevant research notes, ranked, with a snippet — e.g. surfacing *"Q3 2026 Fixed Income
Outlook: Managing Duration Risk."*

## Data model
**Reads only:** `research_note` — key `research_note::<note_id>`. Fields: `title`, `body`, `tags[]`,
`published_date`, `note_id`. There's also an 8-dim `embedding` — **ignore it** (contract §4: no real
vector search). Rank with keyword/tag matching.

## API surface (add to `index.js`)
```
GET /api/copilot/research/search?q=<natural language>&limit=5
```
Response (`{ data, error }`):
```jsonc
{
  "data": {
    "query": "bond duration risk",
    "results": [
      {
        "note_id": "note_5521",
        "title": "Q3 2026 Fixed Income Outlook: Managing Duration Risk...",
        "score": 0.71,
        "matched_terms": ["duration", "risk", "bond→fixed_income"],
        "snippet": "...recommend trimming long-duration bond exposure in favor of short-to-intermediate maturities...",
        "tags": ["fixed_income", "duration_risk", "rates"],
        "published_date": "2026-07-10"
      }
    ]
  },
  "error": null
}
```

**Ranking heuristic (defensible, no embeddings):**
1. Tokenize `q` (lowercase, strip stopwords).
2. Score each note = weighted sum: tag match (×3) + title term match (×2) + body term match (×1).
3. A small synonym map helps the demo land (`bond`→`fixed_income`, `stock`→`equity`, `sustainable`→`esg`).
4. Sort desc, take `limit`, build a `snippet` as the body window around the first matched term.
Return an empty `results` array (not an error) when nothing matches.

## Sample SQL++
Pull the candidate set, rank in JS:
```sql
SELECT r.note_id, r.title, r.body, r.tags, r.published_date
FROM `portfolio` AS r
WHERE r.type = 'research_note'
```
(3 notes in the sample — fine to score in memory. If the corpus grew you'd push tag filters into the
`WHERE` clause, e.g. `AND ANY t IN r.tags SATISFIES t IN $tags END`.)

## Frontend hook
A **"Research" tab/panel** in the existing nav: a search input + a results list (title, date, tag chips,
snippet, relevance score). Sits alongside the client summary so an advisor can look things up mid-prep.

## Dependencies
- **None.** Reads only `research_note`, which Kevin's seed script populates — but you can hardcode the 3
  sample notes as a fixture to build/test the ranker before the seed lands, then flip to the query.

## Definition of done
- [ ] `GET /api/copilot/research/search?q=...` returns ranked results in the shape above.
- [ ] Ranking sensibly surfaces the fixed-income note for a "bond duration" query and the ESG note for a "sustainable funds" query.
- [ ] Empty query and no-match cases return `{ data: { results: [] }, error: null }`, not a 500.
- [ ] `limit` respected; snippet highlights the matched region.
- [ ] Research panel wired into `index.html`.

## Effort: **S–M** (one endpoint; the ranking heuristic + synonym map is the interesting part).
