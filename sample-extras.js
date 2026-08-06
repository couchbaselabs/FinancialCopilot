// ─── Additional sample portfolios for the copilot demo ───────────────────────
// Non-destructive extension of financial_services_samples.json. seed-copilot.js
// merges these arrays with the base file before upserting. Add more client rows
// to CLIENTS to grow the demo — holdings/transactions/memory are expanded from
// each compact definition below.
//
// esg_screened mix is intentional so JC's ESG calculator shows all three states:
//   - ESG pref + mostly screened   -> "aligned"
//   - ESG pref + mostly unscreened -> "misaligned"   (good demo moment)
//   - no ESG pref                  -> "not_applicable"

const CLIENTS = [
  {
    id: 'cli_10300', name: 'Sofia Alvarez', advisor: 'adv_502',
    risk: 'conservative', assets: 3200000, esg: true, marital: 'married', deps: 1,
    goals: ['retirement_2038', 'legacy_planning'],
    holds: [
      ['ESGU', 'equity', true, 540000], ['SUSA', 'equity', true, 380000],
      ['MSFT', 'equity', false, 210000], ['VCEB', 'fixed_income', true, 260000],
      ['BND', 'fixed_income', false, 190000],
    ],
    txns: [['ESGU', 'buy', 120000, '2026-05-12'], ['BND', 'sell', 60000, '2026-06-20']],
    memory: 'Sofia prioritizes sustainable investing and capital preservation ahead of a 2038 retirement. Prefers ESG-screened equities and investment-grade bonds; wants to avoid single-stock concentration.',
    facts: ['Strong ESG preference', 'Capital preservation focus', 'Avoid single-stock concentration'],
    meetings: ['mtg_2026_05_12'],
  },
  {
    id: 'cli_10412', name: 'David Okafor', advisor: 'adv_517',
    risk: 'moderate', assets: 1150000, esg: false, marital: 'married', deps: 3,
    goals: ['college_funding_2032', 'retirement_2045'],
    holds: [
      ['VOO', 'equity', false, 320000], ['AAPL', 'equity', false, 180000],
      ['JPM', 'equity', false, 140000], ['AGG', 'fixed_income', false, 210000],
    ],
    txns: [['VOO', 'buy', 90000, '2026-04-30'], ['AAPL', 'buy', 45000, '2026-06-01']],
    memory: 'David is funding three children\'s education and balancing growth with stability. No ESG mandate. Interested in tax-efficient 529 strategies.',
    facts: ['Three dependents, college funding priority', 'No ESG mandate', 'Interested in 529 tax strategies'],
    meetings: ['mtg_2026_04_30'],
  },
  {
    id: 'cli_10533', name: 'Emily Chen', advisor: 'adv_517',
    risk: 'aggressive', assets: 890000, esg: true, marital: 'single', deps: 0,
    goals: ['early_retirement_2040', 'home_purchase_2029'],
    holds: [
      ['NVDA', 'equity', false, 240000], ['QQQ', 'equity', false, 180000],
      ['ARKK', 'equity', false, 95000], ['ESGV', 'equity', true, 70000],
    ],
    txns: [['NVDA', 'buy', 80000, '2026-05-22'], ['ARKK', 'buy', 30000, '2026-06-15']],
    memory: 'Emily states an ESG preference but her portfolio is concentrated in high-growth tech that is largely not ESG-screened. Flag the mismatch at the next review. Saving for a 2029 home purchase.',
    facts: ['Stated ESG preference but tech-heavy, mostly unscreened', 'Home purchase target 2029', 'High risk tolerance'],
    meetings: ['mtg_2026_05_22'],
  },
  {
    id: 'cli_10644', name: 'Robert Kim', advisor: 'adv_502',
    risk: 'moderate', assets: 2400000, esg: false, marital: 'married', deps: 2,
    goals: ['retirement_2035', 'second_home'],
    holds: [
      ['SPY', 'equity', false, 480000], ['BRK.B', 'equity', false, 260000],
      ['V', 'equity', false, 150000], ['TLT', 'fixed_income', false, 220000],
      ['MUB', 'fixed_income', false, 190000],
    ],
    txns: [['SPY', 'buy', 100000, '2026-03-18'], ['TLT', 'sell', 55000, '2026-05-09']],
    memory: 'Robert wants a balanced allocation with municipal bond exposure for tax efficiency. Planning a second-home purchase around 2031 that may need liquidity.',
    facts: ['Balanced allocation, tax-aware', 'Muni bond exposure preferred', 'Second-home liquidity event ~2031'],
    meetings: ['mtg_2026_03_18'],
  },
  {
    id: 'cli_10755', name: 'Aisha Patel', advisor: 'adv_502',
    risk: 'conservative', assets: 5600000, esg: true, marital: 'married', deps: 2,
    goals: ['wealth_preservation', 'philanthropy'],
    holds: [
      ['ESGU', 'equity', true, 900000], ['SUSA', 'equity', true, 640000],
      ['VCEB', 'fixed_income', true, 520000], ['BNDX', 'fixed_income', false, 300000],
      ['PG', 'equity', false, 180000],
    ],
    txns: [['ESGU', 'buy', 200000, '2026-04-11'], ['VCEB', 'buy', 120000, '2026-06-03']],
    memory: 'Aisha is a high-net-worth client focused on preservation and philanthropic giving. Strong ESG conviction; interested in impact-oriented fixed income and donor-advised fund strategies.',
    facts: ['HNW, preservation + philanthropy', 'Strong ESG conviction', 'Interested in impact fixed income & DAF'],
    meetings: ['mtg_2026_04_11'],
  },
  {
    id: 'cli_10866', name: 'Thomas Wright', advisor: 'adv_531',
    risk: 'aggressive', assets: 720000, esg: false, marital: 'single', deps: 0,
    goals: ['aggressive_growth', 'early_retirement_2038'],
    holds: [
      ['TSLA', 'equity', false, 210000], ['META', 'equity', false, 160000],
      ['GOOGL', 'equity', false, 130000], ['AMZN', 'equity', false, 120000],
    ],
    txns: [['TSLA', 'buy', 70000, '2026-05-28'], ['META', 'sell', 40000, '2026-06-22']],
    memory: 'Thomas seeks maximum growth and is comfortable with volatility. No ESG mandate. Actively trades mega-cap tech; discussed concentration risk ahead of Q3 earnings.',
    facts: ['Max growth, high volatility tolerance', 'Mega-cap tech concentration', 'No ESG mandate'],
    meetings: ['mtg_2026_05_28'],
  },
];

// Expand compact defs into full docs (doc_type kept; seed normalizes to `type`).
const client_profiles = CLIENTS.map(c => ({
  doc_type: 'client_profile', client_id: c.id, name: c.name, advisor_id: c.advisor,
  risk_tolerance: c.risk, investable_assets_usd: c.assets, goals: c.goals,
  esg_preference: c.esg, household: { marital_status: c.marital, dependents: c.deps },
  last_review_date: '2026-06-30',
}));

const holdings = CLIENTS.flatMap(c => c.holds.map(([symbol, cls, esg, mv]) => ({
  doc_type: 'holding', client_id: c.id, symbol, asset_class: cls,
  quantity: Math.max(1, Math.round(mv / 250)), market_value_usd: mv,
  esg_screened: esg, as_of: '2026-07-27',
})));

const transactions = CLIENTS.flatMap((c, ci) => c.txns.map(([symbol, action, amt, date], ti) => ({
  doc_type: 'transaction', client_id: c.id,
  txn_id: `txn_9${String(ci)}${String(ti)}${String(Math.round(amt / 1000)).padStart(3, '0')}`,
  symbol, action, amount_usd: amt, txn_date: date,
})));

const client_memory = CLIENTS.map(c => ({
  doc_type: 'client_memory', client_id: c.id, memory_summary: c.memory,
  key_facts: c.facts, last_updated: '2026-06-30T12:00:00Z', source_meetings: c.meetings,
}));

// A few more research notes to make Vani's search richer.
const research_notes = [
  {
    doc_type: 'research_note', note_id: 'note_5701',
    title: 'Municipal Bonds: Tax-Equivalent Yield in 2026',
    body: 'For high-bracket investors, munis continue to offer attractive tax-equivalent yields. We favor high-grade general obligation and essential-service revenue bonds for clients seeking tax-efficient income...',
    tags: ['fixed_income', 'municipal', 'tax'], published_date: '2026-07-14',
    embedding: [0.10, -0.38, 0.12, 0.27, -0.06, 0.20, -0.22, 0.04],
  },
  {
    doc_type: 'research_note', note_id: 'note_5715',
    title: 'Sustainable Fixed Income: Green and Impact Bonds',
    body: 'Demand for green and social bonds continues to grow. We highlight impact-oriented fixed income sleeves suitable for ESG-focused clients seeking to align bond allocations with sustainability goals...',
    tags: ['esg', 'fixed_income', 'impact'], published_date: '2026-07-16',
    embedding: [-0.05, 0.24, 0.39, -0.12, 0.31, -0.07, 0.06, 0.24],
  },
  {
    doc_type: 'research_note', note_id: 'note_5730',
    title: 'Retirement Income: Sustainable Withdrawal Rates Revisited',
    body: 'With current yields and equity valuations, we revisit safe withdrawal rate assumptions for clients nearing retirement. A dynamic spending approach can improve portfolio longevity versus a static 4% rule...',
    tags: ['retirement', 'withdrawal', 'planning'], published_date: '2026-07-20',
    embedding: [0.28, 0.09, -0.20, 0.05, -0.14, 0.33, 0.12, -0.03],
  },
];

// More cache entries so the "Ask the Copilot" bar hits on more topics.
const semantic_cache_entries = [
  {
    doc_type: 'semantic_cache_entry', cache_id: 'cache_fin_002',
    canonical_query: 'How does ESG screening affect my portfolio?',
    observed_variants: ['what does esg screening do to my holdings', 'are my investments esg screened', 'how much of my portfolio is sustainable'],
    query_embedding: [-0.06, 0.23, 0.40, -0.13, 0.32, -0.08, 0.05, 0.25],
    cached_response: 'ESG screening filters holdings against environmental, social, and governance criteria. Your ESG exposure panel shows the screened vs. non-screened split; where a stated preference and low screened percentage diverge, we flag it for review with your advisor.',
    hit_count: 0, ttl_seconds: 86400, last_hit: null,
  },
  {
    doc_type: 'semantic_cache_entry', cache_id: 'cache_fin_003',
    canonical_query: 'Am I too concentrated in technology stocks?',
    observed_variants: ['is my portfolio too tech heavy', 'do i have too much in tech', 'concentration risk in technology'],
    query_embedding: [0.35, 0.12, -0.28, 0.08, -0.17, 0.41, 0.14, -0.05],
    cached_response: 'Concentration in mega-cap technology raises single-sector risk. Our Q3 note advises clients with aggressive growth mandates to review technology weight ahead of earnings season and consider diversification.',
    hit_count: 0, ttl_seconds: 86400, last_hit: null,
  },
  {
    doc_type: 'semantic_cache_entry', cache_id: 'cache_fin_004',
    canonical_query: 'How much can I safely withdraw in retirement?',
    observed_variants: ['what is a safe withdrawal rate', 'how much can i take out each year in retirement', 'is the 4 percent rule still valid'],
    query_embedding: [0.27, 0.08, -0.19, 0.06, -0.13, 0.32, 0.11, -0.02],
    cached_response: 'Safe withdrawal rates depend on time horizon, allocation, and market conditions. Our latest retirement-income research suggests a dynamic spending approach can improve portfolio longevity versus a static 4% rule.',
    hit_count: 0, ttl_seconds: 86400, last_hit: null,
  },
  {
    doc_type: 'semantic_cache_entry', cache_id: 'cache_fin_005',
    canonical_query: 'Should I invest in municipal bonds for tax efficiency?',
    observed_variants: ['are muni bonds good for taxes', 'should i buy municipal bonds', 'tax efficient bond options'],
    query_embedding: [0.11, -0.37, 0.13, 0.26, -0.07, 0.19, -0.21, 0.05],
    cached_response: 'For high-bracket investors, municipal bonds can offer attractive tax-equivalent yields. We favor high-grade general obligation and essential-service revenue bonds for tax-efficient income.',
    hit_count: 0, ttl_seconds: 86400, last_hit: null,
  },
];

module.exports = { client_profiles, holdings, transactions, client_memory, research_notes, semantic_cache_entries };
