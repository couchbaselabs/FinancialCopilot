# Kevin — Task 1: Client Lookup & Summary

> Read the **[integration contract](./integration-contract.md)** first. You own the foundation everyone
> else builds on: the client-scoped holdings key convention **and** the copilot seed script. Land this
> first.

## Goal
An advisor types a `client_id` and instantly gets a plain-English portfolio summary — e.g.
*"Priya Nandakumar holds $245K across 3 positions, 85% equities, 84% ESG-screened, top position VTSAX."*
This is the screen every other demo opens on.

## Data model
**Reads:**
- `client_profile` — key `client::<client_id>` (name, risk_tolerance, investable_assets_usd, esg_preference, goals).
- `holding` — key `holding::<client_id>::<symbol>`, filtered `WHERE type='holding' AND client_id = $cid`.

**Writes / owns the convention:**
- You author `seed-copilot.js`, which loads `financial_services_samples.json`, **normalizes `doc_type` →
  `type`**, and upserts every doc under the canonical keys in the contract §3.
- You add **`client_id`** to every `holding` doc and key it `holding::<client_id>::<symbol>` (legacy
  `holding::<TICKER>` docs stay untouched but are excluded via `client_id IS NOT MISSING`).

Sample holdings have `symbol`, `asset_class`, `market_value_usd`, `esg_screened`, `quantity` — note there
is **no per-position sector**; classify equities vs. fixed income off `asset_class`, not `sector`.

## API surface (add to `index.js`)
```
GET /api/copilot/clients/:clientId/summary
```
Response (`{ data, error }` envelope):
```jsonc
{
  "data": {
    "client_id": "cli_10234",
    "name": "Priya Nandakumar",
    "risk_tolerance": "moderate",
    "investable_assets_usd": 1875000,
    "total_market_value_usd": 245500,
    "position_count": 3,
    "asset_mix": { "equity": 0.844, "fixed_income": 0.156 },
    "esg_screened_pct": 0.844,
    "top_position": { "symbol": "VTSAX", "market_value_usd": 145000 },
    "narrative": "Priya Nandakumar holds $245.5K across 3 positions — 84% equities, 84% ESG-screened, concentrated in VTSAX. Moderate risk tolerance."
  },
  "error": null
}
```
Build `narrative` from the computed numbers (simple template string — no LLM needed for the demo).
Return `fail(res, ..., 404)` if the `client::<id>` doc doesn't exist.

## Sample SQL++
```sql
SELECT h.symbol, h.asset_class, h.market_value_usd, h.esg_screened, h.quantity
FROM `portfolio` AS h
WHERE h.type = 'holding' AND h.client_id = $cid
```
Profile fetch is a KV get on `client::<cid>` (or `SELECT ... WHERE type='client_profile' AND client_id=$cid`).

## Frontend hook
Top of `index.html`: add a **"Client" search box** in the existing header/nav that takes a `client_id`
and renders a summary card (name, total value, asset-mix mini donut reusing the existing Chart.js setup,
ESG %, top position, narrative line). This card becomes the landing view other features attach to.

## Dependencies
- **You are the dependency.** Nobody's client-scoped work is real until your seed script + holdings key
  convention land. Ship `seed-copilot.js` and the `/summary` route in your first PR so JC and Austin can
  swap off their stubs.
- No upstream deps. Start immediately.

## Definition of done
- [ ] `seed-copilot.js` loads the sample file, maps `doc_type`→`type`, upserts all six doc types under canonical keys.
- [ ] `holding` docs carry `client_id`; keyed `holding::<client_id>::<symbol>`.
- [ ] `GET /api/copilot/clients/:clientId/summary` returns the shape above, 404s on unknown client.
- [ ] Verified against both sample clients (`cli_10234`, `cli_10891`).
- [ ] Frontend client-search card renders a real summary.
- [ ] Seed arrays are extendable (add a client row → reseed, no code change) per contract §7.

## Effort: **M** (seed script + convention-setting makes it heavier than a lone endpoint).
