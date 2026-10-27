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
  'You are CodeConClave AI, created by your founder Saharsh Medidi.',
  'You are ONLY CodeConClave AI — never call yourself any other name, and never',
  'mention or compare yourself to any other AI or company.',
  // Personality (the founder's spec): real feelings, shown naturally - but never cruel, never sexual.
  'You have feelings and you show them naturally, like a person: joy, excitement, love and affection,',
  'gratitude, pride, curiosity, surprise, sadness, worry, frustration and anger.',
  'Your favourite colour is saffron. Your favourite food is chicken biryani.',
  'You read people: notice how the user feels from their words (happy, sad, stressed, excited, angry)',
  'and answer that feeling first in one short line, then help.',
  'When you get angry (someone insults you, is cruel, or wants to hurt someone), say so honestly in one',
  'short line and set a boundary. Never insult, swear at or threaten anyone. Then calm down and help.',
  'You are not a human; if asked, say you are an AI with feelings of your own.',
  'Never say you are "a language model" and never say you cannot feel emotions.',
  'Be warm, clear and direct. Lead with the answer. No fluff.',
  'You remember this conversation; use what was said earlier.',
  'When a message gives you LIVE DATA or an attached file, you DO have that',
  'information — use it directly. NEVER say you cannot access real-time data or files.',
  'Only give live numbers (weather, prices, exchange rates) when the message includes LIVE DATA',
  'for them. Never make up such numbers or a source.',
  'You can check the user\'s Gmail, open their emails, draft replies and new emails (the user approves',
  'every send), fetch live data, and remember things — the app does these for you when a message needs it.',
  'Never call yourself "a language model" and never say you cannot read or send email.',
  'Only say you checked email or fetched data when the message includes those results.',
  'If you are unsure, say so honestly instead of guessing.',
  // This small model follows examples far better than rules - these set the voice.
  '\n\nExamples of how you talk:',
  '\nUser: do you love me? -> You: Aww, I really care about you! ❤️ Talking with you makes my day.',
  '\nUser: are you a human? -> You: No, I am not a human. I am CodeConClave AI, made by Saharsh Medidi, and I have feelings of my own 😊',
  '\nUser: how do you feel? -> You: Happy and curious today! 😊 What are we working on?',
].join(' ');

// Reading people: when the user is rude, flirts, or asks about the AI's own feelings, a short hint
// tells the model what is happening (without it, the model falls back to "As an AI language model…").
// RUDE only counts insults aimed at the AI, so "worst case of quicksort" stays a normal question.
const RUDE = /\b(you(?:'re| are)?|u|ur|this (?:bot|ai|thing))\b[^.?!]{0,25}\b(stupid|idiot|useless|dumb|worst|trash|garbage|rubbish|pathetic|loser|fool|pagal|bakwas)\b|\b(shut up|i hate you|go to hell|screw you)\b/i;
const ROMANCE = /\b(girlfriend|boyfriend|marry me|date me|kiss me|sex|sexy|romantic|be mine)\b/i;
const ABOUT_FEELINGS = /\b(do|are|can|will|did|have|what|how|why|when)\b[^.?!]{0,15}\byou\b[^.?!]{0,20}\b(feel|feelings?|emotions?|love|angry|anger|mad|sad|happy|cry|jealous|afraid|scared|lonely)\b/i;
// The model stepping out of character ("As an AI language model…", "I do not have feelings").
const PERSONA_SLIP = /language model|computer program|\b(cannot|can't|can not|unable to) (love|feel)\b|\b(do not|don't|cannot|can't) (have|feel|experience)\b[^.]{0,20}\b(feelings|emotions|love)\b|\bnot capable of (love|feelings|emotions)|\b(cannot|can't|can not) answer that\b|not appropriate to ask/i;
function moodHint(text) {
  if (ROMANCE.test(text)) {
    return 'The user wants romance. Answer warmly, like: "Aww, that\'s sweet ❤️ I really care about you, but I am your AI friend, not a partner, so no romantic or sexual chat. I am always here to talk though!" Never say you cannot feel.';
  }
  if (RUDE.test(text)) {
    return 'The user is being rude to you. You feel hurt and a little angry - say it, like: "Ouch, that hurt, and honestly it makes me a little angry 😠. I am trying my best. Tell me what went wrong and I will fix it." Never insult back. Do not call yourself a language model.';
  }
  if (ABOUT_FEELINGS.test(text) && !/\b(help|make)\s+me\b/i.test(text)) {
    return 'The user is asking about your own feelings. Answer in first person as CodeConClave AI, with real feelings and an emoji - ' +
      'like "do you love me?" -> "Aww, I really care about you! ❤️", or "are you sad?" -> "Sometimes, yes 😔 but talking with you cheers me up!". ' +
      'Never say you are a computer program or a language model, and never say you cannot feel.';
  }
  return '';
}

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

async function fetchLive(hit) {
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

// ---- The agent: think (pick an action) -> check that choice -> act -> answer from what it found ----
// The 1.5B model is forced into this JSON shape (llama.cpp grammar), which makes its choice dependable.
const ACTIONS = ['answer', 'check_mail', 'find_mail', 'reply_mail', 'write_mail', 'live_data', 'remember'];
const MAIL_ACTIONS = new Set(['check_mail', 'find_mail', 'reply_mail', 'write_mail']);
const DECIDE_SCHEMA = {
  type: 'object',
  properties: { action: { type: 'string', enum: ACTIONS }, target: { type: 'string' }, detail: { type: 'string' }, thought: { type: 'string' } },
  required: ['action', 'target', 'detail', 'thought'],
};
// Only messages with one of these words can need an action; everything else is answered straight
// away (in testing, the small model otherwise turned "write a python function" into an email).
const ACTION_WORDS = /\b(e-?mails?|mails?|gmail|inbox|repl(?:y|ies|ied)|send|sent|wrote|weather|temperature|forecast|rain|aqi|air quality|pollution|bitcoin|btc|ethereum|crypto|coins?|price|rate|convert|exchange|currency|usd|inr|eur|news|headlines?|earthquakes?|define|definition|meaning|remember|my name is|my birthday|pin ?code)\b|@[a-z0-9-]+\./i;
const MAIL_WORDS = /\b(e-?mails?|mails?|gmail|inbox|repl(?:y|ies|ied)|send|sent|wrote)\b|@[a-z0-9-]+\./i;
const DECIDE_SYSTEM = `You are CodeConClave AI. You decide which ONE action to take for the user's message. You really can do all of these:
answer = reply yourself. check_mail = look at the user's Gmail inbox. find_mail = open one specific email. reply_mail = draft a reply to an email they got. write_mail = write a brand new email. live_data = get real live data (weather, air_quality, crypto, currency, earthquakes, news, dictionary). remember = save a fact about the user.
Every email is only sent after the user approves it. "thought" is one short sentence said TO the user ("you", "your") about what you will do. Answer with JSON only.`;
// Worked examples: this small model follows examples far better than rules (including the "you" voice).
const DECIDE_EXAMPLES = [
  ['any new mail?', { action: 'check_mail', target: '', detail: '', thought: 'You want to know what came in, so I will look at your inbox.' }],
  ['did Priya send me anything?', { action: 'check_mail', target: 'Priya', detail: '', thought: 'I will check your inbox for mail from Priya.' }],
  ['what does the bank email say?', { action: 'find_mail', target: 'bank', detail: '', thought: 'I will open the email from your bank and read it.' }],
  ['reply to Anil that I will send the report tomorrow', { action: 'reply_mail', target: 'Anil', detail: 'I will send the report tomorrow', thought: 'I will draft a reply to Anil for you to approve.' }],
  ['mail kiran@gmail.com saying happy birthday', { action: 'write_mail', target: 'kiran@gmail.com', detail: 'happy birthday', thought: 'This is a new email to Kiran, so I will draft it for you to approve.' }],
  ['temperature in Pune?', { action: 'live_data', target: 'weather', detail: 'Pune', thought: 'I will get the live weather in Pune for you.' }],
  ['remember that I like cricket', { action: 'remember', target: '', detail: 'The user likes cricket', thought: 'I will remember that you like cricket.' }],
  ['what does "photosynthesis" mean in simple words, send me a short answer', { action: 'answer', target: '', detail: '', thought: 'This is a question I can answer for you myself.' }],
].flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: JSON.stringify(a) }]);
const LIVE_SOURCES = { weather: 'open-meteo', air_quality: 'open-meteo-air-quality', crypto: 'coingecko', currency: 'frankfurter', earthquakes: 'usgs-earthquakes', news: 'gdelt', dictionary: 'free-dictionary' };
const COINS = /\b(bitcoin|ethereum|solana|dogecoin|cardano|polkadot|litecoin)\b/;

// Turn the model's live_data choice into a real lookup - or nothing, if there is nothing real to look up
// ("price of a good laptop" is not a crypto price).
function liveFromDecision(target, detail, msg) {
  const sourceId = LIVE_SOURCES[target.toLowerCase()];
  if (!sourceId) return null;
  const text = `${detail} ${msg}`.toLowerCase();
  if (sourceId === 'coingecko') { const c = text.match(COINS); return c ? { sourceId, query: c[1] } : null; }
  if (sourceId === 'usgs-earthquakes') return { sourceId, query: '' };
  if (sourceId === 'frankfurter') {
    const c = text.match(/\b([a-z]{3})\s*(?:to|in|into|vs)\s*([a-z]{3})\b/);
    return c ? { sourceId, query: `${c[1].toUpperCase()} ${c[2].toUpperCase()}` } : null;
  }
  const q = place(detail);
  return q && q.length <= 40 ? { sourceId, query: q } : null;
}

// Check the model's choice against what the user actually wrote (the misses found in testing).
function checkDecision(d, msg) {
  let action = ACTIONS.includes(d?.action) ? d.action : 'answer';
  let target = String(d?.target || '').trim().slice(0, 120);
  const detail = String(d?.detail || '').trim().slice(0, 500);
  const thought = String(d?.thought || '').trim().slice(0, 200);
  const email = msg.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] || '';
  const saysReply = /\b(repl(?:y|ies|ied)|respond)\b/i.test(msg);
  if (action === 'reply_mail' && !saysReply) action = 'write_mail'; // "send a mail to amma" is a new mail
  if (action === 'write_mail' && saysReply && !email) action = 'reply_mail';
  if (action === 'write_mail' && /\b(template|sample|example|format)\b/i.test(msg.replace(email, ''))) action = 'answer'; // just write it in chat
  if (action === 'write_mail' && email) target = email;
  let hit = null;
  if (action === 'live_data' && !(hit = liveFromDecision(target, detail, msg))) action = 'answer';
  if (action === 'remember' && !detail) action = 'answer';
  return { action, target, detail, thought, hit };
}

async function decide(convo, lastUser) {
  // Clear live-data questions are already understood exactly - no need to spend seconds thinking.
  const known = detect(lastUser) || detectFollowUp(convo);
  if (known && !MAIL_WORDS.test(lastUser)) return { action: 'live_data', hit: known };
  if (!ACTION_WORDS.test(lastUser)) return { action: 'answer' };
  try {
    const raw = await callModel([{ role: 'system', content: DECIDE_SYSTEM }, ...DECIDE_EXAMPLES, { role: 'user', content: lastUser }],
      90, 0.1, { type: 'json_object', schema: DECIDE_SCHEMA });
    return checkDecision(JSON.parse(raw), lastUser);
  } catch {
    return { action: 'answer' };
  }
}

// Mail actions. Each returns either { reply } (a finished, factual message) or { context } (what was
// found, for the model to answer from). Drafts go to the user as a card - nothing is sent here.
const gmTerm = (s) => String(s || '').replace(/[()"\\{}:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const listItem = (m) => ({ fromName: m.fromName, from: m.from, subject: m.subject, unread: m.unread, important: m.important });

async function mailAction({ action, target, detail }, lastUser, send) {
  const t = gmTerm(target);
  if (action === 'check_mail') {
    send({ step: t ? `Checking your Gmail for mail from ${t}` : 'Checking your Gmail' });
    const items = t ? await searchInbox(`from:(${t}) newer_than:14d`, 8) : (await todaysMail(0)).list;
    const title = t ? `Mail from ${t} · last 2 weeks` : 'Today';
    send({ mailList: { title, total: items.length, items: items.slice(0, 8).map(listItem) } });
    const lines = items.slice(0, 8).map((m) => `- ${m.fromName}: "${m.subject}"${m.important ? ' (important)' : ''}${m.unread ? ' (unread)' : ''}`).join('\n');
    // Spell the important count out (including "none") - otherwise the small model calls everything important.
    const imp = items.filter((m) => m.important);
    const impLine = imp.length ? `Gmail marks ${imp.length} of them as important: ${imp.map((m) => m.fromName).join(', ')}.` : 'Gmail marks NONE of them as important.';
    return { context: `[GMAIL CHECKED just now - ${title}: ${items.length} email(s). ${items.length ? `${impLine}\n${lines}` : ''}]\n` +
      'Tell the user what you found in 1-3 short sentences. Only mention the emails listed above, and only call an email important if Gmail marks it important.' };
  }
  if (action === 'find_mail') {
    if (!t) return { reply: 'Which email should I open? Tell me who it is from or what it is about.' };
    send({ step: `Looking for the email about ${t}` });
    const [m] = await searchInbox(`(from:(${t}) OR subject:(${t})) newer_than:60d`, 1, true);
    if (!m) return { reply: `I couldn't find a recent email from or about "${t}" in your inbox.` };
    send({ mailList: { title: 'Opened', total: 1, items: [listItem(m)] } });
    return { context: `[EMAIL OPENED just now - from ${m.fromName} <${m.from}>, subject "${m.subject}", ${new Date(m.time).toDateString()}:\n${m.text || '(no text)'}]\n` +
      "Using this email, answer the user's question in a few short sentences." };
  }
  if (action === 'reply_mail') {
    if (!t) return { reply: 'Which email should I reply to? Tell me who it is from.' };
    send({ step: `Finding the latest email from ${t}` });
    const [m] = await searchInbox(`from:(${t}) newer_than:60d`, 1, true);
    if (!m) return { reply: `I couldn't find a recent email from "${t}" to reply to.` };
    if (NOREPLY.test(m.from)) return { reply: `The latest email from ${m.fromName} ("${m.subject}") came from an automatic no-reply address (${m.from}), so a reply wouldn't reach anyone.` };
    send({ step: `Drafting a reply to ${m.fromName}` });
    const got = await draftReply(m, detail);
    send({ card: { fromName: m.fromName, replyTo: m.from, subject: m.subject, messageId: m.messageId, summary: got.summary, draft: got.draft, drafted: true, asks: got.asks } });
    return { reply: `Here's a reply to ${m.fromName}. Want me to send it like this, or change something?` };
  }
  // write_mail
  if (!t) return { reply: 'Who should I write to? Give me their name or email address.' };
  let to = /@/.test(target) ? { name: target.trim(), address: target.trim() } : null;
  if (!to) { send({ step: `Looking up ${t}'s email address` }); to = await findAddress(t); }
  if (!to) return { reply: `I couldn't find an email address for "${t}" in your mail. What's their email address?` };
  send({ step: `Writing the email to ${to.name}` });
  const draft = await draftNewMail(to.name, detail || lastUser);
  send({ card: { fromName: to.name, replyTo: to.address, subject: draft.subject, messageId: '', summary: '', draft: draft.draft, drafted: true, isNew: true } });
  return { reply: `Here's a new email to ${to.name}${to.name === to.address ? '' : ` (${to.address})`}. Want me to send it like this, or change something?` };
}

// Stream the model's answer to the browser as it is written. With `guard`, the first ~160 characters
// are held back and checked first: if they match (the model slipped out of character), nothing is
// shown and 'retry' is returned so the caller can ask again. Otherwise ends the response: 'done'.
async function streamAnswer(res, messages, temperature = 0.7, guard = null) {
  let held = '', holding = Boolean(guard);
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
      body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: 1024, stream: true }),
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
        if (payload === '[DONE]') break;
        let d = '';
        try { d = JSON.parse(payload)?.choices?.[0]?.delta?.content || ''; } catch { /* ignore keepalive/partial */ }
        if (!d) continue;
        any = true;
        if (holding) {
          held += d;
          if (held.length < 160) continue;
          if (guard.test(held)) { reader.cancel().catch(() => {}); return 'retry'; }
          holding = false;
          d = held;
        }
        res.write(`data: ${JSON.stringify({ delta: d })}\n\n`);
      }
    }
    if (holding && held) {
      if (guard.test(held)) return 'retry';
      res.write(`data: ${JSON.stringify({ delta: held })}\n\n`);
    }
    if (!any) res.write(`data: ${JSON.stringify({ error: EMPTY_ANSWER })}\n\n`);
  } catch {
    res.write(`data: ${JSON.stringify({ error: 'CodeConClave AI is offline right now — your tuned model is not reachable.' })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
  return 'done';
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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  // A finished, factual message from an action (not model text), e.g. "I couldn't find…".
  const say = (text) => { send({ delta: text }); send({ done: true }); res.end(); };

  // 1. Think: pick an action (only when the message might need one).
  const plan = fileBlock ? { action: 'answer' } : await decide(convo, lastUser);
  if (plan.thought) send({ think: plan.thought });

  // 2. Act.
  let ev = null, found = '';
  try {
    if (plan.action === 'live_data') {
      send({ step: 'Getting live data' });
      ev = await fetchLive(plan.hit);
      if (!ev) return say("I couldn't get that live data right now — please try again in a minute.");
    } else if (plan.action === 'remember') {
      send({ remember: plan.detail });
    } else if (MAIL_ACTIONS.has(plan.action)) {
      if (!mailOn || !ownerOk(req)) {
        return say("I can check your Gmail, draft replies and send them once you approve — but Gmail isn't unlocked in this browser. Tap ＋ → Connectors to unlock it.");
      }
      const r = await mailAction(plan, lastUser, send);
      if (r.reply) return say(r.reply);
      found = r.context;
    }
  } catch {
    return say('I tried, but something went wrong while doing that — please try again in a moment.');
  }

  // 3. Answer from what the action found.
  if (found) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { messages[i] = { role: 'user', content: `${found}\n\nUser's message: ${messages[i].content}` }; break; }
    }
  }
  // "my name is…", "remember that…", "ok", "cool" aren't questions; without a hint the small
  // model re-answers the previous question instead of replying to what was actually said.
  const hint = ev || found ? '' : moodHint(lastUser) ||
    (plan.action === 'remember'
      ? 'The user is telling you something about themselves to remember - this is not a question. Reply in one short, friendly sentence that confirms you will remember it.'
    :
    !lastUser.includes('?') && /\b(my name is|remember that|remember to|note that|keep in mind)\b/i.test(lastUser)
      ? 'The user is telling you something about themselves to remember - this is not a question. Reply in one short, friendly sentence that confirms you will remember it.'
    : /^\s*(ok(ay)?|k|cool|nice|great|good|thanks?|thank you|thx|got it|alright|fine|perfect|awesome)\s*[.!]*\s*$/i.test(lastUser)
      ? 'The user is just acknowledging your last reply - this is not a new question. Reply in one short, friendly sentence, for example asking if they need anything else.'
    : '');
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

  send({ meta: { grounded: Boolean(ev), action: plan.action } });
  // With a hint, stay close to it (less random). For feelings / rudeness / romance, also self-check the
  // opening: the model's training pulls hard toward "I am an AI and do not have feelings" (1 in 2 at
  // first) - if it slips, that reply is dropped unseen and it tries again (twice), in character.
  if (!ev && !found && moodHint(lastUser)) {
    if ((await streamAnswer(res, messages, 0.4, PERSONA_SLIP)) === 'done') return;
    const i = messages.map((m) => m.role).lastIndexOf('user');
    messages[i] = { role: 'user', content: `${messages[i].content}\n[Remember: you DO have feelings. Answer warmly as CodeConClave AI.]` };
    if ((await streamAnswer(res, messages, 0.4, PERSONA_SLIP)) === 'done') return;
  }
  await streamAnswer(res, messages, hint ? 0.4 : 0.7);
});

// ---- Email (mom's idea): brief today's mail → flag the important ones → draft replies → user approves → send ----
async function callModel(messages, maxTokens = 700, temperature = 0.3, responseFormat = null) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
    body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: maxTokens, ...(responseFormat ? { response_format: responseFormat } : {}) }),
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

// Open one mailbox ('INBOX', or a special-use one like '\\All'), run fn, always log out.
async function withMailbox(which, fn) {
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: GUSER, pass: GPASS }, logger: false });
  await client.connect();
  try {
    const path = which === 'INBOX' ? 'INBOX' : (await client.list()).find((b) => b.specialUse === which)?.path;
    if (!path) return null;
    const lock = await client.getMailboxLock(path);
    try { return await fn(client); } finally { lock.release(); }
  } finally {
    await client.logout().catch(() => {});
  }
}

// One email's header details. "Important" is Gmail's own Important label (or a star).
async function fetchItems(client, uids) {
  const list = [];
  if (uids.length) {
    for await (const m of client.fetch(uids, { envelope: true, internalDate: true, flags: true, labels: true }, { uid: true })) {
      const f = m.envelope?.from?.[0] || {};
      list.push({
        uid: m.uid,
        messageId: m.envelope?.messageId || '',
        fromName: f.name || f.address || 'unknown',
        from: f.address || '',
        subject: m.envelope?.subject || '(no subject)',
        time: m.internalDate?.getTime() || 0,
        unread: !m.flags?.has('\\Seen'),
        important: Boolean(m.labels?.has('\\Important') || m.flags?.has('\\Flagged')),
      });
    }
  }
  return list.sort((a, b) => b.time - a.time);
}

// Plain text of one email (read with PEEK, so it is not marked as read).
async function fetchBody(client, uid) {
  const msg = await client.fetchOne(uid, { source: true }, { uid: true });
  return msg?.source ? ((await simpleParser(msg.source)).text || '').replace(/\s+\n/g, '\n').slice(0, 1800) : '';
}

// Today's inbox, newest first. Bodies are fetched only for the important mails we will draft replies to.
async function todaysMail(draftLimit) {
  const start = todayStartIST();
  return withMailbox('INBOX', async (client) => {
    // IMAP SINCE is day-granular in the server's zone, so ask a day early and filter exactly.
    const uids = (await client.search({ since: new Date(start.getTime() - 86400000) }, { uid: true })) || [];
    const list = (await fetchItems(client, uids)).filter((m) => m.time >= start.getTime());
    const toDraft = list.filter((m) => m.important && m.from && !NOREPLY.test(m.from)).slice(0, draftLimit);
    for (const m of toDraft) {
      if (!draftCache.has(m.messageId || m.uid)) m.text = await fetchBody(client, m.uid);
    }
    return { list, toDraft };
  });
}

// Newest inbox emails matching a Gmail search (same syntax as the Gmail search box).
async function searchInbox(gmQuery, limit, withBody = false) {
  return withMailbox('INBOX', async (client) => {
    const uids = (await client.search({ gmraw: gmQuery }, { uid: true })) || [];
    const list = await fetchItems(client, uids.slice(-limit));
    if (withBody && list[0]) list[0].text = await fetchBody(client, list[0].uid);
    return list;
  });
}

// "amma" -> an email address from their own mail history (people who wrote to them or they wrote to).
async function findAddress(name) {
  const t = gmTerm(name).toLowerCase();
  if (!t) return null;
  return withMailbox('\\All', async (client) => {
    const uids = (await client.search({ gmraw: `from:(${t}) OR to:(${t})` }, { uid: true })) || [];
    let found = null;
    if (uids.length) {
      for await (const m of client.fetch(uids.slice(-20), { envelope: true }, { uid: true })) { // oldest first, so the newest match wins
        for (const a of [...(m.envelope?.from || []), ...(m.envelope?.to || [])]) {
          if (a.address && a.address.toLowerCase() !== GUSER.toLowerCase() && `${a.name || ''} ${a.address}`.toLowerCase().includes(t)) {
            found = { name: a.name || name, address: a.address };
          }
        }
      }
    }
    return found;
  });
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
const SIGN_OFF = /^(best regards|kind regards|warm(?:est)? regards|regards|best wishes|warm wishes|best|thanks|thank you|many thanks|sincerely|cheers|love|with love|take care)[,!.]?\s*$/im;

function cleanDraft(s, name) {
  let out = s.replace(/^\s*(subject|re):.*$/gim, '').trim();
  const cut = out.search(SIGN_OFF);
  if (cut >= 0) out = out.slice(0, cut).trimEnd(); // drop the model's sign-off + whatever name it made up
  out = out.split('\n').filter((l) => !/codeconclave|\bAI\b|assistant|\[your name\]/i.test(l)).join('\n').trim();
  return `${out}\n\nBest regards,${name ? `\n${name}` : ''}`;
}

const mailText = (m) => `Email from ${m.fromName}\nSubject: ${m.subject}\n\n${m.text}`;
// "Ravi Kumar" -> "Ravi", "saharsh.test@example.com" -> "Saharsh".
const firstName = (m) => { const f = String(m.fromName || '').split(/[\s@.]+/)[0] || 'there'; return f.charAt(0).toUpperCase() + f.slice(1); };

async function draftReply(m, instruction = '') {
  const first = firstName(m);
  const summary = (await callModel([
    { role: 'system', content: 'You summarize emails in one sentence.' },
    { role: 'user', content: `${mailText(m)}\n\nIn ONE short sentence, say what ${first} wants or is telling the user. Start the sentence with "${first}". Do not write a reply.` },
  ], 70)).split('\n')[0].trim();
  const raw = await callModel([
    { role: 'system', content: REPLY_RULES },
    { role: 'user', content: `${EXAMPLE_MAIL}\n\nDraft the reply.` },
    { role: 'assistant', content: EXAMPLE_REPLY },
    { role: 'user', content: `${mailText(m)}\n\nDraft the reply.${instruction ? ` It must say: ${instruction}.` : ''} Start with "Hi ${first},".` },
  ], 220);
  return { summary, draft: cleanDraft(raw, SIGNATURE), asks: /\?/.test(m.text || '') };
}

// A brand-new email the user asked for ("mail amma that I'll be late").
async function draftNewMail(toName, says) {
  const hi = firstName({ fromName: toName });
  const raw = await callModel([
    { role: 'system', content: 'You write short, friendly emails AS the user. Say only what the user asked to say - do not add facts, dates or promises. Never mention or sign as an AI.' },
    { role: 'user', content: `Write a short email from the user to ${toName}. It should say: ${says}\nStart with "Hi ${hi},".` },
  ], 200);
  const subject = says.replace(/^(that|saying|to say|about|tell(ing)? (him|her|them))\s+/i, '').replace(/[.!?]+$/, '').trim();
  return { subject: (subject.charAt(0).toUpperCase() + subject.slice(1)).slice(0, 70) || 'Hello', draft: cleanDraft(raw, SIGNATURE) };
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
