# Vertex · Investment Portfolio Dashboard
> Built on Couchbase Capella — your portfolio intelligence layer.

## Stack
- **Backend**: Node.js + Express
- **Database**: Couchbase Capella (cloud-managed NoSQL)
- **Frontend**: Vanilla HTML/CSS/JS with Chart.js (no build step)

---

## Setup

### 1. Couchbase Capella

1. Sign up at [cloud.couchbase.com](https://cloud.couchbase.com)
2. Create a **Cluster** (free tier available)
3. Create a **Bucket** named `portfolio`
4. Add a **Database User** with read/write access to the `portfolio` bucket
5. Under **Connect → SDK**, copy your connection string (starts with `couchbases://`)
6. In **Security → Allowed IPs**, add your machine's IP (or `0.0.0.0/0` for dev)
7. Create a **Primary Index** in the Query workbench:
   ```sql
   CREATE PRIMARY INDEX ON `portfolio`;
   ```

### 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:
```
CB_ENDPOINT=couchbases://cb.<your-cluster-id>.cloud.couchbase.com
CB_USERNAME=your_db_username
CB_PASSWORD=your_db_password
CB_BUCKET=portfolio
PORT=3001
```

### 3. Install & Run

```bash
npm install          # install dependencies
npm run seed         # populate Couchbase with sample data
npm start            # start API server on :3001
```

### 4. Open the Dashboard

Open `client/index.html` in your browser (double-click it, or serve it):
```bash
npx serve client     # serves on http://localhost:3000
```

---

## Features

| Feature | Details |
|---------|---------|
| Portfolio Summary | Total value, cost basis, unrealized P&L |
| Holdings Table | All positions with sector, shares, price, gain |
| Sector Allocation | Donut chart from live Couchbase data |
| Transaction Log | Full buy/sell history stored in Capella |
| Add Position | Upserts a holding doc to Couchbase |
| Log Trade | Inserts a transaction doc with UUID key |
| Analytics View | Sector performance bar chart + movers ranking |

## Couchbase Document Schema

### Holding
```json
{
  "type": "holding",
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "sector": "Technology",
  "shares": 50,
  "avgCost": 145.20,
  "currentPrice": 189.50,
  "updatedAt": "2024-06-15T12:00:00Z"
}
```
Key: `holding::<TICKER>`

### Transaction
```json
{
  "type": "transaction",
  "ticker": "AAPL",
  "transactionType": "BUY",
  "shares": 50,
  "price": 145.20,
  "date": "2023-07-01",
  "createdAt": "2024-06-15T12:00:00Z"
}
```
Key: `transaction::<UUID>`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portfolio/summary` | Aggregated P&L and sector breakdown |
| GET | `/api/holdings` | All holdings with calculated metrics |
| POST | `/api/holdings` | Add / update a position |
| GET | `/api/transactions` | Recent transaction history |
| POST | `/api/transactions` | Log a new trade |
| GET | `/api/health` | Couchbase connectivity check |

---

## Advisor Copilot (the demo)

The **Wealth Management Advisor Copilot** is the team demo built on top of this scaffold. It adds five
assistant features over a client/holdings/research dataset, exposed under `/api/copilot/*` and surfaced
in the dashboard's **Copilot** view (sidebar → Advisor Copilot).

### Extra setup

```bash
npm run seed:copilot     # loads clients, holdings, research notes, memory, cache from
                         # financial_services_samples.json (normalizes doc_type -> type)
```

For faster client-scoped lookups, add a secondary index in the Capella Query workbench:

```sql
CREATE INDEX idx_copilot_type_client ON `portfolio`(type, client_id);
```

### Copilot endpoints

All copilot routes use a `{ data, error }` envelope (see the integration contract).

| Method | Path | Feature | Owner |
|--------|------|---------|-------|
| GET | `/api/copilot/clients/:id/summary` | Client lookup & summary | Kevin (T1) |
| GET | `/api/copilot/research/search?q=` | Research note search | Vani (T2) |
| GET / PATCH | `/api/copilot/clients/:id/memory` | Client memory assistant | Austin (T3) |
| GET | `/api/copilot/clients/:id/esg` | ESG exposure calculator | JC (T4) |
| POST | `/api/copilot/ask` | Repeat-question cache | Austin (T5) |

Sample clients: `cli_10234` (Priya Nandakumar), `cli_10891` (Marcus Webb).

### Team plans

Each person's self-contained plan lives in [`docs/team-plans/`](docs/team-plans/). **Read the
[integration contract](docs/team-plans/integration-contract.md) first**, then your own file:

- [Kevin — Client summary](docs/team-plans/kevin.md)
- [Vani — Research search](docs/team-plans/vani.md)
- [JC — ESG calculator](docs/team-plans/jc.md)
- [Austin — Memory + cache](docs/team-plans/austin.md)

> **Note on the bucket:** the `portfolio` bucket may also contain a separate fund-trading dataset
> (`type: trade | position | fund`, keys `TRD-*` / `POS-*` / `FUND-*`), loadable via `npm run seed:trading`
> and served under `/api/trading/*`. The copilot queries filter on `type` + `client_id`, so the two
> datasets coexist without interfering.
