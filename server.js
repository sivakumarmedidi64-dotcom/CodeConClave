// CodeConClave AI — clean build. Talks ONLY to our own tuned model, grounded by
// Agent Sai's real live data, with memory + file reading. No coworker, no outside
// AI providers. If our model is down, we say so honestly — never fake, never
// fall back to someone else's AI.
import express from 'express';
import crypto from 'crypto';
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
// The site is public, so mail is locked to the owner: only a browser that sends this
// secret (x-owner-key) can read or send mail. If it isn't set, mail stays locked.
const OWNER = (process.env.MAIL_OWNER_KEY || '').trim();
function ownerOk(req) {
  const k = String(req.get('x-owner-key') || '');
  return Boolean(OWNER) && k.length === OWNER.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(OWNER));
}

const SYSTEM = [
  'You are CodeConClave AI.',
  'You are ONLY CodeConClave AI — never call yourself any other name, and never',
  'mention or compare yourself to any other AI or company.',
  'Be warm, clear and direct. Lead with the answer. No fluff.',
  'You remember this conversation; use what was said earlier.',
  'When a message gives you LIVE DATA or an attached file, you DO have that',
  'information — use it directly. NEVER say you cannot access real-time data or files.',
  'Only give live numbers (weather, prices, exchange rates) when the message includes LIVE DATA',
  'for them. Never make up such numbers or a source.',
  'If you are unsure, say so honestly instead of guessing.',
].join(' ');

const MAX_TURNS = 24;
const EMPTY_ANSWER = "I didn't get an answer from my model that time — please send it again.";

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
// "what about Chennai?" / "and ethereum?" after a live-data question: reuse that source for
// the new place/coin, so a follow-up gets real data instead of numbers the model makes up.
function detectFollowUp(convo) {
  const users = convo.filter((m) => m.role === 'user').map((m) => m.content);
  const last = users[users.length - 1] || '';
  // Needs an explicit follow-up marker ("what about X", "and X?", "in X?") so "ok"/"cool" never trigger a lookup.
  const x = last.toLowerCase().match(/^\s*(?:and\s+(?:(?:what|how)\s+about\s+|in\s+)?|(?:what|how)\s+about\s+|in\s+)([a-z][a-z .'-]{1,38}?)\s*\??\s*$/);
  if (!x || last.split(/\s+/).length > 6 || /^(you|me|it|that|this|them|him|her|us|yours?|now|today|tomorrow)$/.test(x[1].trim())) return null;
  for (let i = users.length - 2; i >= Math.max(0, users.length - 4); i--) {
    const prev = detect(users[i]);
    if (!prev) continue;
    if (prev.sourceId === 'open-meteo' || prev.sourceId === 'open-meteo-air-quality') return { sourceId: prev.sourceId, query: place(x[1]) };
    const coin = x[1].match(/\b(bitcoin|ethereum|solana|dogecoin|cardano|polkadot|litecoin)\b/);
    if (prev.sourceId === 'coingecko' && coin) return { sourceId: 'coingecko', query: coin[1] };
    return null;
  }
  return null;
}

async function agentSai(convo) {
  const message = [...convo].reverse().find((m) => m.role === 'user')?.content || '';
  const hit = detect(message) || detectFollowUp(convo);
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
      // Drop old "📊 Source:" tags so the model doesn't copy a citation onto answers with no live data.
      .map((m) => (m.role === 'assistant' ? { ...m, content: m.content.replace(/\s*📊\s*Source:[^\n]*/g, '').trim() } : m))
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
  const ev = await agentSai(convo);
  // "my name is…", "remember that…", "ok", "cool" aren't questions; without a hint the small
  // model re-answers the previous question instead of replying to what was actually said.
  const hint = ev ? '' :
    !lastUser.includes('?') && /\b(my name is|remember that|remember to|note that|keep in mind)\b/i.test(lastUser)
      ? 'The user is telling you something about themselves to remember - this is not a question. Reply in one short, friendly sentence that confirms you will remember it.'
    : /^\s*(ok(ay)?|k|cool|nice|great|good|thanks?|thank you|thx|got it|alright|fine|perfect|awesome)\s*[.!]*\s*$/i.test(lastUser)
      ? 'The user is just acknowledging your last reply - this is not a new question. Reply in one short, friendly sentence, for example asking if they need anything else.'
    : '';
  if (hint) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        messages[i] = { role: 'user', content: `${messages[i].content}\n\n[${hint} Do not answer any earlier question again.]` };
        break;
      }
    }
  }
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
        if (payload === '[DONE]') {
          if (!any) res.write(`data: ${JSON.stringify({ error: EMPTY_ANSWER })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          return res.end();
        }
        try {
          const d = JSON.parse(payload)?.choices?.[0]?.delta?.content || '';
          if (d) { any = true; res.write(`data: ${JSON.stringify({ delta: d })}\n\n`); }
        } catch { /* ignore keepalive/partial */ }
      }
    }
    if (!any) res.write(`data: ${JSON.stringify({ error: EMPTY_ANSWER })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch {
    res.write(`data: ${JSON.stringify({ error: 'CodeConClave AI is offline right now — your tuned model is not reachable.' })}\n\n`);
    res.end();
  }
});

// ---- Email (mom's idea): brief today's mail → flag the important ones → draft replies → user approves → send ----
async function callModel(messages, maxTokens = 700, temperature = 0.3) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
    body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: maxTokens }),
  });
  if (!r.ok) throw new Error(`model HTTP ${r.status}`);
  const d = await r.json();
  return d?.choices?.[0]?.message?.content?.trim() || '';
}

// Automated senders we never draft replies to (nobody reads those inboxes).
const NOREPLY = /(no-?reply|do-?not-?reply|notifications?@|updates?@|newsletters?@|news@|mailer-daemon|postmaster|bounces?@)/i;
const draftCache = new Map(); // Message-ID -> { summary, draft } so reopening the app is instant

// "Today" for the user is India time, not the server's UTC day.
function todayStartIST() {
  const ist = new Date(Date.now() + 330 * 60000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60000);
}

// Today's inbox, newest first. "Important" is Gmail's own Important label (or a star).
// Bodies are fetched only for the important mails we will draft replies to.
async function todaysMail(draftLimit) {
  const start = todayStartIST();
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: GUSER, pass: GPASS }, logger: false });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    // IMAP SINCE is day-granular in the server's zone, so ask a day early and filter exactly.
    const uids = (await client.search({ since: new Date(start.getTime() - 86400000) }, { uid: true })) || [];
    const list = [];
    if (uids.length) {
      for await (const m of client.fetch(uids, { envelope: true, internalDate: true, flags: true, labels: true }, { uid: true })) {
        if (!m.internalDate || m.internalDate < start) continue;
        const f = m.envelope?.from?.[0] || {};
        list.push({
          uid: m.uid,
          messageId: m.envelope?.messageId || '',
          fromName: f.name || f.address || 'unknown',
          from: f.address || '',
          subject: m.envelope?.subject || '(no subject)',
          time: m.internalDate.getTime(),
          unread: !m.flags?.has('\\Seen'),
          important: Boolean(m.labels?.has('\\Important') || m.flags?.has('\\Flagged')),
        });
      }
    }
    list.sort((a, b) => b.time - a.time);
    const toDraft = list.filter((m) => m.important && m.from && !NOREPLY.test(m.from)).slice(0, draftLimit);
    for (const m of toDraft) {
      if (draftCache.has(m.messageId || m.uid)) continue;
      const msg = await client.fetchOne(m.uid, { source: true }, { uid: true });
      if (msg?.source) {
        const p = await simpleParser(msg.source);
        m.text = (p.text || '').replace(/\s+\n/g, '\n').slice(0, 1800);
      }
    }
    return { list, toDraft };
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

// The name drafts are signed with, set by the owner (optional - unsigned "Best regards," otherwise).
const SIGNATURE = (process.env.MAIL_SIGNATURE || '').trim();

// A small model follows one job per call, and follows an example far better than a rule:
// the worked example below is what stops it from accepting/declining/promising for the user.
const REPLY_RULES = 'You draft email replies AS the user (the person who received the email). The user has NOT decided anything yet: ' +
  'never accept, decline, confirm, promise, or claim something was done. Thank them, show you understood, and put [your answer] ' +
  "exactly where the user's own decision or fact must go. Never mention or sign as an AI.";
const EXAMPLE_MAIL = 'Email from Anil Rao\nSubject: Report\n\nHi, can you send me the sales report by Monday? Also, are you joining the team lunch on Thursday?\n\nAnil';
const EXAMPLE_REPLY = 'Hi Anil,\n\nThanks for your mail.\n\nAbout the sales report: [your answer].\nAbout the team lunch on Thursday: [your answer].\n\nBest regards,';
const SIGN_OFF = /^(best regards|kind regards|regards|best|thanks|thank you|sincerely)[,!.]?\s*$/im;

function cleanDraft(s, name) {
  let out = s.replace(/^\s*(subject|re):.*$/gim, '').trim();
  const cut = out.search(SIGN_OFF);
  if (cut >= 0) out = out.slice(0, cut).trimEnd(); // drop the model's sign-off + whatever name it made up
  out = out.split('\n').filter((l) => !/codeconclave|\bAI\b|assistant|\[your name\]/i.test(l)).join('\n').trim();
  return `${out}\n\nBest regards,${name ? `\n${name}` : ''}`;
}

const mailText = (m) => `Email from ${m.fromName}\nSubject: ${m.subject}\n\n${m.text}`;
const firstName = (m) => (m.fromName || '').split(/\s+/)[0] || 'there';

async function draftReply(m) {
  const first = firstName(m);
  const summary = (await callModel([
    { role: 'system', content: 'You summarize emails in one sentence.' },
    { role: 'user', content: `${mailText(m)}\n\nIn ONE short sentence, say what ${first} wants or is telling the user. Start the sentence with "${first}". Do not write a reply.` },
  ], 70)).split('\n')[0].trim();
  const raw = await callModel([
    { role: 'system', content: REPLY_RULES },
    { role: 'user', content: `${EXAMPLE_MAIL}\n\nDraft the reply.` },
    { role: 'assistant', content: EXAMPLE_REPLY },
    { role: 'user', content: `${mailText(m)}\n\nDraft the reply. Start with "Hi ${first},".` },
  ], 220);
  return { summary, draft: cleanDraft(raw, SIGNATURE), asks: /\?/.test(m.text || '') };
}

// GET /api/mail/status — is Gmail set up, and is this browser the owner?
app.get('/api/mail/status', (req, res) => {
  const unlocked = mailOn && ownerOk(req);
  res.json({ configured: mailOn, unlocked, ...(unlocked ? { account: GUSER } : {}) });
});

// GET /api/mail/brief — streams today's mail briefing: counts + the important ones first,
// then a drafted reply for each important mail as soon as it's written (never sends).
app.get('/api/mail/brief', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  if (!mailOn) { send({ configured: false }); send({ done: true }); return res.end(); }
  if (!ownerOk(req)) { send({ configured: true, locked: true }); send({ done: true }); return res.end(); }
  try {
    const { list, toDraft } = await todaysMail(2);
    const pick = (m) => ({ fromName: m.fromName, from: m.from, subject: m.subject, unread: m.unread });
    const important = list.filter((m) => m.important);
    const others = list.filter((m) => !m.important);
    send({
      configured: true,
      total: list.length,
      unread: list.filter((m) => m.unread).length,
      important: important.map(pick),
      others: others.slice(0, 10).map(pick),
      othersCount: others.length,
      drafting: toDraft.length,
    });
    for (const m of toDraft) {
      const key = m.messageId || m.uid;
      let got = draftCache.get(key) || null;
      if (!got && BASE && m.text) {
        send({ working: m.fromName });
        try {
          got = await draftReply(m);
          if (draftCache.size > 200) draftCache.clear();
          draftCache.set(key, got);
        } catch { got = null; }
      }
      send({ mail: { fromName: m.fromName, replyTo: m.from, subject: m.subject, messageId: m.messageId,
        summary: got?.summary || '', draft: got?.draft || '', drafted: Boolean(got), asks: Boolean(got?.asks) } });
    }
    send({ done: true });
    res.end();
  } catch (e) {
    send({ error: 'Could not read mail: ' + String(e?.message || 'error').slice(0, 120) });
    res.end();
  }
});

// POST /api/mail/redraft — "want any changes?": rewrite a draft the way the owner asks (never sends).
app.post('/api/mail/redraft', async (req, res) => {
  if (!mailOn) return res.status(400).json({ error: 'Mail is not connected.' });
  if (!ownerOk(req)) return res.status(401).json({ error: 'Mail is locked - unlock it first.' });
  if (!BASE) return res.status(503).json({ error: 'CodeConClave AI is offline right now.' });
  const draft = String(req.body?.draft || '').slice(0, 4000);
  const instruction = String(req.body?.instruction || '').slice(0, 500).trim();
  const fromName = String(req.body?.fromName || '').slice(0, 120);
  const summary = String(req.body?.summary || '').slice(0, 400);
  if (!draft.trim() || !instruction) return res.status(400).json({ error: 'Need the draft and what to change.' });
  const first = firstName({ fromName });
  try {
    const raw = await callModel([
      { role: 'system', content: 'You edit email replies written AS the user. Apply the user\'s change exactly, keep everything else, and never mention or sign as an AI.' },
      { role: 'user', content:
        `${summary ? `The original email: ${summary}\n\n` : ''}Current reply:\n${draft}\n\n` +
        `The user wants this change: "${instruction}"\n\nWrite the full new reply. Start with "Hi ${first},".` },
    ], 260);
    res.json({ draft: cleanDraft(raw, SIGNATURE) });
  } catch {
    res.status(502).json({ error: 'CodeConClave AI is offline right now.' });
  }
});

// POST /api/mail/send — only when the owner approves (this is the consequential action).
app.post('/api/mail/send', async (req, res) => {
  if (!mailOn) return res.status(400).json({ error: 'Mail is not connected.' });
  if (!ownerOk(req)) return res.status(401).json({ error: 'Mail is locked - unlock it first.' });
  const to = String(req.body?.to || '').slice(0, 200).trim();
  const subject = String(req.body?.subject || '').slice(0, 300);
  const body = String(req.body?.body || '').slice(0, 10000);
  const inReplyTo = String(req.body?.inReplyTo || '').slice(0, 300).trim();
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to) || !body.trim()) return res.status(400).json({ error: 'Need a valid recipient and a message.' });
  // Thread the reply under the original mail in Gmail.
  const thread = /^<[^<>\s]+>$/.test(inReplyTo) ? { inReplyTo, references: [inReplyTo] } : {};
  try {
    const tx = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: GUSER, pass: GPASS } });
    await tx.sendMail({ from: GUSER, to, subject, text: body, ...thread });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'Could not send: ' + String(e?.message || 'error').slice(0, 120) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CodeConClave AI running on http://localhost:${PORT}`));
