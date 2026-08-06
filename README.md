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
