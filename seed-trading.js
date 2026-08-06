require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

// ─── Trading-demo seed ───────────────────────────────────────────────────────
// Loads portfolio_data.json (the fund-trading dataset: TRD-/POS-/FUND-) into the
// bucket. The docs already carry their own keys and `type` fields, so this just
// upserts each one under its natural key. Idempotent — safe to re-run.
//
// This is the dataset that is live on Kevin's cluster. Keeping the seed in-repo
// means the trading demo can be stood up on any fresh cluster (e.g. a failover
// target) without hand-loading.

const DATA_FILE = path.join(__dirname, 'portfolio_data.json');

async function seed() {
  try {
    if (!fs.existsSync(DATA_FILE)) throw new Error(`Data file not found: ${DATA_FILE}`);
    const docs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    const { bucket } = await connect();
    const collection = bucket.defaultCollection();

    const counts = {};
    let total = 0;
    for (const [key, doc] of Object.entries(docs)) {
      await collection.upsert(key, doc);
      counts[doc.type] = (counts[doc.type] || 0) + 1;
      total++;
    }

    console.log('Seeded by type:', JSON.stringify(counts));
    console.log(`\n✅ Trading seed complete — ${total} docs upserted.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Trading seed failed:', err.message);
    process.exit(1);
  }
}

seed();
