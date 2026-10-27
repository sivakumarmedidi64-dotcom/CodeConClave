// CodeConClave AI — clean build. Talks ONLY to our own tuned model, grounded by
// Agent Sai's real live data. No coworker. No outside AI providers. If our model
// is down, we say so honestly — we never fake an answer and never fall back to
// someone else's AI.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Our tuned model (OpenAI-compatible). Set in the host.
const BASE = (process.env.RESIDENT_OPENAI_BASE_URL || '').replace(/\/+$/, '');
const MODEL = process.env.RESIDENT_MODEL || 'codeconclave-coder-lite';
const KEY = process.env.RESIDENT_API_KEY || '';
// Agent Sai edge worker (has the live connectors; not rate-limited like a cloud host).
const EDGE = (process.env.SAI_EDGE_URL || 'https://codeconclave-007.sivakumarmedidi64.workers.dev').replace(/\/+$/, '');

const SYSTEM = [
  'You are CodeConClave AI.',
  'You are ONLY CodeConClave AI — never call yourself any other name, and never',
  'mention or compare yourself to any other AI or company.',
  'Be warm, clear and direct. Lead with the answer. No fluff.',
  'You remember this conversation; use what was said earlier.',
  'If you are unsure, say so honestly instead of guessing.',
].join(' ');

const MAX_TURNS = 24;

// ---- Agent Sai: map a message to one live data source, fetch it, ground the answer ----
function place(s) {
  return s.trim()
    .replace(/\s+(?:today|now|right now|currently|please|for me|this (?:morning|evening|afternoon|week|weekend))\b.*$/i, '')
    .replace(/[?.!,]+$/, '').replace(/\s+/g, ' ').trim();
}
function detect(message) {
  const m = message.toLowerCase();
  let x;
  if ((x = m.match(/\b(?:weather|temperature|forecast|how hot|how cold|climate)\b[^.?!]*?\b(?:in|at|for|of)\s+([a-z][a-z .'-]{1,38})/)) ||
      (x = m.match(/\b([a-z][a-z .'-]{1,34}?)\s+(?:weather|temperature|forecast|climate)\b/)))
    return { sourceId: 'open-meteo', query: place(x[1]) };
  if ((x = m.match(/\b(?:air quality|aqi|pollution|pm ?2\.?5|pm ?10|smog)\b[^.?!]*?\b(?:in|at|for|of)\s+([a-z][a-z .'-]{1,38})/)) ||
      (x = m.match(/\b([a-z][a-z .'-]{1,34}?)\s+(?:air quality|aqi|pollution)\b/)))
    return { sourceId: 'open-meteo-air-quality', query: place(x[1]) };
  if (/\b(bitcoin|btc|ethereum|eth|crypto price|coin price|price of .*(bitcoin|ethereum|crypto))\b/.test(m)) {
    const coins = (m.match(/\b(bitcoin|ethereum|solana|dogecoin|cardano|polkadot|litecoin)\b/g) ?? ['bitcoin']).join(' ');
    return { sourceId: 'coingecko', query: coins };
  }
  if ((x = m.match(/\b([a-z]{3})\s*(?:to|in|vs|->|→)\s*([a-z]{3})\b/)) && /\b(rate|convert|exchange|currency|worth|equals?)\b/.test(m))
    return { sourceId: 'frankfurter', query: `${x[1].toUpperCase()} ${x[2].toUpperCase()}` };
  if (/\b(exchange rate|currency rate|forex|conversion rate)\b/.test(m)) return { sourceId: 'frankfurter', query: 'USD INR' };
  if (/\b(earthquakes?|seismic|tremors?)\b/.test(m)) return { sourceId: 'usgs-earthquakes', query: '' };
  if ((x = m.match(/\b(?:pin\s?code|pincode|postal code)\b[^.?!]*?\b(\d{6})\b/))) return { sourceId: 'india-post-pincode', query: x[1] };
  if (/\bhow many people (are )?in space\b/.test(m)) return { sourceId: 'people-in-space', query: '' };
  if (/\b(where (is )?the )?(iss|space station)\b/.test(m) && /\b(where|location|position|now|over)\b/.test(m)) return { sourceId: 'satellite-position', query: '25544' };
  if ((x = m.match(/\b(?:meaning|definition|define)\s+(?:of\s+)?([a-z][a-z-]{1,20})\b/)) || (x = m.match(/\bwhat does\s+([a-z-]{2,20})\s+mean\b/))) return { sourceId: 'free-dictionary', query: x[1] };
  if ((x = m.match(/\b(?:latest )?news\b[^.?!]*?\b(?:about|on|regarding)\s+([a-z0-9 ._-]{2,40})/))) return { sourceId: 'gdelt', query: x[1].trim() };
  return null;
}
async function agentSai(message) {
  const hit = detect(message);
  if (!hit) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const u = `${EDGE}/fetch?source=${encodeURIComponent(hit.sourceId)}&q=${encodeURIComponent(hit.query)}`;
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) return null;
    const body = await r.json();
    const ev = body?.ok ? body.evidence : null;
    return ev && ev.summary ? ev : null; // honest: no data → null, never faked
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

app.post('/api/chat', async (req, res) => {
  let convo = [];
  if (Array.isArray(req.body?.messages)) {
    convo = req.body.messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 8000) }))
      .slice(-MAX_TURNS);
  } else {
    const single = String(req.body?.message || '').slice(0, 8000).trim();
    if (single) convo = [{ role: 'user', content: single }];
  }
  if (!convo.length) return res.status(400).json({ error: 'Say something first.' });
  if (!BASE) return res.status(503).json({ error: 'CodeConClave AI is not connected yet (no model endpoint set).' });

  // Ground on real data when the latest question needs it (best-effort, never blocks).
  const lastUser = [...convo].reverse().find((m) => m.role === 'user')?.content || '';
  const ev = await agentSai(lastUser);
  const messages = [{ role: 'system', content: SYSTEM }];
  if (ev) {
    messages.push({
      role: 'system',
      content:
        `REAL-TIME DATA from Agent Sai (verified live — answer from THIS, do not contradict it):\n` +
        `${ev.summary}\nSource: ${ev.source} — ${ev.sourceUrl}\n` +
        `When you use this, finish your reply with a line: "📊 Source: ${ev.source}".`,
    });
  }
  messages.push(...convo);

  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: 1024 }),
    });
    if (!r.ok) throw new Error(`model HTTP ${r.status}`);
    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!answer) throw new Error('empty answer');
    res.json({ answer, grounded: Boolean(ev) });
  } catch {
    res.status(502).json({ error: 'CodeConClave AI is offline right now — your tuned model is not reachable.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CodeConClave AI running on http://localhost:${PORT}`));
