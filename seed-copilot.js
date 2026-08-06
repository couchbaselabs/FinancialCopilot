require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');
const extras = require('./sample-extras');

// ─── Task 1 (Kevin): Copilot seed ───────────────────────────────────────────
// Loads financial_services_samples.json, normalizes `doc_type` -> `type`, and
// upserts every doc under the canonical keys defined in the integration contract.
//
// Key conventions (see docs/team-plans/integration-contract.md §3):
//   client_profile        client::<client_id>
//   holding               holding::<client_id>::<symbol>     (+ client_id field)
//   transaction           transaction::<txn_id>
//   research_note         research_note::<note_id>
//   client_memory         client_memory::<client_id>
//   semantic_cache_entry  semantic_cache_entry::<cache_id>

const SAMPLE_FILE = path.join(__dirname, 'financial_services_samples.json');

// Map each sample array -> a function producing the Couchbase doc key.
// Everything is normalized so the stored doc carries `type` (not `doc_type`).
const LOADERS = [
  { arr: 'client_profiles',       key: (d) => `client::${d.client_id}` },
  { arr: 'holdings',              key: (d) => `holding::${d.client_id}::${d.symbol}` },
  { arr: 'transactions',          key: (d) => `transaction::${d.txn_id}` },
  { arr: 'research_notes',        key: (d) => `research_note::${d.note_id}` },
  { arr: 'client_memory',         key: (d) => `client_memory::${d.client_id}` },
  { arr: 'semantic_cache_entries',key: (d) => `semantic_cache_entry::${d.cache_id}` },
];

function normalize(doc) {
  // doc_type -> type; drop doc_type so we never store both.
  const { doc_type, ...rest } = doc;
  return { type: doc_type, ...rest };
}

async function seed() {
  try {
    if (!fs.existsSync(SAMPLE_FILE)) {
      throw new Error(`Sample file not found: ${SAMPLE_FILE}`);
    }
    const sample = JSON.parse(fs.readFileSync(SAMPLE_FILE, 'utf8'));

    const { bucket } = await connect();
    const collection = bucket.defaultCollection();

    let total = 0;
    for (const { arr, key } of LOADERS) {
      const docs = [...(sample[arr] || []), ...(extras[arr] || [])];
      console.log(`Seeding ${arr} (${docs.length})...`);
      for (const raw of docs) {
        const doc = normalize(raw);
        const id = key(raw);
        await collection.upsert(id, { ...doc, seededAt: new Date().toISOString() });
        console.log(`  ✓ ${id}`);
        total++;
      }
    }

    console.log(`\n✅ Copilot seed complete — ${total} docs upserted.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Copilot seed failed:', err.message);
    process.exit(1);
  }
}

seed();
