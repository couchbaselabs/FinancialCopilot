// ─── LM Studio client (OpenAI-compatible local API) ──────────────────────────
// Embeddings (BERT / BGE-M3) for semantic cache matching + research retrieval,
// and Gemma for answer generation. All config via env with sensible defaults.

const BASE        = process.env.LMSTUDIO_BASE_URL   || 'http://localhost:1234/v1';
// NOTE: these are the LM Studio API identifiers (from `lms ps`), not the GGUF
// filenames. bge-m3 is the BERT-arch embedder; gemma-4-e4b is the E4B instruct.
const EMBED_MODEL = process.env.LMSTUDIO_EMBED_MODEL || 'text-embedding-bge-m3-embeddings';
const CHAT_MODEL  = process.env.LMSTUDIO_CHAT_MODEL  || 'google/gemma-4-e4b';
const EMBED_TIMEOUT = parseInt(process.env.LMSTUDIO_EMBED_TIMEOUT_MS, 10) || 20000;
const CHAT_TIMEOUT  = parseInt(process.env.LMSTUDIO_CHAT_TIMEOUT_MS, 10)  || 45000;

async function post(path, body, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`LM Studio ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// Single or batch embeddings. Pass a string or array of strings.
async function embed(input) {
  const j = await post('/embeddings', { model: EMBED_MODEL, input }, EMBED_TIMEOUT);
  const vecs = (j.data || []).sort((a, b) => a.index - b.index).map(d => d.embedding);
  return Array.isArray(input) ? vecs : vecs[0];
}

// Chat completion via Gemma. Gemma's template has no system role, so we fold
// everything into a single user turn. gemma-4-e4b is a reasoning model: it emits
// "thinking" tokens before the final answer, so the budget must cover both, and
// we fall back to reasoning_content if the answer field is somehow empty.
async function chat(prompt, opts = {}) {
  const j = await post('/chat/completions', {
    model: CHAT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 900,
    stream: false,
  }, CHAT_TIMEOUT);
  const msg = j.choices?.[0]?.message || {};
  const answer = (msg.content || '').trim();
  return answer || (msg.reasoning_content || '').trim();
}

const ROOT = BASE.replace(/\/v1\/?$/, ''); // LM Studio native REST lives at /api/v0

// Detailed status via LM Studio's native endpoint, which reports per-model
// load state ("loaded" vs "not-loaded") — /v1/models lists *downloaded* models
// even when none are loaded, so it can't tell us if inference will actually work.
async function status() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(ROOT + '/api/v0/models', { signal: ctrl.signal });
    if (!r.ok) return { reachable: true, loaded: [], embed_loaded: false, chat_loaded: false };
    const j = await r.json();
    const loaded = (j.data || []).filter(m => m.state === 'loaded').map(m => m.id);
    return {
      reachable: true, loaded,
      embed_loaded: loaded.includes(EMBED_MODEL),
      chat_loaded: loaded.includes(CHAT_MODEL),
    };
  } catch {
    return { reachable: false, loaded: [], embed_loaded: false, chat_loaded: false };
  } finally {
    clearTimeout(timer);
  }
}

// Available for the embedding-backed paths (search + semantic cache).
async function available() {
  return (await status()).embed_loaded;
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

module.exports = { embed, chat, available, status, cosine, config: { BASE, EMBED_MODEL, CHAT_MODEL } };
