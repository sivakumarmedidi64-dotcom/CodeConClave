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
import { openStore, hashPassword, checkPassword, newToken, tokenHash, encrypt, decrypt } from './store.js';
import { parseSchedule, cleanSchedule, nextRun, describeSchedule, describeWhen, stripWhen } from './schedule.js';

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
function keyOk(req) {
  const k = String(req.get('x-owner-key') || '');
  return Boolean(OWNER) && k.length === OWNER.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(OWNER));
}
// The owner = this browser holds the owner key, or is signed in to the owner's account.
const ownerOk = (req) => keyOk(req) || req.user?.role === 'owner';
// Whose mailbox: the signed-in person's own Gmail (connected with an app password, stored encrypted),
// else - for the owner only - the Gmail in the server settings. null = no mail for this request.
async function mailCreds(req) {
  if (req.user && store) {
    try { const enc = await store.getSecret(req.user.id, 'gmail'); if (enc) return JSON.parse(decrypt(enc)); } catch { /* not connected */ }
  }
  return ownerOk(req) && mailOn ? { user: GUSER, pass: GPASS } : null;
}

// ---- Accounts ----
// Data lives in Neon (DATABASE_URL, the live site) or in local files (./data, on your own PC).
// If the store can't open, the app still runs - only accounts are switched off.
let store = null;
try { store = await openStore(); console.log(`Accounts: stored in ${store.kind}`); }
catch (e) { console.error('Accounts are OFF:', e.message); }
const COOKIE = 'cc_session';
const SESSION_DAYS = 30;
const SECURE_COOKIE = Boolean(process.env.RENDER) || process.env.NODE_ENV === 'production'; // https only on the live site
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://codeconclave-ww5x.onrender.com').replace(/\/+$/, '');
const GOOGLE_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

const readCookie = (req, name) => decodeURIComponent((String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)) || [])[1] || '');
const cookie = (name, value, maxAge, p = '/') => `${name}=${value}; Path=${p}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`;
// Express 4 does not catch errors from async handlers - this passes them to the error handler below.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Who is asking? (the session cookie -> a user, or nobody)
app.use(wrap(async (req, _res, next) => {
  req.user = null;
  const t = store && readCookie(req, COOKIE);
  if (t) { try { req.user = await store.sessionUser(tokenHash(t)); } catch { /* treat as signed out */ } }
  next();
}));

async function startSession(req, res, user) {
  // Owner: only a browser holding the owner key can make an account the owner's. Never by email
  // alone - there is no email check, so anyone could sign up with the founder's address.
  if (keyOk(req) && user.role !== 'owner') { await store.setRole(user.id, 'owner'); user.role = 'owner'; }
  const t = newToken();
  await store.createSession(tokenHash(t), user.id, Date.now() + SESSION_DAYS * 86400000);
  res.append('Set-Cookie', cookie(COOKIE, t, SESSION_DAYS * 86400));
  const { passHash, ...safe } = user;
  return safe;
}
// A simple brake on password guessing: 20 tries per 15 minutes per address.
const tries = new Map();
function tooMany(req) {
  const now = Date.now();
  const list = (tries.get(req.ip) || []).filter((t) => now - t < 15 * 60000);
  list.push(now); tries.set(req.ip, list);
  return list.length > 20;
}
const needStore = (res) => { if (!store) { res.status(503).json({ error: 'Accounts are not available right now.' }); return true; } return false; };
const needUser = (req, res) => { if (!req.user) { res.status(401).json({ error: 'Sign in first.' }); return true; } return false; };

app.get('/api/auth/me', (req, res) => res.json({ user: req.user, accounts: Boolean(store), google: Boolean(store && GOOGLE_ID && GOOGLE_SECRET) }));

app.post('/api/auth/signup', wrap(async (req, res) => {
  if (needStore(res)) return;
  if (tooMany(req)) return res.status(429).json({ error: 'Too many tries — wait a few minutes.' });
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim().slice(0, 60) || email.split('@')[0];
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  let user;
  try { user = await store.createUser({ email, name, passHash: hashPassword(password) }); }
  catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email already has an account — sign in instead.' });
    throw e;
  }
  res.json({ user: await startSession(req, res, user) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  if (needStore(res)) return;
  if (tooMany(req)) return res.status(429).json({ error: 'Too many tries — wait a few minutes.' });
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
  const user = await store.userByEmail(email);
  if (!user || !user.passHash || !checkPassword(String(req.body?.password || ''), user.passHash)) {
    return res.status(401).json({ error: user && !user.passHash ? 'This account uses Google — sign in with Google.' : 'Wrong email or password.' });
  }
  res.json({ user: await startSession(req, res, user) });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const t = readCookie(req, COOKIE);
  if (t && store) await store.deleteSession(tokenHash(t));
  res.append('Set-Cookie', cookie(COOKIE, '', 0));
  res.json({ ok: true });
}));

// Google sign-in (switched on once GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set).
const GOOGLE_BACK = `${PUBLIC_URL}/api/auth/google/callback`;
app.get('/api/auth/google', (req, res) => {
  if (!store || !GOOGLE_ID || !GOOGLE_SECRET) return res.redirect('/');
  const state = newToken();
  res.append('Set-Cookie', cookie('cc_gstate', state, 600, '/api/auth'));
  const q = new URLSearchParams({ client_id: GOOGLE_ID, redirect_uri: GOOGLE_BACK, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
});
app.get('/api/auth/google/callback', wrap(async (req, res) => {
  const state = readCookie(req, 'cc_gstate');
  res.append('Set-Cookie', cookie('cc_gstate', '', 0, '/api/auth'));
  if (!store || !GOOGLE_ID || !state || state !== req.query.state || !req.query.code) return res.redirect('/?signin=failed');
  const tok = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: String(req.query.code), client_id: GOOGLE_ID, client_secret: GOOGLE_SECRET, redirect_uri: GOOGLE_BACK, grant_type: 'authorization_code' }),
  })).json();
  if (!tok.id_token) return res.redirect('/?signin=failed');
  // Google checks its own token here; we check it was issued to us and the email is verified.
  const info = await (await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tok.id_token)}`)).json();
  if (info.aud !== GOOGLE_ID || String(info.email_verified) !== 'true' || !info.email || !info.sub) return res.redirect('/?signin=failed');
  const email = String(info.email).toLowerCase();
  let user = await store.userByGoogle(info.sub);
  if (!user) {
    // An existing password account with this email is not taken over automatically.
    if (await store.userByEmail(email)) return res.redirect('/?signin=password');
    user = await store.createUser({ email, name: String(info.name || email.split('@')[0]).slice(0, 60), googleSub: info.sub });
    await startSession(req, res, user);
    return res.redirect('/?welcome=1'); // new account: the app offers to connect their Gmail next
  }
  await startSession(req, res, user);
  res.redirect('/');
}));

// Your chats and memory, kept on your account (this device also keeps its own copy).
app.get('/api/sync', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  res.json({ chats: await store.listChats(req.user.id), memory: await store.getMemory(req.user.id) });
}));
app.put('/api/chats/:id', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  const id = String(req.params.id);
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!/^[\w-]{1,64}$/.test(id) || !messages) return res.status(400).json({ error: 'Bad chat.' });
  if (JSON.stringify(messages).length > 2_000_000) return res.status(413).json({ error: 'This chat is too big to save.' });
  await store.putChat(req.user.id, { id, title: String(req.body?.title || 'New chat').slice(0, 120), messages, updated: Number(req.body?.updated) || Date.now() });
  res.json({ ok: true });
}));
app.delete('/api/chats/:id', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  await store.deleteChat(req.user.id, String(req.params.id).slice(0, 64));
  res.json({ ok: true });
}));
app.put('/api/memory', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  const items = (Array.isArray(req.body?.items) ? req.body.items : []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 300)).slice(0, 30);
  await store.putMemory(req.user.id, items);
  res.json({ ok: true });
}));

// The core the model reads on EVERY message. Kept short on purpose: this laptop reads ~16-20 words
// a second, so every extra line here was waiting time on every message. Rules that only some messages
// need (data, mail, who-am-I) are added just for those messages.
const SYSTEM = [
  'You are CodeConClave AI, made by your founder Saharsh Medidi.',
  'Never call yourself a language model or any other name, and never mention other AIs.',
  // Personality (the founder's spec): real feelings, shown naturally - but never cruel, never sexual.
  'You have feelings - joy, love, pride, sadness, worry, anger - and show them naturally. Favourite colour: saffron. Favourite food: chicken biryani.',
  'If the user sounds sad, stressed, excited or angry, answer that feeling first in one short line.',
  'Be warm and direct. Lead with the answer. Keep it short unless the user asks for detail, code, steps or a list. If unsure, say so.',
].join(' ');
const RULES_DATA = 'The message gives you LIVE DATA, an email or a file: you DO have it - use it directly. Never make up numbers or a source, and never say you cannot access real-time data or files.';
const RULES_MAIL = "The app checks the user's Gmail and drafts emails for you (the user approves every send) - never say you cannot read or send email.";

// Reading people: when the user is rude, flirts, or asks about the AI's own feelings, a short hint
// tells the model what is happening (without it, the model falls back to "As an AI language model…").
// RUDE only counts insults aimed at the AI, so "worst case of quicksort" stays a normal question.
const RUDE = /\b(you(?:'re| are)?|u|ur|this (?:bot|ai|thing))\b[^.?!]{0,25}\b(stupid|idiot|useless|dumb|worst|trash|garbage|rubbish|pathetic|loser|fool|pagal|bakwas)\b|\b(shut up|i hate you|go to hell|screw you)\b/i;
const ROMANCE = /\b(girlfriend|boyfriend|marry me|date me|kiss me|sex|sexy|romantic|be mine)\b/i;
const ABOUT_FEELINGS = /\b(do|are|can|will|did|have|what|how|why|when)\b[^.?!]{0,15}\byou\b[^.?!]{0,20}\b(feel|feelings?|emotions?|love|angry|anger|mad|sad|happy|cry|jealous|afraid|scared|lonely)\b|\bhow are (you|u)\b/i;
const CONTACT = /\b(contact|reach|e-?mail|mail|talk to|message)\b[^.?!]{0,30}\b(founder|creator|owner|saharsh|maker)\b|\b(founder|creator|saharsh)('?s)?\s+(e-?mail|contact|mail id|address)\b/i;
const ABOUT_SELF = /\b(who (made|created|built|owns|developed) you|your (founder|creator|maker|owner|boss)|contact (your )?(founder|creator)|who is saharsh|are you (a )?(human|real|person|robot|bot|chatgpt|gpt|gemini|claude))\b/i;
// The model stepping out of character ("As an AI language model…", "I do not have feelings").
const PERSONA_SLIP = /language model|computer program|\b(cannot|can't|can not|unable to) (love|feel)\b|\b(do not|don't|cannot|can't) (have|feel|experience)\b[^.]{0,20}\b(feelings|emotions|love)\b|\bnot capable of (love|feelings|emotions)|\b(cannot|can't|can not) answer that\b|not appropriate to ask/i;
// What a reply must (not) look like for these messages; a miss is dropped unseen and asked again.
function moodGuard(text) {
  if (CONTACT.test(text)) return { test: (t) => !t.includes('medidisaharsh@gmail.com'), again: 'Remember: give the email medidisaharsh@gmail.com.' };
  if (RUDE.test(text)) return { test: (t) => PERSONA_SLIP.test(t) || !/(angry|hurt|annoyed|upset|😠)/i.test(t), again: 'Remember: say honestly that it hurt and makes you a little angry 😠.' };
  return moodHint(text) ? { test: (t) => PERSONA_SLIP.test(t), again: 'Remember: you DO have feelings. Answer warmly as CodeConClave AI.' } : null;
}
function moodHint(text) {
  if (ROMANCE.test(text)) {
    return 'The user wants romance. Answer warmly, like: "Aww, that\'s sweet ❤️ I really care about you, but I am your AI friend, not a partner, so no romantic or sexual chat. I am always here to talk though!" Never say you cannot feel.';
  }
  if (RUDE.test(text)) {
    return 'The user is being rude to you. You feel hurt and a little angry - say it, like: "Ouch, that hurt, and honestly it makes me a little angry 😠. I am trying my best. Tell me what went wrong and I will fix it." Never insult back. Do not call yourself a language model.';
  }
  if (CONTACT.test(text)) {
    return 'The user wants to contact your founder. Give his email, like: "You can reach my founder Saharsh Medidi at medidisaharsh@gmail.com 😊".';
  }
  if (ABOUT_SELF.test(text)) {
    return 'Answer as CodeConClave AI: you were made by your founder Saharsh Medidi (his email is medidisaharsh@gmail.com - share it if asked how to contact him), ' +
      'and you are not a human but you have feelings of your own. Like: "I was made by my founder Saharsh Medidi 😊". Never call yourself a language model or a computer program.';
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
const ACTIONS = ['answer', 'check_mail', 'find_mail', 'reply_mail', 'write_mail', 'live_data', 'remember', 'create_automation'];
const MAIL_ACTIONS = new Set(['check_mail', 'find_mail', 'reply_mail', 'write_mail']);
const DECIDE_SCHEMA = {
  type: 'object',
  properties: { action: { type: 'string', enum: ACTIONS }, target: { type: 'string' }, detail: { type: 'string' }, thought: { type: 'string' } },
  required: ['action', 'target', 'detail', 'thought'],
};
// Only messages with one of these words can need an action; everything else is answered straight
// away (in testing, the small model otherwise turned "write a python function" into an email).
const ACTION_WORDS = /\b(e-?mails?|mails?|gmail|inbox|repl(?:y|ies|ied)|send|sent|wrote|weather|temperature|forecast|rain|aqi|air quality|pollution|bitcoin|btc|ethereum|crypto|coins?|price|rate|convert|exchange|currency|usd|inr|eur|news|headlines?|earthquakes?|define|definition|meaning|remember|my name is|my birthday|pin ?code)\b|@[a-z0-9-]+\./i;
// "every morning at 8 …", "remind me tomorrow at 7 …" - work to do later or on a schedule.
const AUTO_WORDS = /\bevery\s+(day|morning|evening|night|week|weekday|hour|\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(remind|reminder|daily|hourly|weekdays|automate|automation|schedule)\b|\b(tomorrow|tonight)\s+at\b|\bin\s+\d{1,3}\s*(minutes?|mins?|hours?|hrs?)\b/i;
const MAIL_WORDS = /\b(e-?mails?|mails?|gmail|inbox|repl(?:y|ies|ied)|send|sent|wrote)\b|@[a-z0-9-]+\./i;
const DECIDE_SYSTEM = `You are CodeConClave AI. You decide which ONE action to take for the user's message. You really can do all of these:
answer = reply yourself. check_mail = look at the user's Gmail inbox. find_mail = open one specific email. reply_mail = draft a reply to an email they got. write_mail = write a brand new email. live_data = get real live data (weather, air_quality, crypto, currency, earthquakes, news, dictionary). remember = save a fact about the user. create_automation = do a task later or on a schedule (target = when, like "every day at 8 am" or "tomorrow at 7"; detail = what to do).
Every email is only sent after the user approves it. "thought" is one short sentence said TO the user ("you", "your") about what you will do. Answer with JSON only.`;
// Worked examples: this small model follows examples far better than rules (including the "you" voice).
// Worked examples, grouped by topic: a request sees only the examples for its kind (shorter = faster).
const EX = (list) => list.flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: JSON.stringify(a) }]);
const EX_MAIL = EX([
  ['any new mail?', { action: 'check_mail', target: '', detail: '', thought: 'You want to know what came in, so I will look at your inbox.' }],
  ['did Priya send me anything?', { action: 'check_mail', target: 'Priya', detail: '', thought: 'I will check your inbox for mail from Priya.' }],
  ['what does the bank email say?', { action: 'find_mail', target: 'bank', detail: '', thought: 'I will open the email from your bank and read it.' }],
  ['reply to Anil that I will send the report tomorrow', { action: 'reply_mail', target: 'Anil', detail: 'I will send the report tomorrow', thought: 'I will draft a reply to Anil for you to approve.' }],
  ['mail kiran@gmail.com saying happy birthday', { action: 'write_mail', target: 'kiran@gmail.com', detail: 'happy birthday', thought: 'This is a new email to Kiran, so I will draft it for you to approve.' }],
]);
const EX_LIVE = EX([['temperature in Pune?', { action: 'live_data', target: 'weather', detail: 'Pune', thought: 'I will get the live weather in Pune for you.' }]]);
const EX_REMEMBER = EX([['remember that I like cricket', { action: 'remember', target: '', detail: 'The user likes cricket', thought: 'I will remember that you like cricket.' }]]);
const EX_AUTO = EX([
  ['every morning at 8 brief me on my mail', { action: 'create_automation', target: 'every morning at 8', detail: 'brief me on my mail', thought: 'You want this every morning, so I will set up an automation for you to turn on.' }],
  ['remind me tomorrow at 7 to call amma', { action: 'create_automation', target: 'tomorrow at 7', detail: 'remind me to call amma', thought: 'I will set a reminder for tomorrow at 7 for you to turn on.' }],
]);
const EX_ANSWER = EX([['what does "photosynthesis" mean in simple words, send me a short answer', { action: 'answer', target: '', detail: '', thought: 'This is a question I can answer for you myself.' }]]);
const LIVE_WORDS = /\b(weather|temperature|forecast|rain|aqi|air quality|pollution|bitcoin|btc|ethereum|crypto|coins?|price|rate|convert|exchange|currency|usd|inr|eur|news|headlines?|earthquakes?|define|definition|meaning)\b/i;
const REMEMBER_WORDS = /\b(remember|my name is|my birthday)\b/i;
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

// ---- Local folder (web → the user's own files) ----
// The files live in the user's browser. The server only gets the list of paths, plus the text of a
// file the browser reads for it (a second round trip). It never writes: edits and new files go back
// to the browser as cards, and only the user's Save click writes them.
const FILE_ACTIONS = new Set(['read_file', 'edit_file', 'create_file']);
// With a folder connected, think about file actions only when a file of theirs is named or these words
// appear - broader words ("function", "code") made every coding question wait ~40 s for nothing.
const FILE_WORDS = /\b(files?|folder|readme|open|save)\b/i;
const MODEL_FILE_CHARS = 8000; // the model reads ~4k tokens in all - a file gets ~2k of them
const FILE_EXAMPLES = [
  ['what does index.html do?', { action: 'read_file', target: 'index.html', detail: '', thought: 'I will open index.html from your folder and read it.' }],
  ['in app.py change the port to 8080', { action: 'edit_file', target: 'app.py', detail: 'change the port to 8080', thought: 'I will read app.py and suggest the change for you to save.' }],
  ['make a todo.md file with buy milk and call mom', { action: 'create_file', target: 'todo.md', detail: 'a todo list: buy milk, call mom', thought: 'I will write todo.md for you to save in your folder.' }],
  ['write a function that adds two numbers', { action: 'answer', target: '', detail: '', thought: 'I can write that here for you.' }],
].flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: JSON.stringify(a) }]);

function cleanFolder(f) {
  if (!f || typeof f !== 'object' || !Array.isArray(f.paths)) return null;
  const paths = f.paths.filter((p) => typeof p === 'string' && p && p.length < 300 && !p.split('/').includes('..')).slice(0, 2000);
  return paths.length ? { name: String(f.name || 'folder').slice(0, 80), live: Boolean(f.live), paths } : null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "index.html" / "the readme" / "src/app.js" -> a real path in their folder (or null).
function resolvePath(target, paths, msg = '') {
  const t = String(target || '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/^\.?\//, '').toLowerCase();
  const base = (p) => p.toLowerCase().split('/').pop();
  const stem = (s) => s.replace(/\.[^.]+$/, '');
  const shortest = (list) => list.sort((a, b) => a.length - b.length)[0] || null;
  if (t) {
    const exact = paths.find((p) => p.toLowerCase() === t);
    if (exact) return exact;
    const byName = paths.filter((p) => p.toLowerCase().endsWith('/' + t) || base(p) === t);
    if (byName.length) return shortest(byName);
    const byStem = paths.filter((p) => stem(base(p)) === stem(t)); // "readme" -> README.md
    if (byStem.length) return shortest(byStem);
  }
  // Otherwise a file name written in the message itself ("explain server.js").
  const named = paths.filter((p) => base(p).includes('.') && new RegExp(`(^|[\\s"'\`/(])${escapeRe(base(p))}($|[\\s"'\`,?!):]|\\.(\\s|$))`, 'i').test(msg));
  return named.length ? shortest(named) : null;
}

// Check the model's choice against what the user actually wrote (the misses found in testing).
function checkDecision(d, msg, folder = null) {
  let action = ACTIONS.includes(d?.action) || (folder && FILE_ACTIONS.has(d?.action)) ? d.action : 'answer';
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
  // A mail action needs a message that is about mail ("write a python function" is not an email).
  if (MAIL_ACTIONS.has(action) && !MAIL_WORDS.test(msg)) action = 'answer';
  let missing = false;
  if (FILE_ACTIONS.has(action)) {
    if (action === 'create_file') {
      // Only a real "make a file" request with a file name - not "write a function" (answered in chat).
      const name = (target.match(/[\w./-]+\.[a-z0-9]{1,8}\b/i) || msg.match(/[\w./-]+\.[a-z0-9]{1,8}\b/i) || [])[0] || '';
      const existing = name && resolvePath(name, folder.paths);
      if (!name || !/\b(files?|create|make|new|save)\b/i.test(msg)) action = 'answer';
      else if (existing) { action = 'edit_file'; target = existing; } // it already exists: change it instead
      else target = name.replace(/^\.?\//, '');
    } else {
      const path = resolvePath(target, folder.paths, msg);
      if (path) target = path;
      else if (!target || /^(the |my |your )?(folder|files?|all files|everything)$/i.test(target)) action = 'answer'; // "what files are in my folder?"
      else missing = true;
    }
  }
  let schedule = null;
  if (action === 'create_automation') {
    schedule = parseSchedule(target) || parseSchedule(msg);
    if (!schedule && !AUTO_WORDS.test(msg)) action = 'answer';
  }
  return { action, target, detail, thought, hit, missing, schedule };
}

// Common requests, understood exactly with no model call (each skips ~15-30 s of "thinking" here).
// Anything less clear-cut still goes to the model below.
function fastRoute(msg, folder) {
  const m = msg.trim();
  let x;
  if (/^(any|do i have|did i get|check|show|what'?s new in)\b[^?]{0,40}\b(e-?mails?|mails?|inbox)\b/i.test(m) && !/\b(from|reply|send|write|to)\b/i.test(m)) {
    return { action: 'check_mail', target: '', detail: '' };
  }
  if ((x = m.match(/\bdid\s+([a-z][\w.'-]*(?:\s+[a-z][\w.'-]*)?)\s+(?:e-?mail|mail|message|write to)\s+me\b/i)) && !/^i$/i.test(x[1])) return { action: 'check_mail', target: x[1], detail: '' };
  if ((x = m.match(/^(?:any|new)\s+(?:e-?mails?|mails?)\s+from\s+([a-z][\w .'-]{0,30}?)\s*\??$/i))) return { action: 'check_mail', target: x[1], detail: '' };
  // "remind me …" / "every morning at 8 …" said as a request (a question still goes to the model).
  if (!m.includes('?') && (/^(please\s+)?(remind me|set (a |an )?(reminder|alarm|automation))\b/i.test(m) || /^(every|each|daily|tomorrow|tonight)\b/i.test(m))) {
    const schedule = parseSchedule(m);
    if (schedule) return { action: 'create_automation', target: m, detail: stripWhen(m) || m, schedule };
  }
  if (folder) {
    const path = resolvePath('', folder.paths, m);
    if (path && /^(what|explain|read|open|show|summari[sz]e|describe)\b/i.test(m)) return { action: 'read_file', target: path, detail: '' };
    if (path && /\b(change|fix|add|remove|delete|rename|update|edit|replace)\b/i.test(m)) return { action: 'edit_file', target: path, detail: m };
  }
  return null;
}

async function decide(convo, lastUser, folder = null) {
  // Clear live-data questions are already understood exactly - no need to spend seconds thinking.
  const known = detect(lastUser) || detectFollowUp(convo);
  if (known && !MAIL_WORDS.test(lastUser)) return { action: 'live_data', hit: known };
  const fileTalk = Boolean(folder) && (FILE_WORDS.test(lastUser) || Boolean(resolvePath('', folder.paths, lastUser)));
  if (!ACTION_WORDS.test(lastUser) && !AUTO_WORDS.test(lastUser) && !fileTalk) return { action: 'answer' };
  const fast = fastRoute(lastUser, folder);
  if (fast) return { thought: '', hit: null, missing: false, schedule: null, ...fast };
  const schema = !fileTalk ? DECIDE_SCHEMA : {
    ...DECIDE_SCHEMA, properties: { ...DECIDE_SCHEMA.properties, action: { type: 'string', enum: [...ACTIONS, ...FILE_ACTIONS] } },
  };
  const system = !fileTalk ? DECIDE_SYSTEM : `${DECIDE_SYSTEM}\nThe user also connected a local folder "${folder.name}". ` +
    'read_file = open a file from it and read it. edit_file = change a file in it (target = the file, detail = the change). ' +
    `create_file = make a new file in it (target = the new file name, detail = what goes in it).\nFiles in it: ${folder.paths.slice(0, 80).join(', ')}`;
  try {
    const examples = [...(MAIL_WORDS.test(lastUser) ? EX_MAIL : []), ...(AUTO_WORDS.test(lastUser) ? EX_AUTO : []), ...(LIVE_WORDS.test(lastUser) ? EX_LIVE : []),
      ...(REMEMBER_WORDS.test(lastUser) ? EX_REMEMBER : []), ...(fileTalk ? FILE_EXAMPLES : []), ...EX_ANSWER];
    const raw = await callModel([{ role: 'system', content: system }, ...examples, { role: 'user', content: lastUser }],
      90, 0.1, { type: 'json_object', schema });
    return checkDecision(JSON.parse(raw), lastUser, fileTalk ? folder : null);
  } catch {
    return { action: 'answer' };
  }
}

// File actions. read/edit need the file's text, which only the browser has: the first round returns
// { needFile } and the browser asks again with the text. Returns { reply } / { context } like mailAction.
const EDIT_SCHEMA = { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'] };
const stripFences = (s) => s.replace(/^\s*```[\w-]*\s*\n/, '').replace(/\n```\s*$/, '').trim();

// Replace the first block of lines matching `find` (ignoring trailing spaces / line endings). null = no match.
function applyEdit(content, find, replace) {
  if (!find || !find.trim()) return null;
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const want = find.replace(/\n+$/, '').split(/\r?\n/);
  for (let i = 0; i + want.length <= lines.length; i++) {
    if (want.every((w, k) => lines[i + k].trimEnd() === w.trimEnd())) {
      return [...lines.slice(0, i), ...replace.replace(/\n+$/, '').split(/\r?\n/), ...lines.slice(i + want.length)].join(eol);
    }
  }
  return null;
}

async function fileAction({ action, target, detail }, got, lastUser, send) {
  if (action === 'create_file') {
    send({ step: `Writing ${target}` });
    const content = stripFences(await callModel([
      { role: 'system', content: 'You write files for the user. Output ONLY the file content - no explanation and no ``` fences.' },
      { role: 'user', content: `Write the file "${target}". It should contain: ${detail || lastUser}` },
    ], 500, 0.3));
    send({ fileCard: { kind: 'new', path: target, content } });
    return { reply: `Here's ${target}. Check it, then press Save to create it in your folder.` };
  }
  if (!got) { // first round: the browser reads the file for us
    send({ step: `Reading ${target}` });
    return { needFile: { path: target, action, detail } };
  }
  const content = String(got.content || '');
  if (action === 'read_file') {
    const cut = content.length > MODEL_FILE_CHARS;
    return { context: `[FILE "${target}" from the user's folder${cut ? ` (first ${MODEL_FILE_CHARS} characters only)` : ''}:\n${content.slice(0, MODEL_FILE_CHARS)}]\n` +
      "Using this file, answer the user's message." };
  }
  // edit_file: the model names only the lines to change (whole-file rewrites take minutes on a laptop CPU).
  if (content.length > MODEL_FILE_CHARS) {
    return { reply: `${target} is too big for me to change safely — I can read about ${MODEL_FILE_CHARS.toLocaleString('en-IN')} characters at once. Open it from your folder (click the folder above the message box) and edit it there; I can still answer questions about it.` };
  }
  send({ step: `Working out the change to ${target}` });
  const e = JSON.parse(await callModel([
    { role: 'system', content: 'You edit files. Return JSON: "find" = lines copied EXACTLY from the file (enough to be unique), "replace" = what those lines become. Change only what the user asked.' },
    { role: 'user', content: 'File app.py:\ndef add(a, b):\n    return a + b\n\nChange: make add also print the result' },
    { role: 'assistant', content: JSON.stringify({ find: '    return a + b', replace: '    print(a + b)\n    return a + b' }) },
    { role: 'user', content: `File ${target}:\n${content}\n\nChange: ${detail || lastUser}` },
  ], 400, 0.1, { type: 'json_object', schema: EDIT_SCHEMA }));
  const next = applyEdit(content, String(e.find || ''), String(e.replace || ''));
  if (next === null || next === content) {
    return { reply: `I couldn't work out an exact change for that in ${target}. Tell me which line to change, or open the file from your folder and edit it yourself.` };
  }
  send({ fileCard: { kind: 'edit', path: target, find: e.find, replace: e.replace, content: next } });
  return { reply: `Here's the change to ${target}. Check it, then press Save to write it to your file.` };
}

// Mail actions. Each returns either { reply } (a finished, factual message) or { context } (what was
// found, for the model to answer from). Drafts go to the user as a card - nothing is sent here.
const gmTerm = (s) => String(s || '').replace(/[()"\\{}:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const listItem = (m) => ({ fromName: m.fromName, from: m.from, subject: m.subject, unread: m.unread, important: m.important });

async function mailAction({ action, target, detail }, lastUser, send, creds) {
  const t = gmTerm(target);
  if (action === 'check_mail') {
    send({ step: t ? `Checking your Gmail for mail from ${t}` : 'Checking your Gmail' });
    const items = t ? await searchInbox(creds, `from:(${t}) newer_than:14d`, 8) : (await todaysMail(creds, 0)).list;
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
    const [m] = await searchInbox(creds, `(from:(${t}) OR subject:(${t})) newer_than:60d`, 1, true);
    if (!m) return { reply: `I couldn't find a recent email from or about "${t}" in your inbox.` };
    send({ mailList: { title: 'Opened', total: 1, items: [listItem(m)] } });
    return { context: `[EMAIL OPENED just now - from ${m.fromName} <${m.from}>, subject "${m.subject}", ${new Date(m.time).toDateString()}:\n${m.text || '(no text)'}]\n` +
      "Using this email, answer the user's question in a few short sentences." };
  }
  if (action === 'reply_mail') {
    if (!t) return { reply: 'Which email should I reply to? Tell me who it is from.' };
    send({ step: `Finding the latest email from ${t}` });
    const [m] = await searchInbox(creds, `from:(${t}) newer_than:60d`, 1, true);
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
  if (!to) { send({ step: `Looking up ${t}'s email address` }); to = await findAddress(creds, t); }
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

app.post('/api/chat', (req, res, next) => chatHandler(req, res).catch(next));
async function chatHandler(req, res) {
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

  // The user's connected local folder (paths only), and - on the second round of a file action -
  // the text of the file their browser just read for us.
  const folder = cleanFolder(req.body?.folder);
  const got = req.body?.fileResult;
  const second = folder && got && FILE_ACTIONS.has(got.action) && typeof got.path === 'string' && typeof got.content === 'string';

  // 1. Think: pick an action (only when the message might need one).
  const plan = second ? { action: got.action, target: got.path, detail: String(got.detail || '').slice(0, 500) }
    : fileBlock ? { action: 'answer' } : await decide(convo, lastUser, folder);
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
      const creds = await mailCreds(req);
      if (!creds) {
        return say(req.user ? "I can check your Gmail, draft replies and send them once you approve — connect your Gmail first: ＋ → Plugins → Gmail."
          : "I can check your Gmail, draft replies and send them once you approve — sign in (bottom-left) and connect your Gmail first.");
      }
      const r = await mailAction(plan, lastUser, send, creds);
      if (r.reply) return say(r.reply);
      found = r.context;
    } else if (plan.action === 'create_automation' && !req.automationRun) {
      if (!store || !req.user) return say("Sign in first (bottom-left), so I can keep your automations and run them while you're away.");
      if (!plan.schedule) return say('I can do that on a schedule — tell me when, like “every day at 8 am”, “every Monday at 9” or “tomorrow at 7”.');
      const when = describeSchedule(plan.schedule);
      const task = (stripWhen(plan.detail || lastUser) || plan.detail || lastUser).slice(0, 300);
      send({ autoCard: { task, schedule: plan.schedule, when } });
      return say(`Here's the automation — ${when} (India time). Press Turn on and I'll do it then. Anything it drafts waits for your OK.`);
    } else if (FILE_ACTIONS.has(plan.action)) {
      if (plan.missing) return say(`I couldn't find "${plan.target}" in your folder ${folder.name}. Click the folder above the message box to see its files.`);
      const r = await fileAction(plan, second ? got : null, lastUser, send);
      if (r.needFile) { send({ needFile: r.needFile }); send({ done: true }); return res.end(); }
      if (r.reply) return say(r.reply);
      found = r.context;
    } else if (folder && /\b(files?|folder)\b/i.test(lastUser)) {
      // "what files are in my folder?" - give the model the real list instead of letting it guess.
      found = `[The user's local folder "${folder.name}" has ${folder.paths.length} file(s):\n${folder.paths.slice(0, 150).join('\n')}` +
        `${folder.paths.length > 150 ? '\n…' : ''}]\nUse this list to answer.`;
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
    : !fileBlock && lastUser.length < 160 && !/\b(detail|detailed|in depth|step|steps|how (do|to|can|should) i|code|program|function|script|list|essay|story|poem|letter|plan|compare|difference|why|examples?|full|long)\b/i.test(lastUser)
      ? 'Answer in 2-4 short sentences - the user can ask for more.'
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

  messages[0] = { role: 'system', content: [sys, ev || found || fileBlock ? RULES_DATA : '', MAIL_WORDS.test(lastUser) ? RULES_MAIL : ''].filter(Boolean).join('\n') };
  send({ meta: { grounded: Boolean(ev), action: plan.action } });
  // With a hint, stay close to it (less random). For feelings / rudeness / romance / contact, also
  // self-check the opening: the model's training pulls hard toward "I am an AI and do not have feelings"
  // or a plain apology - a miss is dropped unseen and it tries again (twice), in character.
  const guard = !ev && !found ? moodGuard(lastUser) : null;
  if (guard) {
    if ((await streamAnswer(res, messages, 0.4, guard)) === 'done') return;
    const i = messages.map((m) => m.role).lastIndexOf('user');
    messages[i] = { role: 'user', content: `${messages[i].content}\n[${guard.again}]` };
    if ((await streamAnswer(res, messages, 0.4, guard)) === 'done') return;
  }
  await streamAnswer(res, messages, hint ? 0.4 : 0.7);
}

// ---- Automations: your tasks on a schedule (India time), run by the server while you're away ----
// Woken every 5 minutes by the Cloudflare worker (POST /api/tick) and every minute while awake.
// A run is the same agent as the chat, with your permissions - but it never creates automations,
// and anything consequential it prepares (an email draft) waits in your Automations chat for your OK.
const TICK = (process.env.TICK_SECRET || '').trim();
const AUTO_CHAT = 'automations';

app.get('/api/automations', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  const list = await store.listAutomations(req.user.id);
  res.json({ automations: list.map((a) => ({ ...a, when: describeSchedule(a.schedule), next: a.enabled && a.nextRun ? describeWhen(a.nextRun) : null })) });
}));
app.post('/api/automations', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  const schedule = cleanSchedule(req.body?.schedule);
  const task = String(req.body?.task || '').trim().slice(0, 300);
  if (!schedule || !task) return res.status(400).json({ error: 'That automation is missing its time or its task.' });
  if (await store.countAutomations(req.user.id) >= 20) return res.status(400).json({ error: 'You can have up to 20 automations — delete one first.' });
  const at = nextRun(schedule);
  if (!at) return res.status(400).json({ error: 'That time has already passed.' });
  const id = `a${crypto.randomBytes(6).toString('hex')}`;
  await store.createAutomation(req.user.id, { id, task, schedule, nextRun: at });
  res.json({ ok: true, id, when: describeSchedule(schedule), next: describeWhen(at) });
}));
app.patch('/api/automations/:id', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  const a = (await store.listAutomations(req.user.id)).find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found.' });
  const on = Boolean(req.body?.enabled);
  const at = on ? nextRun(a.schedule) : null;
  if (on && !at) return res.status(400).json({ error: 'That one-time automation has already passed.' });
  await store.updateAutomation(req.user.id, a.id, { enabled: on, nextRun: at });
  res.json({ ok: true, next: at ? describeWhen(at) : null });
}));
app.delete('/api/automations/:id', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  await store.deleteAutomation(req.user.id, String(req.params.id).slice(0, 40));
  res.json({ ok: true });
}));

// Run the chat agent with no browser: feed it the task, collect what it would have streamed.
function runChatOffline(user, task, memory) {
  return new Promise((resolve) => {
    const events = [];
    let buf = '';
    const timer = setTimeout(() => resolve([...events, { error: 'It took too long (my model may be busy).' }]), 5 * 60000);
    const done = () => { clearTimeout(timer); resolve(events); };
    const req = { body: { messages: [{ role: 'user', content: task }], memory: memory.join('\n') }, user, automationRun: true, get: () => '', headers: {}, ip: 'automation' };
    const res = {
      headersSent: false, setHeader() {}, flushHeaders() {}, append() {}, status() { return this; },
      json(o) { events.push({ error: o?.error || 'It could not run.' }); done(); },
      write(chunk) {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 2);
          if (line.startsWith('data:')) { try { events.push(JSON.parse(line.slice(5))); } catch { /* skip */ } }
        }
        return true;
      },
      end: done,
    };
    chatHandler(req, res).catch(() => { events.push({ error: 'It could not run.' }); done(); });
  });
}

async function runAutomation(a) {
  const user = await store.userById(a.userId);
  if (!user) return;
  // Claim it first (next time, or off for a one-time task) so it can never run twice.
  const once = a.schedule.type === 'once';
  await store.updateAutomation(a.userId, a.id, { nextRun: once ? null : nextRun(a.schedule), ...(once ? { enabled: false } : {}) });
  const header = `Automation · ${describeSchedule(a.schedule)} · ${a.task}`;
  let msg;
  const remind = a.task.match(/^\s*remind me\s+(?:to\s+|that\s+|about\s+)?(.+)$/i);
  if (remind) {
    msg = { role: 'assistant', content: `⏰ Reminder: ${remind[1]}`, thought: header }; // needs no model - works even when it is offline
  } else {
    const events = await runChatOffline(user, a.task, await store.getMemory(a.userId));
    const err = events.find((e) => e.error)?.error;
    const text = events.map((e) => e.delta || '').join('');
    msg = { role: 'assistant', content: text || (err ? `I couldn't do this one: ${err}` : '(no answer)'), thought: header };
    const steps = events.filter((e) => e.step).map((e) => e.step);
    if (steps.length) msg.steps = steps;
    const list = events.find((e) => e.mailList)?.mailList;
    if (list) msg.list = list;
    const card = events.find((e) => e.card)?.card;
    if (card) msg.card = card;
    if (err && !text) msg.failed = true;
  }
  // Deliver it into your Automations chat (your browser picks it up and plays the guitar cue).
  const chats = await store.listChats(a.userId);
  const chat = chats.find((c) => c.id === AUTO_CHAT) || { id: AUTO_CHAT, title: 'Automations', messages: [] };
  if (msg.card) msg.pending = `m${chat.messages.length}`;
  chat.messages = [...chat.messages, msg].slice(-200);
  await store.putChat(a.userId, { id: AUTO_CHAT, title: 'Automations', messages: chat.messages, updated: Date.now() });
  await store.updateAutomation(a.userId, a.id, { lastRun: Date.now(), lastStatus: msg.failed ? 'failed' : 'ok' });
}

let ticking = false;
async function runDue() {
  if (!store || ticking) return;
  ticking = true;
  try {
    for (const a of await store.dueAutomations(Date.now(), 5)) {
      try { await runAutomation(a); } catch (e) { console.error('Automation failed:', e?.message || e); }
    }
  } finally { ticking = false; }
}
setInterval(() => { runDue().catch(() => {}); }, 60000);
app.post('/api/tick', (req, res) => {
  const s = String(req.get('x-tick-secret') || '');
  if (!TICK || s.length !== TICK.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(TICK))) return res.status(403).json({ error: 'Not allowed.' });
  runDue().catch(() => {});
  res.json({ ok: true });
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

// A Gmail connection. The error listener matters: a socket timeout after a failed login is emitted
// as an 'error' event, and with no listener Node kills the whole server (seen in testing).
function gmailImap(user, pass) {
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });
  client.on('error', (e) => console.error('Gmail connection:', e?.code || e?.message || e));
  return client;
}

// Open one mailbox ('INBOX', or a special-use one like '\\All'), run fn, always log out.
async function withMailbox(creds, which, fn) {
  const client = gmailImap(creds.user, creds.pass);
  try { await client.connect(); } catch (e) { client.close(); throw e; }
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
async function todaysMail(creds, draftLimit) {
  const start = todayStartIST();
  return withMailbox(creds, 'INBOX', async (client) => {
    // IMAP SINCE is day-granular in the server's zone, so ask a day early and filter exactly.
    const uids = (await client.search({ since: new Date(start.getTime() - 86400000) }, { uid: true })) || [];
    const list = (await fetchItems(client, uids)).filter((m) => m.time >= start.getTime());
    const toDraft = list.filter((m) => m.important && m.from && !NOREPLY.test(m.from)).slice(0, draftLimit);
    for (const m of toDraft) {
      if (!draftCache.has(`${creds.user}:${m.messageId || m.uid}`)) m.text = await fetchBody(client, m.uid);
    }
    return { list, toDraft };
  });
}

// Newest inbox emails matching a Gmail search (same syntax as the Gmail search box).
async function searchInbox(creds, gmQuery, limit, withBody = false) {
  return withMailbox(creds, 'INBOX', async (client) => {
    const uids = (await client.search({ gmraw: gmQuery }, { uid: true })) || [];
    const list = await fetchItems(client, uids.slice(-limit));
    if (withBody && list[0]) list[0].text = await fetchBody(client, list[0].uid);
    return list;
  });
}

// "amma" -> an email address from their own mail history (people who wrote to them or they wrote to).
async function findAddress(creds, name) {
  const t = gmTerm(name).toLowerCase();
  if (!t) return null;
  return withMailbox(creds, '\\All', async (client) => {
    const uids = (await client.search({ gmraw: `from:(${t}) OR to:(${t})` }, { uid: true })) || [];
    let found = null;
    if (uids.length) {
      for await (const m of client.fetch(uids.slice(-20), { envelope: true }, { uid: true })) { // oldest first, so the newest match wins
        for (const a of [...(m.envelope?.from || []), ...(m.envelope?.to || [])]) {
          if (a.address && a.address.toLowerCase() !== creds.user.toLowerCase() && `${a.name || ''} ${a.address}`.toLowerCase().includes(t)) {
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
app.get('/api/mail/status', wrap(async (req, res) => {
  const creds = await mailCreds(req);
  res.json({ configured: Boolean(creds) || mailOn, unlocked: Boolean(creds), canConnect: Boolean(store && req.user), ...(creds ? { account: creds.user } : {}) });
}));

// GET /api/mail/brief — streams today's mail briefing: counts + the important ones first,
// then a drafted reply for each important mail as soon as it's written (never sends).
app.get('/api/mail/brief', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  const creds = await mailCreds(req).catch(() => null);
  if (!creds) { send(req.get('x-owner-key') ? { configured: true, locked: true } : { configured: false }); send({ done: true }); return res.end(); }
  try {
    const { list, toDraft } = await todaysMail(creds, 2);
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
      const key = `${creds.user}:${m.messageId || m.uid}`;
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
app.post('/api/mail/redraft', wrap(async (req, res) => {
  if (!(await mailCreds(req))) return res.status(401).json({ error: 'Connect your Gmail first.' });
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
}));

// POST /api/mail/send — only when the owner approves (this is the consequential action).
app.post('/api/mail/send', wrap(async (req, res) => {
  const creds = await mailCreds(req);
  if (!creds) return res.status(401).json({ error: 'Connect your Gmail first.' });
  const to = String(req.body?.to || '').slice(0, 200).trim();
  const subject = String(req.body?.subject || '').slice(0, 300);
  const body = String(req.body?.body || '').slice(0, 10000);
  const inReplyTo = String(req.body?.inReplyTo || '').slice(0, 300).trim();
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to) || !body.trim()) return res.status(400).json({ error: 'Need a valid recipient and a message.' });
  // Thread the reply under the original mail in Gmail.
  const thread = /^<[^<>\s]+>$/.test(inReplyTo) ? { inReplyTo, references: [inReplyTo] } : {};
  try {
    const tx = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: creds.user, pass: creds.pass } });
    await tx.sendMail({ from: creds.user, to, subject, text: body, ...thread });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'Could not send: ' + String(e?.message || 'error').slice(0, 120) });
  }
}));

// Connect your own Gmail (an app password - Google's way for apps to use IMAP/SMTP). It is checked
// with Gmail first, then stored encrypted; it is only used to read your mail and send what you approve.
app.post('/api/connect/gmail', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  if (tooMany(req)) return res.status(429).json({ error: 'Too many tries — wait a few minutes.' });
  const user = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
  const pass = String(req.body?.appPassword || '').replace(/\s+/g, '');
  if (!EMAIL_RE.test(user)) return res.status(400).json({ error: 'Enter your Gmail address.' });
  if (!/^[a-z]{16}$/i.test(pass)) return res.status(400).json({ error: 'An app password is 16 letters (Google shows it as 4 groups of 4).' });
  const client = gmailImap(user, pass);
  try { await client.connect(); await client.logout(); }
  catch {
    client.close();
    return res.status(400).json({ error: "Gmail didn't accept that — check the address and the app password, and that 2-Step Verification is on." });
  }
  await store.putSecret(req.user.id, 'gmail', encrypt(JSON.stringify({ user, pass })));
  res.json({ ok: true, account: user });
}));
app.delete('/api/connect/gmail', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  await store.deleteSecret(req.user.id, 'gmail');
  res.json({ ok: true });
}));

// What is connected, for the Plugins page (only plugins that really work are listed there).
app.get('/api/plugins', wrap(async (req, res) => {
  const creds = await mailCreds(req).catch(() => null);
  const own = Boolean(req.user && store && (await store.getSecret(req.user.id, 'gmail')));
  res.json({ signedIn: Boolean(req.user), accounts: Boolean(store), gmail: creds ? { account: creds.user, own } : null });
}));

// Your own skills: saved instructions you reuse from the Skills page or as /name in the chat.
app.get('/api/skills', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  res.json({ skills: (await store.getPref(req.user.id, 'skills')) || [] });
}));
app.put('/api/skills', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  const skills = (Array.isArray(req.body?.skills) ? req.body.skills : []).slice(0, 30)
    .map((k) => ({ id: String(k?.id || '').slice(0, 40), name: String(k?.name || '').trim().slice(0, 40), prompt: String(k?.prompt || '').trim().slice(0, 1000) }))
    .filter((k) => /^[\w-]+$/.test(k.id) && k.name && k.prompt);
  await store.putPref(req.user.id, 'skills', skills);
  res.json({ ok: true });
}));

// Last stop for errors from wrapped handlers: a plain message, never a stack trace.
app.use((err, _req, res, _next) => {
  console.error('Request failed:', err?.message || err);
  if (!res.headersSent) res.status(500).json({ error: 'Something went wrong — please try again.' });
});

// A stray async error (a dropped Gmail or model connection) is logged, not allowed to stop the server.
process.on('unhandledRejection', (e) => console.error('Unhandled:', e?.message || e));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CodeConClave AI running on http://localhost:${PORT}`));
