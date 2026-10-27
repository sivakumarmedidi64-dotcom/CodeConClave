// CodeConClave AI — clean build. Talks ONLY to our own tuned model, grounded by
// Agent Sai's real live data, with memory + file reading. No coworker, no outside
// AI providers. If our model is down, we say so honestly — never fake, never
// fall back to someone else's AI.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const BASE = (process.env.RESIDENT_OPENAI_BASE_URL || '').replace(/\/+$/, '');
const MODEL = process.env.RESIDENT_MODEL || 'codeconclave-coder-lite';
const KEY = process.env.RESIDENT_API_KEY || '';
const EDGE = (process.env.SAI_EDGE_URL || 'https://codeconclave-007.sivakumarmedidi64.workers.dev').replace(/\/+$/, '');
// Gmail connection (the user's own mailbox, via an app password — set server-side only).
const GUSER = (process.env.GMAIL_USER || '').trim();
const GPASS = (process.env.GMAIL_APP_PASSWORD || '').trim();
const mailOn = Boolean(GUSER && GPASS);

const SYSTEM = [
  'You are CodeConClave AI.',
  'You are ONLY CodeConClave AI — never call yourself any other name, and never',
  'mention or compare yourself to any other AI or company.',
  'Be warm, clear and direct. Lead with the answer. No fluff.',
  'You remember this conversation; use what was said earlier.',
  'When a message gives you LIVE DATA or an attached file, you DO have that',
  'information — use it directly. NEVER say you cannot access real-time data or files.',
  'If you are unsure, say so honestly instead of guessing.',
].join(' ');

const MAX_TURNS = 24;

// ---- Agent Sai (live data via the edge worker) ----
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
    const r = await fetch(`${EDGE}/fetch?source=${encodeURIComponent(hit.sourceId)}&q=${encodeURIComponent(hit.query)}`, { signal: ctl.signal });
    if (!r.ok) return null;
    const body = await r.json();
    const ev = body?.ok ? body.evidence : null;
    return ev && ev.summary ? ev : null;
  } catch { return null; } finally { clearTimeout(t); }
}

app.post('/api/chat', async (req, res) => {
  let convo = [];
  if (Array.isArray(req.body?.messages)) {
    convo = req.body.messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 12000) }))
      .slice(-MAX_TURNS);
  } else {
    const single = String(req.body?.message || '').slice(0, 12000).trim();
    if (single) convo = [{ role: 'user', content: single }];
  }
  if (!convo.length) return res.status(400).json({ error: 'Say something first.' });
  if (!BASE) return res.status(503).json({ error: 'CodeConClave AI is not connected yet (no model endpoint set).' });

  // Memory the user asked us to keep (sent from the browser).
  const memory = typeof req.body?.memory === 'string' ? req.body.memory.slice(0, 2000).trim() : '';
  const sys = memory ? `${SYSTEM}\n\nWhat you know about this user (remember and use it):\n${memory}` : SYSTEM;

  // Attached files (already turned to text in the browser).
  const files = Array.isArray(req.body?.files) ? req.body.files.slice(0, 5) : [];
  const fileBlock = files
    .filter((f) => f && typeof f.text === 'string' && f.text.trim())
    .map((f) => `[Attached file: ${String(f.name || 'file').slice(0, 120)}]\n${String(f.text).slice(0, 20000)}`)
    .join('\n\n');

  const messages = [{ role: 'system', content: sys }, ...convo];
  // The latest user turn: attach file text + live data right where the model reads it.
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      let content = messages[i].content;
      if (fileBlock) content = `${fileBlock}\n\n${content}`;
      messages[i] = { role: 'user', content };
      break;
    }
  }
  const lastUser = [...convo].reverse().find((m) => m.role === 'user')?.content || '';
  const ev = await agentSai(lastUser);
  if (ev) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        messages[i] = {
          role: 'user',
          content:
            `[LIVE DATA you have been given — use it, do NOT say you lack real-time access:\n${ev.summary}\n(Source: ${ev.source})]\n\n` +
            `Answer using the live data above, and end your reply with "📊 Source: ${ev.source}".\n\n${messages[i].content}`,
        };
        break;
      }
    }
  }

  // Stream the answer back (words appear as they are generated).
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`data: ${JSON.stringify({ meta: { grounded: Boolean(ev) } })}\n\n`);

  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: 1024, stream: true }),
    });
    if (!r.ok || !r.body) throw new Error(`model HTTP ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', any = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); return res.end(); }
        try {
          const d = JSON.parse(payload)?.choices?.[0]?.delta?.content || '';
          if (d) { any = true; res.write(`data: ${JSON.stringify({ delta: d })}\n\n`); }
        } catch { /* ignore keepalive/partial */ }
      }
    }
    if (!any) res.write(`data: ${JSON.stringify({ error: 'empty answer' })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch {
    res.write(`data: ${JSON.stringify({ error: 'CodeConClave AI is offline right now — your tuned model is not reachable.' })}\n\n`);
    res.end();
  }
});

// ---- Email (mom's idea): read new mail → our model summarizes + drafts a reply → user approves → send ----
async function callModel(messages, maxTokens = 700) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.6, max_tokens: maxTokens }),
  });
  if (!r.ok) throw new Error(`model HTTP ${r.status}`);
  const d = await r.json();
  return d?.choices?.[0]?.message?.content?.trim() || '';
}

async function fetchUnread(limit = 3) {
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: GUSER, pass: GPASS }, logger: false });
  await client.connect();
  const out = [];
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = (await client.search({ seen: false })) || [];
    const recent = uids.slice(-limit).reverse();
    for (const uid of recent) {
      const m = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!m || !m.source) continue;
      const p = await simpleParser(m.source);
      out.push({
        from: p.from?.text || 'unknown',
        replyTo: p.from?.value?.[0]?.address || '',
        subject: p.subject || '(no subject)',
        text: (p.text || '').replace(/\s+\n/g, '\n').slice(0, 1800),
      });
    }
  } finally {
    lock.release();
  }
  await client.logout();
  return out;
}

// GET /api/mail/check — streams each new mail with an AI summary + drafted reply as soon as it's ready (never sends).
app.get('/api/mail/check', async (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  if (!mailOn) { send({ configured: false, count: 0 }); send({ done: true }); return res.end(); }
  if (!BASE) { send({ error: 'model offline' }); return res.end(); }
  try {
    const mails = await fetchUnread(3);
    send({ configured: true, count: mails.length });
    let i = 0;
    for (const mail of mails) {
      i++;
      send({ working: i, of: mails.length, from: mail.from, subject: mail.subject });
      let summary = '', draft = '';
      try {
        const ans = await callModel([
          { role: 'system', content: "You are CodeConClave AI, helping with the user's email." },
          { role: 'user', content:
            `A new email arrived.\nFrom: ${mail.from}\nSubject: ${mail.subject}\nBody:\n${mail.text}\n\n` +
            `Do two things, using EXACTLY this format:\nSUMMARY: <one or two short sentences>\nREPLY:\n<a polite, helpful reply the user can send — just the reply body, no subject line>` },
        ], 320);
        const mS = ans.match(/SUMMARY:\s*([\s\S]*?)\n\s*REPLY:/i);
        const mR = ans.match(/REPLY:\s*([\s\S]*)$/i);
        summary = (mS?.[1] || '').trim();
        draft = (mR?.[1] || '').trim();
        if (!summary && !draft) draft = ans.trim();
      } catch { summary = '(could not summarize right now)'; }
      send({ mail: { from: mail.from, replyTo: mail.replyTo, subject: mail.subject, summary, draft } });
    }
    send({ done: true });
    res.end();
  } catch (e) {
    send({ error: 'Could not read mail: ' + String(e?.message || 'error').slice(0, 120) });
    res.end();
  }
});

// POST /api/mail/send — only when the user approves (this is the consequential action).
app.post('/api/mail/send', async (req, res) => {
  if (!mailOn) return res.status(400).json({ error: 'Mail is not connected.' });
  const to = String(req.body?.to || '').slice(0, 200).trim();
  const subject = String(req.body?.subject || '').slice(0, 300);
  const body = String(req.body?.body || '').slice(0, 10000);
  if (!to || !body) return res.status(400).json({ error: 'Need a recipient and a message.' });
  try {
    const tx = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: GUSER, pass: GPASS } });
    await tx.sendMail({ from: GUSER, to, subject, text: body });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'Could not send: ' + String(e?.message || 'error').slice(0, 120) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CodeConClave AI running on http://localhost:${PORT}`));
