require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { connect, query } = require('./db');
const llm = require('./llm');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Portfolio Summary ────────────────────────────────────────────────────────
app.get('/api/portfolio/summary', async (req, res) => {
  try {
    const { bucket } = await connect();
    const collection = bucket.defaultCollection();

    const rows = await query(
      `SELECT * FROM \`${process.env.CB_BUCKET || 'portfolio'}\` WHERE type = 'holding' AND client_id IS MISSING`
    );

    let totalValue = 0, totalCost = 0;
    const sectorMap = {};

    rows.forEach(row => {
      const doc = row[process.env.CB_BUCKET || 'portfolio'] || row;
      const value = doc.shares * doc.currentPrice;
      const cost = doc.shares * doc.avgCost;
      totalValue += value;
      totalCost += cost;
      sectorMap[doc.sector] = (sectorMap[doc.sector] || 0) + value;
    });

    const totalGain = totalValue - totalCost;
    const gainPct = ((totalGain / totalCost) * 100).toFixed(2);

    const sectors = Object.entries(sectorMap).map(([name, value]) => ({
      name,
      value: +value.toFixed(2),
      pct: +((value / totalValue) * 100).toFixed(1),
    }));

    res.json({
      totalValue: +totalValue.toFixed(2),
      totalCost: +totalCost.toFixed(2),
      totalGain: +totalGain.toFixed(2),
      gainPct: +gainPct,
      sectors,
      holdingsCount: rows.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── All Holdings ─────────────────────────────────────────────────────────────
app.get('/api/holdings', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM \`${process.env.CB_BUCKET || 'portfolio'}\` WHERE type = 'holding' AND client_id IS MISSING ORDER BY ticker`
    );

    const holdings = rows.map(row => {
      const d = row[process.env.CB_BUCKET || 'portfolio'] || row;
      const marketValue = d.shares * d.currentPrice;
      const costBasis = d.shares * d.avgCost;
      const gain = marketValue - costBasis;
      const gainPct = ((gain / costBasis) * 100).toFixed(2);
      return { ...d, marketValue: +marketValue.toFixed(2), costBasis: +costBasis.toFixed(2), gain: +gain.toFixed(2), gainPct: +gainPct };
    });

    res.json(holdings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Add Holding ──────────────────────────────────────────────────────────────
app.post('/api/holdings', async (req, res) => {
  try {
    const { bucket } = await connect();
    const collection = bucket.defaultCollection();
    const { ticker, name, sector, shares, avgCost, currentPrice } = req.body;

    const doc = {
      type: 'holding', ticker: ticker.toUpperCase(), name, sector,
      shares: +shares, avgCost: +avgCost, currentPrice: +currentPrice,
      updatedAt: new Date().toISOString(),
    };

    await collection.upsert(`holding::${ticker.toUpperCase()}`, doc);
    res.json({ success: true, doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Transactions ─────────────────────────────────────────────────────────────
app.get('/api/transactions', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM \`${process.env.CB_BUCKET || 'portfolio'}\` WHERE type = 'transaction' AND client_id IS MISSING ORDER BY date DESC LIMIT 50`
    );
    const transactions = rows.map(r => r[process.env.CB_BUCKET || 'portfolio'] || r);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Add Transaction ──────────────────────────────────────────────────────────
app.post('/api/transactions', async (req, res) => {
  try {
    const { bucket } = await connect();
    const collection = bucket.defaultCollection();
    const { ticker, type, shares, price, date } = req.body;

    const doc = {
      type: 'transaction', ticker: ticker.toUpperCase(),
      transactionType: type, shares: +shares, price: +price,
      date, createdAt: new Date().toISOString(),
    };

    await collection.upsert(`transaction::${uuidv4()}`, doc);
    res.json({ success: true, doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await connect();
    res.json({ status: 'ok', db: 'Couchbase Capella connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ─── Copilot routes ─────────────────────────────────────────────────────────
// All copilot routes live under /api/copilot/* and use the { data, error }
// envelope. See docs/team-plans/integration-contract.md.
// ════════════════════════════════════════════════════════════════════════════

const BUCKET = process.env.CB_BUCKET || 'portfolio';
const ok   = (res, data)            => res.json({ data, error: null });
const fail = (res, err, code = 500) => res.status(code).json({ data: null, error: err.message || String(err) });

// KV get that returns null instead of throwing when the doc is absent.
async function kvGet(id) {
  try {
    const { bucket } = await connect();
    const { content } = await bucket.defaultCollection().get(id);
    return content;
  } catch (err) {
    if (/document not found|not found|LCB_KEY_ENOENT/i.test(err.message || '')) return null;
    throw err;
  }
}

// ─── LM Studio: BERT embeddings + Gemma inference ───────────────────────────
// Real embeddings power semantic research search and semantic cache matching;
// Gemma answers on a cache miss, grounded in retrieved research notes. All of
// this degrades gracefully to keyword/Jaccard heuristics when LM Studio is down.
const SEM_THRESHOLD = parseFloat(process.env.COPILOT_SEMANTIC_THRESHOLD) || 0.75;

let NOTE_INDEX = null;   // [{ note_id, title, body, tags, published_date, vec }]
let CACHE_INDEX = null;  // [{ cache_id, canonical_query, cached_response, vecs:[{text,vec}] }]

async function buildNoteIndex() {
  if (NOTE_INDEX) return NOTE_INDEX;
  const notes = await query(
    `SELECT r.note_id, r.title, r.body, r.tags, r.published_date
     FROM \`${BUCKET}\` AS r WHERE r.type = 'research_note'`
  );
  const vecs = await llm.embed(notes.map(n => `${n.title}. ${(n.body || '').slice(0, 1200)}`));
  NOTE_INDEX = notes.map((n, i) => ({ ...n, vec: vecs[i] }));
  return NOTE_INDEX;
}

async function buildCacheIndex() {
  if (CACHE_INDEX) return CACHE_INDEX;
  const entries = await query(
    `SELECT c.cache_id, c.canonical_query, c.observed_variants, c.cached_response
     FROM \`${BUCKET}\` AS c WHERE c.type = 'semantic_cache_entry'`
  );
  CACHE_INDEX = [];
  for (const e of entries) {
    const texts = [e.canonical_query, ...(e.observed_variants || [])].filter(Boolean);
    const vecs = await llm.embed(texts);
    CACHE_INDEX.push({
      cache_id: e.cache_id, canonical_query: e.canonical_query, cached_response: e.cached_response,
      vecs: texts.map((t, i) => ({ text: t, vec: vecs[i] })),
    });
  }
  return CACHE_INDEX;
}

// Is LM Studio reachable + models loaded?
app.get('/api/copilot/llm/health', async (req, res) => {
  const available = await llm.available();
  ok(res, { available, embed_model: llm.config.EMBED_MODEL, chat_model: llm.config.CHAT_MODEL, base: llm.config.BASE });
});

// ─── Kevin · Task 1: Client lookup & summary ────────────────────────────────
app.get('/api/copilot/clients/:clientId/summary', async (req, res) => {
  try {
    const { clientId } = req.params;
    const profile = await kvGet(`client::${clientId}`);
    if (!profile) return fail(res, new Error(`Client ${clientId} not found`), 404);

    const holdings = await query(
      `SELECT h.symbol, h.asset_class, h.market_value_usd, h.esg_screened, h.quantity
       FROM \`${BUCKET}\` AS h
       WHERE h.type = 'holding' AND h.client_id = $cid AND h.client_id IS NOT MISSING`,
      { cid: clientId }
    );

    const total = holdings.reduce((s, h) => s + (h.market_value_usd || 0), 0);
    const byClass = {};
    let screened = 0;
    holdings.forEach(h => {
      byClass[h.asset_class] = (byClass[h.asset_class] || 0) + (h.market_value_usd || 0);
      if (h.esg_screened) screened += h.market_value_usd || 0;
    });
    const assetMix = {};
    Object.entries(byClass).forEach(([k, v]) => { assetMix[k] = total ? +(v / total).toFixed(3) : 0; });
    const top = holdings.slice().sort((a, b) => b.market_value_usd - a.market_value_usd)[0] || null;
    const esgPct = total ? +(screened / total).toFixed(3) : 0;
    const equityPct = Math.round((assetMix.equity || 0) * 100);

    const fmt = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(1)}K`;
    const narrative =
      `${profile.name} holds ${fmt(total)} across ${holdings.length} position${holdings.length === 1 ? '' : 's'} — ` +
      `${equityPct}% equities, ${Math.round(esgPct * 100)}% ESG-screened` +
      (top ? `, concentrated in ${top.symbol}` : '') +
      `. ${profile.risk_tolerance ? profile.risk_tolerance.charAt(0).toUpperCase() + profile.risk_tolerance.slice(1) + ' risk tolerance.' : ''}`.trimEnd();

    ok(res, {
      client_id: clientId,
      name: profile.name,
      risk_tolerance: profile.risk_tolerance,
      investable_assets_usd: profile.investable_assets_usd,
      total_market_value_usd: +total.toFixed(2),
      position_count: holdings.length,
      asset_mix: assetMix,
      esg_screened_pct: esgPct,
      top_position: top ? { symbol: top.symbol, market_value_usd: top.market_value_usd } : null,
      narrative,
    });
  } catch (err) { console.error(err); fail(res, err); }
});

// ─── Vani · Task 2: Research note search ────────────────────────────────────
const STOPWORDS = new Set(['the','a','an','my','is','are','to','of','for','and','or','in','on','what','how','should','i','be','about','with','do','does','me']);
const SYNONYMS = { bond: 'fixed_income', bonds: 'fixed_income', stock: 'equity', stocks: 'equity', sustainable: 'esg', green: 'esg', duration: 'duration_risk', tech: 'tech' };

// Build a snippet + matched terms for highlighting (shared by both paths).
function snippetFor(q, note) {
  const body = note.body || '';
  const low = body.toLowerCase();
  const qTerms = q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !STOPWORDS.has(t));
  let snippet = body.slice(0, 180);
  const hit = qTerms.find(t => low.includes(t));
  if (hit) { const idx = low.indexOf(hit); snippet = body.slice(Math.max(0, idx - 50), idx + 140).trim(); }
  const matched = qTerms.filter(t => low.includes(t) || (note.title || '').toLowerCase().includes(t));
  return { snippet: snippet + '...', matched_terms: [...new Set(matched)] };
}

app.get('/api/copilot/research/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString();
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit, 10) || 5));
    if (!q.trim()) return ok(res, { query: q, results: [], mode: 'none' });

    // ── Semantic path (BERT embeddings) ──
    if (await llm.available()) {
      const [qvec, index] = await Promise.all([llm.embed(q), buildNoteIndex()]);
      const scored = index.map(n => {
        const { snippet, matched_terms } = snippetFor(q, n);
        return { note_id: n.note_id, title: n.title, score: +llm.cosine(qvec, n.vec).toFixed(3), matched_terms, snippet, tags: n.tags, published_date: n.published_date };
      }).sort((a, b) => b.score - a.score).slice(0, limit);
      return ok(res, { query: q, results: scored, mode: 'semantic' });
    }

    // ── Keyword fallback (LM Studio unavailable) ──
    const tokens = q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t && !STOPWORDS.has(t));
    const terms = [...new Set(tokens.flatMap(t => SYNONYMS[t] ? [t, SYNONYMS[t]] : [t]))];
    const notes = await query(
      `SELECT r.note_id, r.title, r.body, r.tags, r.published_date
       FROM \`${BUCKET}\` AS r WHERE r.type = 'research_note'`
    );
    const scored = notes.map(n => {
      const title = (n.title || '').toLowerCase();
      const body = (n.body || '').toLowerCase();
      const tags = (n.tags || []).map(t => t.toLowerCase());
      const matched = [];
      let raw = 0;
      terms.forEach(t => {
        if (tags.includes(t)) { raw += 3; matched.push(t); }
        else if (title.includes(t)) { raw += 2; matched.push(t); }
        else if (body.includes(t)) { raw += 1; matched.push(t); }
      });
      const score = +(raw / (terms.length * 3 || 1)).toFixed(2);
      let snippet = (n.body || '').slice(0, 160);
      const firstTerm = matched.find(t => body.includes(t));
      if (firstTerm) { const idx = body.indexOf(firstTerm); snippet = (n.body || '').slice(Math.max(0, idx - 40), idx + 120).trim(); }
      return { note_id: n.note_id, title: n.title, score, matched_terms: [...new Set(matched)], snippet: snippet + '...', tags: n.tags, published_date: n.published_date, _raw: raw };
    }).filter(n => n._raw > 0).sort((a, b) => b._raw - a._raw).slice(0, limit).map(({ _raw, ...n }) => n);

    ok(res, { query: q, results: scored, mode: 'keyword' });
  } catch (err) { console.error(err); fail(res, err); }
});

// ─── Austin · Task 3: Client memory assistant ───────────────────────────────
app.get('/api/copilot/clients/:clientId/memory', async (req, res) => {
  try {
    const { clientId } = req.params;
    const mem = await kvGet(`client_memory::${clientId}`);
    ok(res, mem || { client_id: clientId, memory_summary: '', key_facts: [], last_updated: null, source_meetings: [] });
  } catch (err) { console.error(err); fail(res, err); }
});

app.patch('/api/copilot/clients/:clientId/memory', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { add_fact, memory_summary } = req.body || {};
    const { bucket } = await connect();
    const collection = bucket.defaultCollection();
    const id = `client_memory::${clientId}`;

    const existing = await kvGet(id) || { type: 'client_memory', client_id: clientId, memory_summary: '', key_facts: [], source_meetings: [] };
    if (add_fact && !existing.key_facts.includes(add_fact)) existing.key_facts.push(add_fact);
    if (typeof memory_summary === 'string') existing.memory_summary = memory_summary;
    existing.type = 'client_memory';
    existing.client_id = clientId;
    existing.last_updated = new Date().toISOString();

    await collection.upsert(id, existing);
    ok(res, existing);
  } catch (err) { console.error(err); fail(res, err); }
});

// ─── JC · Task 4: ESG exposure calculator ───────────────────────────────────
app.get('/api/copilot/clients/:clientId/esg', async (req, res) => {
  try {
    const { clientId } = req.params;
    const profile = await kvGet(`client::${clientId}`);
    if (!profile) return fail(res, new Error(`Client ${clientId} not found`), 404);

    const holdings = await query(
      `SELECT h.symbol, h.market_value_usd, h.esg_screened
       FROM \`${BUCKET}\` AS h
       WHERE h.type = 'holding' AND h.client_id = $cid AND h.client_id IS NOT MISSING`,
      { cid: clientId }
    );

    const total = holdings.reduce((s, h) => s + (h.market_value_usd || 0), 0);
    const screened = holdings.filter(h => h.esg_screened).reduce((s, h) => s + (h.market_value_usd || 0), 0);
    const pct = total ? +(screened / total).toFixed(3) : 0;
    const pref = profile.esg_preference === true;

    let alignment = 'not_applicable', note = 'Client has no stated ESG preference.';
    if (pref && pct < 0.5) { alignment = 'misaligned'; note = `Only ${Math.round(pct * 100)}% ESG-screened despite a stated ESG preference — review.`; }
    else if (pref) { alignment = 'aligned'; note = `${Math.round(pct * 100)}% ESG-screened, consistent with client's stated ESG preference.`; }

    ok(res, {
      client_id: clientId,
      esg_preference: pref,
      total_market_value_usd: +total.toFixed(2),
      esg_screened_value_usd: +screened.toFixed(2),
      non_screened_value_usd: +(total - screened).toFixed(2),
      esg_screened_pct: pct,
      breakdown: holdings.map(h => ({ symbol: h.symbol, market_value_usd: h.market_value_usd, esg_screened: !!h.esg_screened })),
      alignment,
      alignment_note: note,
    });
  } catch (err) { console.error(err); fail(res, err); }
});

// ─── Austin · Task 5: Repeat-question cache (embeddings) + Gemma inference ───
const CACHE_THRESHOLD = parseFloat(process.env.COPILOT_CACHE_SIMILARITY_THRESHOLD) || 0.82;

function tokenSet(s) {
  return new Set((s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t && !STOPWORDS.has(t)));
}
function jaccard(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
  return inter / (A.size + B.size - inter);
}

// Bump hit_count / record a new phrasing on a cache hit.
async function cacheWriteThrough(cacheId, question) {
  try {
    const { bucket } = await connect();
    const id = `semantic_cache_entry::${cacheId}`;
    const doc = await kvGet(id);
    if (!doc) return;
    doc.hit_count = (doc.hit_count || 0) + 1;
    doc.last_hit = new Date().toISOString();
    doc.observed_variants = doc.observed_variants || [];
    if (!doc.observed_variants.includes(question) && question.toLowerCase() !== (doc.canonical_query || '').toLowerCase()) {
      doc.observed_variants.push(question);
    }
    await bucket.defaultCollection().upsert(id, doc);
  } catch (e) { console.error('cache write-through failed:', e.message); }
}

// Jaccard fallback when LM Studio is unavailable.
async function askHeuristic(res, question) {
  const entries = await query(
    `SELECT c.cache_id, c.canonical_query, c.observed_variants, c.cached_response
     FROM \`${BUCKET}\` AS c WHERE c.type = 'semantic_cache_entry'`
  );
  let best = { score: 0, entry: null, against: null };
  entries.forEach(e => {
    [e.canonical_query, ...(e.observed_variants || [])].forEach(candidate => {
      const s = jaccard(question, candidate);
      if (s > best.score) best = { score: s, entry: e, against: candidate };
    });
  });
  const hit = best.entry && best.score >= CACHE_THRESHOLD;
  if (hit) await cacheWriteThrough(best.entry.cache_id, question);
  return ok(res, {
    question, cache_hit: !!hit, mode: 'heuristic',
    matched_cache_id: hit ? best.entry.cache_id : null,
    match_score: +best.score.toFixed(2),
    matched_against: hit ? best.against : null,
    answer: hit ? best.entry.cached_response : 'No cached answer for this question yet — ask your advisor, or try the research search.',
    model: null, sources: [],
  });
}

app.post('/api/copilot/ask', async (req, res) => {
  try {
    const question = (req.body && req.body.question || '').toString();
    if (!question.trim()) return fail(res, new Error('question is required'), 400);
    const clientId = req.body && req.body.client_id;

    if (!(await llm.available())) return askHeuristic(res, question);

    const qvec = await llm.embed(question);

    // 1) Semantic cache match (cosine over canonical + observed variants).
    const cacheIdx = await buildCacheIndex();
    let best = { score: 0, entry: null, against: null };
    for (const e of cacheIdx) {
      for (const v of e.vecs) {
        const s = llm.cosine(qvec, v.vec);
        if (s > best.score) best = { score: s, entry: e, against: v.text };
      }
    }
    if (best.entry && best.score >= SEM_THRESHOLD) {
      await cacheWriteThrough(best.entry.cache_id, question);
      return ok(res, {
        question, cache_hit: true, mode: 'cache',
        matched_cache_id: best.entry.cache_id, match_score: +best.score.toFixed(3),
        matched_against: best.against, answer: best.entry.cached_response, model: null, sources: [],
      });
    }

    // 2) Miss → retrieve top research notes and let Gemma answer, grounded.
    const notes = await buildNoteIndex();
    const top = notes.map(n => ({ n, s: llm.cosine(qvec, n.vec) })).sort((a, b) => b.s - a.s).slice(0, 3);
    const ctx = top.map((t, i) => `[${i + 1}] ${t.n.title}: ${(t.n.body || '').slice(0, 400)}`).join('\n');

    let clientCtx = '';
    if (clientId) {
      const prof = await kvGet(`client::${clientId}`);
      const mem = await kvGet(`client_memory::${clientId}`);
      if (prof) clientCtx = `\nClient context — ${prof.name}, risk tolerance ${prof.risk_tolerance}, ESG preference ${prof.esg_preference}.` +
        (mem && mem.key_facts && mem.key_facts.length ? ` Notes: ${mem.key_facts.join('; ')}.` : '');
    }

    const prompt =
      `You are FinBase, a wealth management advisor copilot. Answer the advisor's question in 2-4 sentences, ` +
      `grounded in the research context when relevant. Be accurate and conservative; if the context doesn't cover it, ` +
      `answer briefly from general knowledge and suggest confirming with the advisor. Do not invent specific numbers.\n\n` +
      `Research context:\n${ctx || '(none)'}\n${clientCtx}\n\nQuestion: ${question}\n\nAnswer:`;

    const answer = await llm.chat(prompt);

    // Write-through: store the generated Q/A as a cache entry so repeats hit next time.
    const newId = `gen_${Date.now()}`;
    try {
      const { bucket } = await connect();
      await bucket.defaultCollection().upsert(`semantic_cache_entry::${newId}`, {
        type: 'semantic_cache_entry', cache_id: newId, canonical_query: question,
        observed_variants: [], cached_response: answer, source: 'generated',
        hit_count: 0, ttl_seconds: 86400, last_hit: new Date().toISOString(),
      });
      if (CACHE_INDEX) CACHE_INDEX.push({ cache_id: newId, canonical_query: question, cached_response: answer, vecs: [{ text: question, vec: qvec }] });
    } catch (e) { console.error('cache store failed:', e.message); }

    ok(res, {
      question, cache_hit: false, mode: 'generated',
      matched_cache_id: null, match_score: +best.score.toFixed(3), matched_against: null,
      answer, model: llm.config.CHAT_MODEL,
      sources: top.map(t => ({ note_id: t.n.note_id, title: t.n.title, score: +t.s.toFixed(3) })),
    });
  } catch (err) { console.error(err); fail(res, err); }
});

// ════════════════════════════════════════════════════════════════════════════
// ─── Trading routes ─────────────────────────────────────────────────────────
// Fund-trading demo over the LIVE data model (type: trade | position | fund;
// keys TRD-* / POS-<ticker>-<fund> / FUND-<fund>). Separate namespace from the
// wealth-management copilot above. Uses the same { data, error } envelope.
// ════════════════════════════════════════════════════════════════════════════

// List all funds (metadata + performance), largest AUM first.
app.get('/api/trading/funds', async (req, res) => {
  try {
    const funds = await query(
      `SELECT f.fund_id, f.name, f.aum, f.manager, f.benchmark, f.ytd_return, f.sharpe_ratio, f.inception
       FROM \`${BUCKET}\` AS f WHERE f.type = 'fund' ORDER BY f.aum DESC`
    );
    ok(res, { funds, count: funds.length });
  } catch (err) { console.error(err); fail(res, err); }
});

// Fund summary: metadata + position aggregate + top holdings + trade count.
app.get('/api/trading/funds/:fund/summary', async (req, res) => {
  try {
    const { fund } = req.params; // fund name, e.g. "Apex-Alpha"
    const meta = await kvGet(`FUND-${fund}`);
    if (!meta) return fail(res, new Error(`Fund ${fund} not found`), 404);

    const [agg] = await query(
      `SELECT SUM(p.market_value) AS market_value, SUM(p.unrealized_pnl) AS unrealized_pnl, COUNT(*) AS positions
       FROM \`${BUCKET}\` AS p WHERE p.type = 'position' AND p.fund = $fund`,
      { fund }
    );
    const top = await query(
      `SELECT p.ticker, p.market_value, p.weight_pct, p.unrealized_pnl
       FROM \`${BUCKET}\` AS p WHERE p.type = 'position' AND p.fund = $fund
       ORDER BY p.market_value DESC LIMIT 5`,
      { fund }
    );
    const [trades] = await query(
      `SELECT COUNT(*) AS n FROM \`${BUCKET}\` AS t WHERE t.type = 'trade' AND t.fund = $fund`,
      { fund }
    );

    ok(res, {
      fund_id: meta.fund_id,
      name: meta.name,
      manager: meta.manager,
      benchmark: meta.benchmark,
      aum: meta.aum,
      ytd_return: meta.ytd_return,
      sharpe_ratio: meta.sharpe_ratio,
      position_count: agg.positions || 0,
      positions_market_value: +(agg.market_value || 0).toFixed(2),
      unrealized_pnl: +(agg.unrealized_pnl || 0).toFixed(2),
      trade_count: trades.n || 0,
      top_positions: top,
    });
  } catch (err) { console.error(err); fail(res, err); }
});

// Positions, optionally scoped to one fund, largest market value first.
app.get('/api/trading/positions', async (req, res) => {
  try {
    const { fund } = req.query;
    const where = fund ? `p.type = 'position' AND p.fund = $fund` : `p.type = 'position'`;
    const positions = await query(
      `SELECT p.position_id, p.ticker, p.fund, p.quantity, p.avg_cost, p.current_price, p.market_value, p.unrealized_pnl, p.weight_pct
       FROM \`${BUCKET}\` AS p WHERE ${where} ORDER BY p.market_value DESC`,
      fund ? { fund } : {}
    );
    ok(res, { positions, count: positions.length });
  } catch (err) { console.error(err); fail(res, err); }
});

// Trade blotter search: filter by fund / trader / ticker / side, newest first.
app.get('/api/trading/trades', async (req, res) => {
  try {
    const { fund, trader, ticker, side } = req.query;
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const clauses = [`t.type = 'trade'`];
    const params = {};
    if (fund)   { clauses.push('t.fund = $fund');       params.fund = fund; }
    if (trader) { clauses.push('t.trader = $trader');   params.trader = trader; }
    if (ticker) { clauses.push('t.ticker = $ticker');   params.ticker = ticker.toUpperCase(); }
    if (side)   { clauses.push('t.side = $side');       params.side = side.toUpperCase(); }
    const trades = await query(
      `SELECT t.trade_id, t.ticker, t.fund, t.trader, t.side, t.quantity, t.price, t.notional, t.venue, t.risk_score, t.status, t.timestamp
       FROM \`${BUCKET}\` AS t WHERE ${clauses.join(' AND ')} ORDER BY t.timestamp DESC LIMIT ${limit}`,
      params
    );
    ok(res, { trades, count: trades.length, filters: { fund, trader, ticker, side, limit } });
  } catch (err) { console.error(err); fail(res, err); }
});

// Risk analytics: high-risk trade exposure, venue breakdown, per-fund avg risk.
app.get('/api/trading/risk', async (req, res) => {
  try {
    const threshold = parseFloat(req.query.threshold) || 0.8;
    const [high] = await query(
      `SELECT COUNT(*) AS n, SUM(t.notional) AS notional
       FROM \`${BUCKET}\` AS t WHERE t.type = 'trade' AND t.risk_score >= $thr`,
      { thr: threshold }
    );
    const byVenue = await query(
      `SELECT t.venue, COUNT(*) AS trades, SUM(t.notional) AS notional, AVG(t.risk_score) AS avg_risk
       FROM \`${BUCKET}\` AS t WHERE t.type = 'trade' GROUP BY t.venue ORDER BY notional DESC`
    );
    const byFund = await query(
      `SELECT t.fund, COUNT(*) AS trades, AVG(t.risk_score) AS avg_risk, SUM(t.notional) AS notional
       FROM \`${BUCKET}\` AS t WHERE t.type = 'trade' GROUP BY t.fund ORDER BY avg_risk DESC`
    );
    ok(res, {
      threshold,
      high_risk_trades: high.n || 0,
      high_risk_notional: +(high.notional || 0).toFixed(2),
      by_venue: byVenue.map(v => ({ ...v, notional: +(v.notional || 0).toFixed(2), avg_risk: +(v.avg_risk || 0).toFixed(3) })),
      by_fund: byFund.map(f => ({ ...f, notional: +(f.notional || 0).toFixed(2), avg_risk: +(f.avg_risk || 0).toFixed(3) })),
    });
  } catch (err) { console.error(err); fail(res, err); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 API running on port ${PORT}`));
