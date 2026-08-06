# JC — Task 4: ESG Exposure Calculator

> Read the **[integration contract](./integration-contract.md)** first. You depend on Kevin's Task 1 for
> the client-scoped holdings query. Build against the stub below until his PR merges, then swap.

## Goal
An advisor opens a client and sees, at a glance, how much of the portfolio is ESG-screened vs. not —
e.g. *"Priya: 84% ESG-screened ($207K of $245.5K). Aligned with her stated ESG preference."* vs.
*"Marcus: 0% ESG-screened — but he has no ESG preference, so no flag."*

## Data model
**Reads:**
- `holding` — key `holding::<client_id>::<symbol>`. Uses `esg_screened` (bool) + `market_value_usd`.
- `client_profile` — key `client::<client_id>`. Uses `esg_preference` (bool) to decide whether a low ESG
  % is a *misalignment flag* or just a fact.

**⚠️ Must filter** `WHERE type='holding' AND client_id = $cid AND client_id IS NOT MISSING` so legacy
client-less `holding::<TICKER>` docs never leak into the math (contract §3).

## API surface (add to `index.js`)
```
GET /api/copilot/clients/:clientId/esg
```
Response (`{ data, error }`):
```jsonc
{
  "data": {
    "client_id": "cli_10234",
    "esg_preference": true,
    "total_market_value_usd": 245500,
    "esg_screened_value_usd": 207000,
    "non_screened_value_usd": 38500,
    "esg_screened_pct": 0.843,
    "breakdown": [
      { "symbol": "VTSAX", "market_value_usd": 145000, "esg_screened": true },
      { "symbol": "ESGV",  "market_value_usd": 62000,  "esg_screened": true },
      { "symbol": "BND",   "market_value_usd": 38500,  "esg_screened": false }
    ],
    "alignment": "aligned",           // aligned | misaligned | not_applicable
    "alignment_note": "84% ESG-screened, consistent with client's stated ESG preference."
  },
  "error": null
}
```
Alignment rule: `esg_preference === true && esg_screened_pct < 0.5` → `"misaligned"`; `esg_preference ===
true` otherwise → `"aligned"`; `esg_preference === false` → `"not_applicable"`.

## Sample SQL++
```sql
SELECT h.symbol, h.market_value_usd, h.esg_screened
FROM `portfolio` AS h
WHERE h.type = 'holding' AND h.client_id = $cid AND h.client_id IS NOT MISSING
```
Or aggregate in the query and skip the JS sum:
```sql
SELECT
  SUM(h.market_value_usd) AS total,
  SUM(CASE WHEN h.esg_screened THEN h.market_value_usd ELSE 0 END) AS screened
FROM `portfolio` AS h
WHERE h.type = 'holding' AND h.client_id = $cid AND h.client_id IS NOT MISSING
```

## Frontend hook
On the client summary view (Kevin's card), add an **"ESG" sub-panel**: a screened-vs-non-screened
stacked bar or mini donut (reuse Chart.js), the headline %, and a colored alignment badge
(green aligned / amber misaligned / grey n/a).

## Dependencies
- **Depends on Task 1** for the `holding::<client_id>::<symbol>` + `client_id` contract. Until Kevin
  merges, build against this stub so you're never blocked:
  ```js
  // TEMP stub — delete once Kevin's client-scoped holdings query lands
  async function getClientHoldings(cid) {
    const fixture = {
      cli_10234: [
        { symbol: 'VTSAX', market_value_usd: 145000, esg_screened: true },
        { symbol: 'ESGV',  market_value_usd: 62000,  esg_screened: true },
        { symbol: 'BND',   market_value_usd: 38500,  esg_screened: false },
      ],
      cli_10891: [
        { symbol: 'QQQ',  market_value_usd: 128000, esg_screened: false },
        { symbol: 'ARKK', market_value_usd: 41000,  esg_screened: false },
      ],
    };
    return fixture[cid] || [];
  }
  ```
  Swap the fixture for the SQL++ query above once Task 1 is in.

## Definition of done
- [ ] `GET /api/copilot/clients/:clientId/esg` returns the shape above.
- [ ] Correct math for `cli_10234` (~84% screened, aligned) and `cli_10891` (0% screened, not_applicable).
- [ ] Excludes legacy client-less holdings.
- [ ] Alignment badge logic matches the rule above.
- [ ] ESG sub-panel wired into the client view.

## Effort: **S–M** (query + aggregation + a small alignment rule).
