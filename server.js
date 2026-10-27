// CodeConClave AI — clean build. Talks ONLY to our own tuned model.
// No coworker. No outside AI providers. If our model is down, we say so
// honestly — we never fake an answer and never fall back to someone else's AI.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Where our tuned model is served (OpenAI-compatible). Set in the host.
const BASE = (process.env.RESIDENT_OPENAI_BASE_URL || '').replace(/\/+$/, '');
const MODEL = process.env.RESIDENT_MODEL || 'codeconclave-coder-lite';
const KEY = process.env.RESIDENT_API_KEY || '';

const SYSTEM = [
  'You are CodeConClave AI.',
  'You are ONLY CodeConClave AI — never call yourself any other name, and never',
  'mention or compare yourself to any other AI or company.',
  'Be warm, clear and direct. Lead with the answer. No fluff.',
  'You remember this conversation; use what was said earlier.',
  'If you are unsure, say so honestly instead of guessing.',
].join(' ');

const MAX_TURNS = 24; // how much of the conversation we carry to the model

app.post('/api/chat', async (req, res) => {
  // Accept either a full conversation (messages:[{role,content}]) or one message.
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

  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM }, ...convo],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });
    if (!r.ok) throw new Error(`model HTTP ${r.status}`);
    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!answer) throw new Error('empty answer');
    res.json({ answer });
  } catch {
    res.status(502).json({ error: 'CodeConClave AI is offline right now — your tuned model is not reachable.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CodeConClave AI running on http://localhost:${PORT}`));
