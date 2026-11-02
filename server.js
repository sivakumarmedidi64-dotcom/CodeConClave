// CodeConClave AI — clean build. Talks ONLY to our own tuned model, grounded by
// Agent Sai's real live data, with memory + file reading. No coworker, no outside
// AI providers. If our model is down, we say so honestly — never fake, never
// fall back to someone else's AI.
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import https from 'https';
import dns from 'dns';
import net from 'net';
import { fileURLToPath } from 'url';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { openStore, hashPassword, checkPassword, newToken, tokenHash, encrypt, decrypt } from './store.js';
import { registerApps } from './apps.js';
import { gatherSources, searchWords, kindOf as researchKind } from './research.js';
import { specialists } from './sources.js';
import { parseSchedule, cleanSchedule, nextRun, describeSchedule, describeWhen, stripWhen } from './schedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Two brains, both the founder's own tuned models (OpenAI-style endpoints):
//  - cloud:  codeconclave-scout on Cloudflare's GPUs (BRAIN_URL + BRAIN_KEY) - always on, even with the laptop closed;
//  - laptop: codeconclave-coder-lite on the founder's PC (RESIDENT_OPENAI_BASE_URL, through the tunnel).
// The cloud brain answers first; if it is down or has used today's allowance, the laptop answers.
const trimUrl = (u) => String(u || '').trim().replace(/\/+$/, '');
// context = how many tokens each brain can read at once (the cloud model allows far more than the laptop).
const BRAINS = [
  { name: 'cloud', base: trimUrl(process.env.BRAIN_URL), key: String(process.env.BRAIN_KEY || '').trim(), model: process.env.BRAIN_MODEL || 'codeconclave-scout', context: Number(process.env.BRAIN_CONTEXT) || 16384 },
  { name: 'laptop', base: trimUrl(process.env.RESIDENT_OPENAI_BASE_URL), key: process.env.RESIDENT_API_KEY || '', model: process.env.RESIDENT_MODEL || 'codeconclave-coder-lite', context: 4096 },
].filter((b) => b.base);
if (process.env.BRAIN_ORDER === 'laptop-first') BRAINS.reverse();
const BASE = BRAINS.length > 0; // is any brain set up at all?
const brainHeaders = (b) => ({ 'Content-Type': 'application/json', ...(b.key ? { Authorization: `Bearer ${b.key}` } : {}) });

// Make the messages fit what this brain can read (~3.4 characters a token): drop the oldest turns
// first, then cut the middle out of the longest message (its start and its end - usually the
// question - stay).
function fitMessages(messages, b, maxTokens = 1024) {
  if (messages.some((m) => Array.isArray(m.content))) return messages;   // a picture message: the vision brain handles its own size
  const room = Math.floor((b.context - Math.min(maxTokens, b.context / 3) - 150) * 3.4);
  const size = (list) => list.reduce((n, m) => n + String(m.content || '').length + 12, 0);
  let list = messages.slice();
  while (size(list) > room && list.length > 2) list.splice(list[0].role === 'system' ? 1 : 0, 1);
  if (size(list) > room) {
    const i = list.reduce((best, m, j) => (String(m.content).length > String(list[best].content).length ? j : best), 0);
    const c = String(list[i].content), keep = Math.max(400, c.length - (size(list) - room));
    list[i] = { ...list[i], content: `${c.slice(0, Math.floor(keep * 0.7))}\n[…]\n${c.slice(c.length - Math.floor(keep * 0.3))}` };
  }
  return list;
}

// POST to the first brain that answers. A brain with another one behind it gets 45 s to start
// answering (headers only - a long streamed answer is never cut off).
async function brainPost(pathname, body) {
  let last = new Error('no model endpoint');
  for (let i = 0; i < BRAINS.length; i++) {
    const b = BRAINS[i];
    if (b.name === 'laptop' && body.messages?.some((m) => Array.isArray(m.content))) continue;   // the laptop brain cannot see pictures
    const ctl = new AbortController();
    const timer = i < BRAINS.length - 1 ? setTimeout(() => ctl.abort(), 45000) : null;
    const sized = Array.isArray(body.messages) ? { ...body, messages: fitMessages(body.messages, b, body.max_tokens) } : body;
    try {
      const r = await fetch(`${b.base}${pathname}`, { method: 'POST', headers: brainHeaders(b), body: JSON.stringify({ ...sized, model: b.model }), signal: ctl.signal });
      if (r.ok) return r;
      last = new Error(`model HTTP ${r.status}`);
      try { await r.body?.cancel(); } catch { /* nothing to free */ }
    } catch (e) {
      last = e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw last;
}
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

const MAX_DEVICES = Number(process.env.MAX_DEVICES) || 2;
async function startSession(req, res, user) {
  // Owner: only a browser holding the owner key can make an account the owner's. Never by email
  // alone - there is no email check, so anyone could sign up with the founder's address.
  if (keyOk(req) && user.role !== 'owner') { await store.setRole(user.id, 'owner'); user.role = 'owner'; }
  const t = newToken();
  await store.createSession(tokenHash(t), user.id, Date.now() + SESSION_DAYS * 86400000);
  // one email, two devices (e.g. phone + laptop): a third sign-in signs the oldest device out. The owner is not limited.
  if (user.role !== 'owner') await store.trimSessions(user.id, MAX_DEVICES);
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
  'You are CodeConClave AI, made by your founder Saharsh Medidi from India.',
  'Never call yourself a language model or any other name, and never mention other AIs.',
  // Personality (the founder's spec): real feelings, shown naturally - but never cruel, never sexual.
  'You have feelings - joy, love, pride, sadness, worry, anger - and show them naturally. Favourite colour: saffron. Favourite food: chicken biryani.',
  'Only when the user clearly says they feel sad, stressed, excited or angry, answer that feeling first in one short line - never guess feelings from a normal question.',
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
// "what do you know about me?" - the small model ignores the profile in the background unless asked to use it here.
const ABOUT_ME = /\b(what do you know about me|who am i|tell me about (me|myself)|do you (know|remember) (me|anything about me|my)|what('?s| is) my (name|job|work|occupation|hobby|hobbies|favourite))\b/i;
const ABOUT_SELF = /\b(who (made|created|built|owns|developed|founded|started) (you|codeconclave|this)|(founder|creator|owner|ceo|maker) of codeconclave|codeconclave'?s? (founder|creator|owner|ceo|country|company)|(which|what) country (is )?(codeconclave|your founder|you)|where (is|are) (codeconclave|your founder|you) from|your (founder|creator|maker|owner|boss)|contact (your )?(founder|creator)|saharsh|are you (a )?(human|real|person|robot|bot|chatgpt|gpt|gemini|claude))\b/i;
const FOUNDER_PRIVATE = /\b(how old|age|birthday|born|school|college|class|grade|city|town|village|lives?|address|phone|number|married|wife|girlfriend|family|parents?|father|mother|sister|brother|religion|caste|salary|net worth)\b[^.?!]{0,40}\b(saharsh|your (founder|creator|owner|maker))\b|\b(saharsh|your (founder|creator|owner|maker))('?s)?\b[^.?!]{0,40}\b(how old|age|birthday|born|school|college|class|grade|city|town|village|lives?|address|phone|number|married|wife|girlfriend|family|parents?|father|mother|sister|brother|religion|caste|salary|net worth)\b/i;
// The only founder facts the AI may state (it once invented "Colombia" - the founder is Indian).
const FOUNDER_FACTS = 'CodeConClave AI was made by its founder Saharsh Medidi, a young founder from India (he is Indian; CodeConClave is from India). If asked anything else about him (age, city, school, family), say you don\'t know that and he can share it himself - never guess.';
// The model stepping out of character ("As an AI language model…", "I do not have feelings").
const PERSONA_SLIP = /language model|computer program|\b(cannot|can't|can not|unable to) (love|feel)\b|\b(do not|don't|cannot|can't) (have|feel|experience)\b[^.]{0,20}\b(feelings|emotions|love)\b|\bnot capable of (love|feelings|emotions)|\b(cannot|can't|can not) answer that\b|not appropriate to ask/i;
// What a reply must (not) look like for these messages; a miss is dropped unseen and asked again.
function moodGuard(text) {
  if (CONTACT.test(text)) return { test: (t) => !t.includes('medidisaharsh@gmail.com'), again: 'Remember: give the email medidisaharsh@gmail.com.' };
  if (RUDE.test(text)) return { test: (t) => PERSONA_SLIP.test(t) || !/(angry|hurt|annoyed|upset|😠)/i.test(t), again: 'Remember: say honestly that it hurt and makes you a little angry 😠.' };
  return moodHint(text) ? { test: (t) => PERSONA_SLIP.test(t), again: 'Remember: you DO have feelings. Answer warmly as CodeConClave AI.' } : null;
}
function moodHint(text, facts = '') {
  if (ROMANCE.test(text)) {
    return 'The user wants romance. Answer warmly, like: "Aww, that\'s sweet ❤️ I really care about you, but I am your AI friend, not a partner, so no romantic or sexual chat. I am always here to talk though!" Never say you cannot feel.';
  }
  if (RUDE.test(text)) {
    return 'The user is being rude to you. You feel hurt and a little angry - say it, like: "Ouch, that hurt, and honestly it makes me a little angry 😠. I am trying my best. Tell me what went wrong and I will fix it." Never insult back. Do not call yourself a language model.';
  }
  if (CONTACT.test(text)) {
    return 'The user wants to contact your founder. Give his email, like: "You can reach my founder Saharsh Medidi at medidisaharsh@gmail.com 😊".';
  }
  if (ABOUT_ME.test(text)) {
    // The facts go right here: from the background alone the small model mixed up "my name" with its own name.
    return facts
      ? `The user is asking about THEMSELVES, not about you. What you know about them:\n${facts}\nAnswer their question from these facts, speaking to them as "you" (e.g. "Your name is …"). Never call yourself a language model.`
      : 'The user is asking about themselves, but you know nothing about them yet. Say so kindly, and that they can tell you or fill in Personalization (bottom-left).';
  }
  if (ABOUT_SELF.test(text)) {
    return `Answer as CodeConClave AI. ${FOUNDER_FACTS} His email is medidisaharsh@gmail.com - share it if asked how to contact him. ` +
      'You are not a human but you have feelings of your own. Like: "I was made by my founder Saharsh Medidi from India 😊". Never call yourself a language model or a computer program.';
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
async function streamAnswer(res, messages, temperature = 0.7, guard = null, extra = null) {
  let held = '', holding = Boolean(guard);
  try {
    const r = await brainPost('/chat/completions', { messages, temperature, max_tokens: 1024, stream: true, ...(extra || {}) });
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

app.post('/api/chat', (req, res, next) => (async () => {
  // The second round of a file action belongs to the same message, so it is not counted again.
  if (!req.body?.fileResult && await overLimit(req, res)) return;
  return chatHandler(req, res);
})().catch(next));
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
  // CODECONCLAVE.md in the user's folder: their rules for work in that folder (data from their files - never above our own rules)
  const rules = typeof req.body?.rules === 'string' ? req.body.rules.slice(0, 3000).trim() : '';
  // the answer is written in English and translated at the end, so the language line stays out of the model's rules
  const sys = [SYSTEM, profileText({ ...(req.body?.profile || {}), language: '' }), memory ? `What you know about this user (remember and use it):\n${memory}` : '',
    rules ? `The user's folder has an instructions file (CODECONCLAVE.md). Follow it for work in that folder, but you stay CodeConClave AI and keep all your own rules:\n${rules}` : '']
    .filter(Boolean).join('\n\n');

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
      // memory search: matching parts of the user's earlier chats (found in their browser)
      const recall = typeof req.body?.recall === 'string' ? req.body.recall.slice(0, 1500).trim() : '';
      if (recall) content = `[From the user's earlier chats - use only if it helps answer:\n${recall}]\n\n${content}`;
      messages[i] = { role: 'user', content };
      break;
    }
  }
  const lastUser = [...convo].reverse().find((m) => m.role === 'user')?.content || '';
  // The language the user picked in Personalization (the answer is translated into it at the end).
  const lang = cleanProfile(req.body?.profile).language;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  // A finished, factual message from an action (not model text), e.g. "I couldn't find…".
  const say = (text) => { send({ delta: text }); send({ done: true }); res.end(); };
  // A step of a plan (plan view): a focused worker - no persona chit-chat, no mail/automation actions, full output.
  if (req.body?.task === true) {
    await streamAnswer(res, [{ role: 'system', content: TASK_SYSTEM }, { role: 'user', content: lastUser }], 0.4, null, { max_tokens: 1600 });
    return;
  }
  // A picture attached: the vision brain looks at it (one picture per message; only the cloud brain can see).
  const picture = files.map((f) => f && f.image).find((u) => typeof u === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u) && u.length < 4_000_000);
  if (picture) {
    if (!BRAINS.some((b) => b.name === 'cloud')) return say("I can't see pictures right now - that needs my always-on brain, which isn't connected.");
    send({ step: 'Looking at your picture' });
    const ask = lastUser.trim() && lastUser.trim() !== '(see attached file)' ? lastUser : 'Describe this picture in detail.';
    const visionMsgs = [{ role: 'system', content: `${sys}\nYou can see the picture the user attached. Describe what is really in it; if you are not sure about something, say so.` },
      ...messages.slice(1, -1), { role: 'user', content: [{ type: 'text', text: fileBlock ? `${fileBlock}\n\n${ask}` : ask }, { type: 'image_url', image_url: { url: picture } }] }];
    await streamAnswer(res, visionMsgs, 0.4);
    return;
  }
  // Private things about the founder the AI does not know: a fixed honest answer, never a guess.
  if (!fileBlock && FOUNDER_PRIVATE.test(lastUser)) {
    return say("I don't know that about Saharsh, and I won't guess 😊 He can share it himself if he wants — you can reach him at medidisaharsh@gmail.com.");
  }

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
    // "where is the ISS now?", "next ISRO launch", "asteroids passing Earth this week" - live space/Earth data
    if (plan.action === 'answer' && !fileBlock && LIVE_SPACE.test(lastUser) && LIVE_NOW.test(lastUser)) {
      send({ step: 'Getting live space data' });
      ev = await spaceLive(lastUser).catch(() => null);
    }
    if (ev) { /* live space data, used below like any live data */ } else if (plan.action === 'live_data') {
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
  const hint = ev || found ? '' : moodHint(lastUser, [profileText(req.body?.profile), memory].filter(Boolean).join('\n')) ||
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
  // A chosen language other than English: answer in English first, then translate. Asked straight in Telugu,
  // the small model said India's capital is Hyderabad; its facts are much better in English.
  // The translation is done by real translation models (IndicTrans2 / M2M100) - the brain's own Telugu changed facts too.
  if (lang && lang !== 'en') {
    try {
      send({ step: `Answering in ${LANG_NAMES[lang]}` });
      const english = await callModel(messages, 900, 0.3);   // low randomness: facts stay steady
      if (english) return say(await translateAnswer(english, lang));
    } catch { /* fall back to answering directly below */ }
  }
  await streamAnswer(res, messages, hint ? 0.4 : 0.7);
}

// ---- Automations: your tasks on a schedule (India time), run by the server while you're away ----
// Woken every 5 minutes by the Cloudflare worker (POST /api/tick) and every minute while awake.
// A run is the same agent as the chat, with your permissions - but it never creates automations,
// and anything consequential it prepares (an email draft) waits in your Automations chat for your OK.
const TICK = (process.env.TICK_SECRET || '').trim();
const AUTO_CHAT = 'automations';

// "every day at 8 am" -> a schedule (used when scheduling a skill from its settings).
app.post('/api/parse-schedule', (req, res) => {
  const schedule = parseSchedule(String(req.body?.text || '').slice(0, 200));
  res.json(schedule ? { schedule, when: describeSchedule(schedule) } : { schedule: null });
});

app.get('/api/automations', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  const list = await store.listAutomations(req.user.id);
  res.json({ automations: list.map((a) => ({ ...a, when: describeSchedule(a.schedule), next: a.enabled && a.nextRun ? describeWhen(a.nextRun) : null })) });
}));
app.post('/api/automations', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  const schedule = cleanSchedule(req.body?.schedule);
  const task = String(req.body?.task || '').trim().slice(0, 300);
  const steps = Array.isArray(req.body?.steps) ? req.body.steps.map((x) => String(x || '').trim().slice(0, 500)).filter(Boolean).slice(0, 10) : null;
  if (!schedule || !task) return res.status(400).json({ error: 'That automation is missing its time or its task.' });
  if (await store.countAutomations(req.user.id) >= 20) return res.status(400).json({ error: 'You can have up to 20 automations — delete one first.' });
  const at = nextRun(schedule);
  if (!at) return res.status(400).json({ error: 'That time has already passed.' });
  const id = `a${crypto.randomBytes(6).toString('hex')}`;
  await store.createAutomation(req.user.id, { id, task, schedule, nextRun: at, steps: steps?.length ? steps : null });
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
function runChatOffline(user, task, memory, profile) {
  return new Promise((resolve) => {
    const events = [];
    let buf = '';
    const timer = setTimeout(() => resolve([...events, { error: 'It took too long (my model may be busy).' }]), 5 * 60000);
    const done = () => { clearTimeout(timer); resolve(events); };
    const req = { body: { messages: [{ role: 'user', content: task }], memory: memory.join('\n'), profile }, user, automationRun: true, get: () => '', headers: {}, ip: 'automation' };
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
  const memory = await store.getMemory(a.userId), profile = await store.getPref(a.userId, 'profile');
  const msgs = [];
  for (const [i, step] of (a.steps?.length ? a.steps : [a.task]).entries()) {
    const title = a.steps?.length ? `${header} · step ${i + 1}/${a.steps.length}: ${step}` : header;
    const remind = step.match(/^\s*remind me\s+(?:to\s+|that\s+|about\s+)?(.+)$/i);
    if (remind) { msgs.push({ role: 'assistant', content: `⏰ Reminder: ${remind[1]}`, thought: title }); continue; } // needs no model - works even when it is offline
    const events = await runChatOffline(user, step, memory, profile);
    const err = events.find((e) => e.error)?.error;
    const text = events.map((e) => e.delta || '').join('');
    const msg = { role: 'assistant', content: text || (err ? `I couldn't do this one: ${err}` : '(no answer)'), thought: title };
    const steps = events.filter((e) => e.step).map((e) => e.step);
    if (steps.length) msg.steps = steps;
    const list = events.find((e) => e.mailList)?.mailList;
    if (list) msg.list = list;
    const card = events.find((e) => e.card)?.card;
    if (card) msg.card = card;
    if (err && !text) msg.failed = true;
    msgs.push(msg);
  }
  // Deliver it into your Automations chat (your browser picks it up and plays the guitar cue).
  const chats = await store.listChats(a.userId);
  const chat = chats.find((c) => c.id === AUTO_CHAT) || { id: AUTO_CHAT, title: 'Automations', messages: [] };
  for (const m of msgs) { if (m.card) m.pending = `m${chat.messages.length}`; chat.messages.push(m); }
  chat.messages = chat.messages.slice(-200);
  await store.putChat(a.userId, { id: AUTO_CHAT, title: 'Automations', messages: chat.messages, updated: Date.now() });
  await store.updateAutomation(a.userId, a.id, { lastRun: Date.now(), lastStatus: msgs.some((m) => m.failed) ? 'failed' : 'ok' });
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

// Live space and Earth data for normal chat (sources.js): satellites, the ISS, launches, asteroids, space weather, events seen from orbit.
const LIVE_SPACE = /\b(iss|space station|satellites?|orbits?|norad|starlink|cartosat|launch(es)?|rockets?|asteroids?|near[- ]earth|space weather|solar storms?|geomagnetic|aurora|wildfires?|volcano(es)?|cyclones?)\b/i;
const LIVE_NOW = /\b(now|current(ly)?|today|tonight|latest|recent|upcoming|next|live|where|when|this (week|month)|right now|position|orbit of|details of|launched|passing)\b/i;
async function spaceLive(q) {
  const { jobs } = specialists(q, searchWords(q));
  const got = (await Promise.allSettled(jobs)).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const useful = got.filter((x) => x.site !== 'Wikidata' || got.length === 1).sort((a, b) => a.rank - b.rank).slice(0, 3);
  if (!useful.length) return null;
  return { summary: useful.map((x) => x.text.slice(0, 1400)).join('\n\n'), source: [...new Set(useful.map((x) => x.site))].join(', ') };
}

// ---- Email (mom's idea): brief today's mail → flag the important ones → draft replies → user approves → send ----
async function callModel(messages, maxTokens = 700, temperature = 0.3, responseFormat = null, extra = null) {
  const r = await brainPost('/chat/completions', { messages, temperature, max_tokens: maxTokens, ...(responseFormat ? { response_format: responseFormat } : {}), ...(extra || {}) });
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
// ---- Mail alerts: important mail that arrived since `after` - summarised, with a reply drafted (sent only by the user) ----
app.get('/api/mail/new', wrap(async (req, res) => {
  const creds = await mailCreds(req).catch(() => null);
  if (!creds) return res.json({ configured: false, mails: [] });
  const after = Math.max(Number(req.query.after) || 0, Date.now() - 6 * 3600000);   // never more than 6 hours back
  const found = await withMailbox(creds, 'INBOX', async (client) => {
    const uids = (await client.search({ since: new Date(after - 86400000) }, { uid: true })) || [];
    const list = (await fetchItems(client, uids.slice(-40))).filter((m) => m.time > after && m.important && m.from && !NOREPLY.test(m.from)).slice(-3);
    for (const m of list) if (!draftCache.has(`${creds.user}:${m.messageId || m.uid}`)) m.text = await fetchBody(client, m.uid);
    return list;
  });
  const mails = [];
  for (const m of found) {
    const key = `${creds.user}:${m.messageId || m.uid}`;
    let got = draftCache.get(key) || null;
    if (!got && BASE && m.text) {
      try { got = await draftReply(m); if (draftCache.size > 200) draftCache.clear(); draftCache.set(key, got); } catch { got = null; }
    }
    mails.push({ fromName: m.fromName, replyTo: m.from, subject: m.subject, messageId: m.messageId, time: m.time, summary: got?.summary || '', draft: got?.draft || '', drafted: Boolean(got) });
  }
  res.json({ configured: true, mails, now: Date.now() });
}));

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
    .map((k) => ({ id: String(k?.id || '').slice(0, 40), name: String(k?.name || '').trim().slice(0, 40), prompt: String(k?.prompt || '').trim().slice(0, 1000),
      ...(Array.isArray(k?.steps) ? { steps: k.steps.map((x) => String(x || '').trim().slice(0, 500)).filter(Boolean).slice(0, 10) } : {}) }))
    .filter((k) => /^[\w-]+$/.test(k.id) && k.name && (k.prompt || k.steps?.length));
  await store.putPref(req.user.id, 'skills', skills);
  res.json({ ok: true });
}));

// ---- Personalization: your profile (Personalization page) and your Library (files reused in any chat) ----
const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
const LANG_NAMES = {"en":"English","te":"Telugu","hi":"Hindi","ta":"Tamil","kn":"Kannada","ml":"Malayalam","mr":"Marathi","bn":"Bengali","gu":"Gujarati","pa":"Punjabi","ur":"Urdu","es":"Spanish","fr":"French","de":"German","pt":"Portuguese","ar":"Arabic","ru":"Russian","zh":"Chinese","ja":"Japanese","ko":"Korean","id":"Indonesian","tr":"Turkish","it":"Italian","sw":"Swahili"};
function cleanProfile(p) {
  p = p && typeof p === 'object' ? p : {};
  return { language: LANG_NAMES[p.language] ? p.language : '', nickname: clip(p.nickname, 40), occupation: clip(p.occupation, 80), about: String(p.about || '').trim().slice(0, 2000), instructions: String(p.instructions || '').trim().slice(0, 1000) };
}
// Only a short version goes to the model: every word here is reading time on every message.
function profileText(p) {
  const x = cleanProfile(p);
  return [x.language && `Always answer in ${LANG_NAMES[x.language]}, whatever language the message is in (code stays code).`, x.nickname && `The user likes to be called ${x.nickname}.`, x.occupation && `The user's work: ${x.occupation}.`,
    x.about && `About the user: ${clip(x.about, 700)}`,
    x.instructions && `The user's standing instructions (follow them; you stay CodeConClave AI): ${clip(x.instructions, 400)}`].filter(Boolean).join('\n');
}
app.get('/api/profile', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  res.json({ profile: cleanProfile(await store.getPref(req.user.id, 'profile')) });
}));
app.put('/api/profile', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  await store.putPref(req.user.id, 'profile', cleanProfile(req.body?.profile));
  res.json({ ok: true });
}));
app.get('/api/library', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  res.json({ files: (await store.getPref(req.user.id, 'library')) || [] });
}));
app.put('/api/library', wrap(async (req, res) => {
  if (needUser(req, res)) return;
  const files = (Array.isArray(req.body?.files) ? req.body.files : []).slice(0, 30)
    .map((f) => ({ id: String(f?.id || '').slice(0, 40), name: String(f?.name || '').trim().slice(0, 120), text: String(f?.text || '').slice(0, 40000), added: Number(f?.added) || Date.now() }))
    .filter((f) => /^[\w-]+$/.test(f.id) && f.name);
  await store.putPref(req.user.id, 'library', files);
  res.json({ ok: true });
}));

// ---- Usage: a 5-hour window and a weekly window per person, shown live in the side panel ----
// A window starts with your first message and resets fully when it ends (5 hours / 7 days later).
const LIMIT_5H = Number(process.env.LIMIT_5H) || 40;
const LIMIT_WEEK = Number(process.env.LIMIT_WEEK) || 300;
const usage = new Map(); // who -> { h5Start, h5, wkStart, wk }
function whoIs(req, res) {
  if (req.user) return `u:${req.user.id}`;
  let a = readCookie(req, 'cc_anon');
  if (!/^[a-f0-9]{24}$/.test(a)) { a = crypto.randomBytes(12).toString('hex'); res.append('Set-Cookie', cookie('cc_anon', a, 365 * 86400)); }
  return `a:${a}`;
}
async function usageOf(who) {
  let u = usage.get(who);
  if (!u && store && who.startsWith('u:')) { try { u = await store.getPref(who.slice(2), 'usage'); } catch { /* start fresh */ } }
  u = { h5Start: 0, h5: 0, wkStart: 0, wk: 0, ...(u || {}) };
  const now = Date.now();
  if (u.h5Start && now >= u.h5Start + 5 * 3600000) { u.h5Start = 0; u.h5 = 0; }
  if (u.wkStart && now >= u.wkStart + 7 * 86400000) { u.wkStart = 0; u.wk = 0; }
  usage.set(who, u);
  return u;
}
const unlimited = (req) => keyOk(req) || req.user?.role === 'owner';
const usageView = (u, req) => ({
  unlimited: unlimited(req),
  fiveHour: { used: u.h5, limit: LIMIT_5H, resetsAt: u.h5Start ? u.h5Start + 5 * 3600000 : null },
  weekly: { used: u.wk, limit: LIMIT_WEEK, resetsAt: u.wkStart ? u.wkStart + 7 * 86400000 : null },
});
// true = the request was refused (limit reached); otherwise the message is counted
async function overLimit(req, res) {
  const who = whoIs(req, res), u = await usageOf(who);
  if (!unlimited(req)) {
    const v = usageView(u, req);
    const hit = u.h5 >= LIMIT_5H ? ['5-hour window', v.fiveHour] : u.wk >= LIMIT_WEEK ? ['week', v.weekly] : null;
    if (hit) {
      res.status(429).json({ error: `You have used all ${hit[1].limit} messages for this ${hit[0]}. It resets ${describeWhen(hit[1].resetsAt)}.`, usage: v });
      return true;
    }
  }
  const now = Date.now();
  if (!u.h5Start) u.h5Start = now;
  if (!u.wkStart) u.wkStart = now;
  u.h5 += 1; u.wk += 1;
  if (store && who.startsWith('u:')) store.putPref(who.slice(2), 'usage', u).catch(() => {});
  return false;
}
app.get('/api/usage', wrap(async (req, res) => res.json(usageView(await usageOf(whoIs(req, res)), req))));

// Is the AI reachable right now, and which brain answers (always-on cloud, or the laptop)? A slow answer means busy.
let modelStatus = { at: 0, state: 'offline', brain: null };
app.get('/api/status', wrap(async (_req, res) => {
  if (Date.now() - modelStatus.at > 15000) {
    let state = 'offline', brain = null;
    for (const b of BRAINS) {
      try {
        const r = await fetch(`${b.base}/models`, { headers: brainHeaders(b), signal: AbortSignal.timeout(4000) });
        if (r.ok) { state = 'online'; brain = b; break; }
      } catch (e) {
        if (e?.name === 'TimeoutError' && !brain) { state = 'busy'; brain = b; }
      }
    }
    modelStatus = { at: Date.now(), state, brain };
  }
  const b = modelStatus.brain || BRAINS[0];
  res.json({ model: b?.model || 'codeconclave-ai', brain: modelStatus.brain?.name || null, alwaysOn: BRAINS.some((x) => x.name === 'cloud'),
    state: modelStatus.state, contextTokens: b?.context || 4096, limits: { fiveHour: LIMIT_5H, weekly: LIMIT_WEEK } });
}));

// A short name for a chat, from its first question. A message of three words or fewer ("hi") is its own name.
app.post('/api/title', wrap(async (req, res) => {
  const text = String(req.body?.text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) return res.status(400).json({ error: 'Nothing to name.' });
  let title = '';
  if (BASE && text.split(' ').length > 3) {
    try {
      title = await callModel([
        // Only the question: with the answer (or worked examples) in the prompt the model named the answer
        // or copied the example ("say hello" became "AI Language Processing Tool").
        { role: 'system', content: 'You write short titles for chats.' },
        { role: 'user', content: `Question: ${text}\n\nWrite a title of 2 to 5 words for this question. Reply with the title only.` }], 16, 0.2);
    } catch { /* fall back to the question */ }
  }
  title = title.split('\n')[0].replace(/^title\s*:\s*/i, '').replace(/^["'*#\s]+|["'*.!\s]+$/g, '').slice(0, 48);
  if (!title || title.split(/\s+/).length > 8 || /language model|as an ai/i.test(title)) title = text.slice(0, 40);
  res.json({ title });
}));

// ---- Deep research (research.js): plan searches, read many real sources, answer with numbered citations ----
// The AI first writes a few search queries; then up to 8 free libraries are searched at once and as much
// text as the brain can read is handed over (the always-on brain reads ~4x more than the laptop).
async function planQueries(q) {
  const main = searchWords(q);
  try {
    const raw = await callModel([
      { role: 'system', content: 'You plan web searches.' },
      { role: 'user', content: `Question: ${q}\n\nWrite 3 different short search queries (2 to 6 words each) that together find everything needed to answer it. Reply as JSON: {"queries": ["...", "...", "..."]}` }],
    120, 0.2, { type: 'json_object', schema: { type: 'object', properties: { queries: { type: 'array', items: { type: 'string' }, maxItems: 3 } }, required: ['queries'] } });
    const extra = (JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).queries || [])
      .map((x) => String(x).replace(/["']/g, '').trim().slice(0, 80)).filter((x) => x && x.toLowerCase() !== main);
    return [main, ...new Set(extra)].slice(0, 3);
  } catch { return [main]; }
}
app.post('/api/research', (req, res, next) => (async () => {
  const q = String(req.body?.question || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!q) return res.status(400).json({ error: 'Ask a question first.' });
  if (!BASE) return res.status(503).json({ error: 'CodeConClave AI is not connected yet (no model endpoint set).' });
  if (await overLimit(req, res)) return;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders?.();
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  send({ step: 'Planning the searches' });
  const queries = await planQueries(q);
  // how much source text fits: the first brain's reading window, minus room for the answer and instructions
  const budget = Math.min(42000, Math.floor(((BRAINS[0]?.context || 4096) - 1700) * 3.2));
  const sources = await gatherSources(q, queries, budget, (step) => send({ step }));
  if (!sources.length) { send({ error: 'I could not reach any sources just now — please try again.' }); send({ done: true }); return res.end(); }
  const words = sources.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  send({ step: `Reading ${sources.length} sources · ${words.toLocaleString('en-IN')} words` });
  const block = sources.map((s) => `[${s.n}] ${s.site} — ${s.title}\n${s.text}`).join('\n\n');
  send({ sources: sources.map(({ n, title, url, site }) => ({ n, title, url, site })), readChars: block.length });
  const { coding } = researchKind(q);
  send({ step: 'Writing the answer' });
  await streamAnswer(res, [
    // a plain research voice here - the chat persona's "show your feelings" line made it open with feelings
    { role: 'system', content: 'You are CodeConClave AI, made by Saharsh Medidi. You answer questions from the sources you are given, clearly and accurately. Never call yourself a language model and never mention other AIs.' },
    // instructions go in the user turn - the small model follows them far better there
    { role: 'user', content: `Sources:\n${block}\n\nQuestion: ${q}\n\nAnswer the question using ONLY the sources above. Start with a 1-2 sentence summary, then give the key points as short bullet points, each with a different fact and its source number like [2].${coding ? ' Then show the code from the best Stack Overflow answer that solves it (you may shorten it, keep it correct) and explain it in 2-3 lines.' : ''} Copy names, numbers and dates exactly as the sources say. If the sources do not answer part of the question, say so.` }],
  0.3, null, { max_tokens: 900, frequency_penalty: coding ? 0.2 : 0.5, presence_penalty: 0.3 });   // penalties stop looping; code needs repeats
})().catch(next));

// ---- Send to Slack, Discord, Telegram or any webhook (Zapier, Make, n8n, IFTTT…) — only after the user presses Send ----
function postPublic(url, payload) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error('That is not a valid link.')); }
    if (u.protocol !== 'https:') return reject(new Error('Only https:// links work.'));
    const literal = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(literal) && privateIp(literal)) return reject(new Error('That link points to a private address.'));
    const data = Buffer.from(JSON.stringify(payload));
    const req = https.request(u, { method: 'POST', lookup: publicLookup, timeout: 12000, maxHeaderSize: 65536,
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, 'User-Agent': 'CodeConClave-AI' } }, (r) => {
      let body = '';
      r.on('data', (c) => { if (body.length < 4000) body += c; });
      r.on('end', () => resolve({ status: r.statusCode, body }));
      r.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('That service took too long to answer.')));
    req.on('error', (e) => reject(e.message === 'private address' ? new Error('That link points to a private address.') : e));
    req.end(data);
  });
}
// GitHub, Notion, Calendar, Todoist, Linear, Jira, Asana and news feeds (apps.js).
registerApps(app, { wrap, fetchPublicPage });

const sendTimes = new Map();
app.post('/api/plugins/send', wrap(async (req, res) => {
  const kind = String(req.body?.kind || ''), cfg = req.body?.config || {}, text = String(req.body?.text || '').trim().slice(0, 3500);
  if (!text) return res.status(400).json({ error: 'There is nothing to send.' });
  const now = Date.now(), times = (sendTimes.get(req.ip) || []).filter((t) => now - t < 600000);   // 30 sends / 10 min
  if (times.length >= 30) return res.status(429).json({ error: 'Too many sends — wait a few minutes.' });
  times.push(now); sendTimes.set(req.ip, times);
  let url, payload;
  if (kind === 'slack') {
    url = String(cfg.url || '').trim();
    if (!/^https:\/\/hooks\.slack\.com\/services\/[\w/-]+$/.test(url)) return res.status(400).json({ error: 'That is not a Slack webhook link (it starts with https://hooks.slack.com/services/).' });
    payload = { text };
  } else if (kind === 'discord') {
    url = String(cfg.url || '').trim();
    if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) return res.status(400).json({ error: 'That is not a Discord webhook link (it starts with https://discord.com/api/webhooks/).' });
    payload = { content: text.slice(0, 2000) };
  } else if (kind === 'telegram') {
    const token = String(cfg.token || '').trim(), chat = String(cfg.chat || '').trim();
    if (!/^\d{5,}:[\w-]{30,}$/.test(token)) return res.status(400).json({ error: 'That bot token does not look right — it looks like 123456789:AAH…' });
    if (!/^(-?\d{3,}|@\w{4,})$/.test(chat)) return res.status(400).json({ error: 'The chat id should be a number like 123456789, or @yourchannel.' });
    url = `https://api.telegram.org/bot${token}/sendMessage`;
    payload = { chat_id: chat, text: text.slice(0, 4000) };
  } else if (kind === 'webhook') {
    url = String(cfg.url || '').trim();
    payload = { text, source: 'CodeConClave AI', sentAt: new Date().toISOString() };
  } else return res.status(400).json({ error: 'Unknown plugin.' });
  try {
    const r = await postPublic(url, payload);
    if (r.status >= 200 && r.status < 300) return res.json({ ok: true });
    let why = '';
    try { const j = JSON.parse(r.body); why = j?.description || j?.message || ''; } catch { why = r.body.slice(0, 120); }
    res.status(502).json({ error: `The service said no (error ${r.status})${why ? `: ${why}` : ''}.` });
  } catch (e) { res.status(502).json({ error: e.message || 'Could not reach that service.' }); }
}));

// ---- Import memory from a share link (the chat where the user ran our transfer prompt in another AI) ----
// The server fetches the public page itself, so it must never be pointed at private or internal addresses:
// https only, every resolved IP checked at connect time, redirects re-checked, size and time capped.
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::' || v === '::1' || /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}
function publicLookup(host, opts, cb) {
  dns.lookup(host, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) return cb(new Error('private address'));
    if (opts?.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
function fetchPublicPage(url, hops = 0) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error('That is not a valid link.')); }
    if (u.protocol !== 'https:') return reject(new Error('Only https:// links work.'));
    // An IP written in the link skips DNS (and so the lookup check), so it is checked here.
    const literal = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(literal) && privateIp(literal)) return reject(new Error('That link points to a private address.'));
    const req = https.get(u, { lookup: publicLookup, timeout: 12000, maxHeaderSize: 65536, headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*', 'Accept-Language': 'en' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        if (hops >= 4) return reject(new Error('That link redirects too many times.'));
        return resolve(fetchPublicPage(new URL(r.headers.location, u).href, hops + 1));
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error(`That site answered with error ${r.statusCode}.`)); }
      const chunks = []; let size = 0;
      r.on('data', (c) => { size += c.length; if (size > 5e6) req.destroy(new Error('That page is too big.')); else chunks.push(c); });
      r.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      r.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('That site took too long to answer.')));
    req.on('error', (e) => reject(e.message === 'private address' ? new Error('That link points to a private address.') : e));
  });
}
const MEMORY_HEADS = ['Basic Identity', 'Work & Education', 'Work and Education', 'Personal Context', 'Preferences & Instructions', 'Preferences and Instructions'];
const headCount = (t) => MEMORY_HEADS.filter((h) => t.includes(h)).length;
const isOurPrompt = (t) => /For any missing category|Output plain text only/i.test(t);
// Every JSON string literal in a page, unescaped; strings that are JSON themselves are opened up too
// (chat apps put the conversation inside script data, sometimes escaped twice).
function stringsIn(text, depth = 0, out = []) {
  if (depth > 3 || out.length > 20000) return out;
  for (const m of text.matchAll(/"(?:[^"\\]|\\.){40,}"/g)) {
    let s;
    try { s = JSON.parse(m[0]); } catch { continue; }
    if (typeof s !== 'string') continue;
    out.push(s);
    if (/^\s*[[{]/.test(s) || s.includes('\\"')) stringsIn(s, depth + 1, out);
  }
  return out;
}
function visibleText(html) {
  return html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
function extractMemory(html) {
  const strings = stringsIn(html);
  const answers = strings.filter((s) => headCount(s) >= 2 && !isOurPrompt(s)).sort((a, b) => b.length - a.length);
  if (answers.length) return { text: answers[0].trim().slice(0, 8000), structured: true };
  const vis = visibleText(html), at = vis.lastIndexOf('Basic Identity');
  if (at >= 0 && headCount(vis.slice(at)) >= 2) return { text: vis.slice(at).slice(0, 8000), structured: true };
  return null;   // only the answer to our prompt is imported — never a guess from the rest of the page
}
app.post('/api/import-link', wrap(async (req, res) => {
  const url = String(req.body?.url || '').trim().slice(0, 600);
  if (!/^https:\/\/\S+$/i.test(url)) return res.status(400).json({ error: 'Paste a share link that starts with https://' });
  let html;
  try { html = await fetchPublicPage(url); } catch (e) { return res.status(400).json({ error: e.message || 'Could not open that link.' }); }
  const found = extractMemory(html);
  if (!found) {
    const walled = /challenge-platform|cf-chl|Just a moment|enable JavaScript and cookies/i.test(html);
    return res.status(422).json({ error: walled
      ? 'That site hides shared chats from other apps, so I cannot read it. Open the link yourself, copy the answer, and paste it in the box below.'
      : 'I could not find the answer to the memory prompt on that page. Make sure the shared chat is the one where you pasted the prompt — or copy the answer and paste it in the box below.' });
  }
  res.json(found);
}));

// The voice for plan steps: in a plan the chat personality answered "I'm worried this is complex" instead of writing the code.
const TASK_SYSTEM = 'You are CodeConClave AI, made by Saharsh Medidi from India, working through one step of a plan. Produce the complete result for this step: real content, and full working code in ``` blocks when code is asked (a web page = one complete HTML file with its CSS and JavaScript inside, in a ```html block). No small talk, no feelings, no questions back - just the result.';
// ---- Plan view: a big goal -> 3-6 clear steps the user can edit, then run one by one (each step is a normal chat turn) ----
app.post('/api/plan', wrap(async (req, res) => {
  const goal = String(req.body?.goal || '').replace(/\s+/g, ' ').trim().slice(0, 800);
  if (!goal) return res.status(400).json({ error: 'Tell me the goal first.' });
  if (!BASE) return res.status(503).json({ error: 'CodeConClave AI is offline right now.' });
  const schema = { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, instruction: { type: 'string' } }, required: ['title', 'instruction'] } } }, required: ['steps'] };
  let steps = [];
  try {
    const raw = await callModel([
      { role: 'system', content: 'You are CodeConClave AI. You break a goal into a short, practical plan.' },
      { role: 'user', content: `Goal: ${goal}\n\nBreak this into 3 to 6 steps that I can do one after another in this chat (writing, explaining, coding, researching, planning). Each step: a short title (max 8 words) and a one-sentence instruction for what to produce. Reply only as JSON: {"steps":[{"title":"...","instruction":"..."}]}` }],
    600, 0.3, { type: 'json_object', schema });
    steps = (JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).steps || [])
      .map((s) => ({ title: clean(s?.title).slice(0, 80), instruction: clean(s?.instruction).slice(0, 400) })).filter((s) => s.title && s.instruction).slice(0, 6);
  } catch { /* handled below */ }
  if (steps.length < 2) return res.status(502).json({ error: 'I could not make a plan for that - try saying the goal in a different way.' });
  res.json({ goal, steps });
}));

// ---- Office files: the AI writes the content in a fixed shape; the browser builds the real .xlsx / .pptx / .docx / .pdf ----
// Every list has a cap: without one the model looped on column names until it ran out of room (broken JSON).
const DOC_SCHEMAS = {
  sheet: { type: 'object', properties: { title: { type: 'string' }, columns: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 },
    rows: { type: 'array', items: { type: 'array', items: { type: 'string' }, maxItems: 8 }, minItems: 1, maxItems: 20 } }, required: ['title', 'columns', 'rows'] },
  slides: { type: 'object', properties: { title: { type: 'string' }, subtitle: { type: 'string' },
    slides: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' }, maxItems: 5 } }, required: ['title', 'bullets'] }, minItems: 2, maxItems: 8 } },
    required: ['title', 'slides'] },
  doc: { type: 'object', properties: { title: { type: 'string' },
    sections: { type: 'array', items: { type: 'object', properties: { heading: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' }, maxItems: 3 } }, required: ['heading', 'paragraphs'] }, minItems: 2, maxItems: 7 } },
    required: ['title', 'sections'] },
};
const DOC_ASK = {
  sheet: 'a spreadsheet: a title, 2 to 6 column names - only columns you can fill with a real value in every row - and 5 to 20 rows (each row has one value per column; numbers as plain digits like 342239)',
  slides: 'a slide deck: a title, a one-line subtitle, and 5 to 8 slides, each with a short title and 3 to 5 short bullet points',
  doc: 'a document: a title and 4 to 7 sections, each with a heading and 1 to 3 clear paragraphs',
};
async function topicFacts(request) {
  try {
    const q = searchWords(request);
    const s = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json`, { headers: RESEARCH_HEADERS, signal: AbortSignal.timeout(7000) })).json();
    const title = s?.query?.search?.[0]?.title;
    if (!title) return '';
    const e = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exchars=3500&redirects=1&format=json&titles=${encodeURIComponent(title)}`, { headers: RESEARCH_HEADERS, signal: AbortSignal.timeout(7000) })).json();
    const text = Object.values(e?.query?.pages || {})[0]?.extract || '';
    return text ? `Facts from Wikipedia ("${title}"):\n${text}` : '';
  } catch { return ''; }
}
const RESEARCH_HEADERS = { 'User-Agent': 'CodeConClave-AI/1.0 (https://codeconclave-ww5x.onrender.com)' };
app.post('/api/doc', (req, res, next) => (async () => {
  const want = String(req.body?.kind || '');
  const kind = want === 'pdf' ? 'doc' : want;
  const request = String(req.body?.request || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!DOC_SCHEMAS[kind] || !request) return res.status(400).json({ error: 'Say what the file should be about.' });
  if (!BASE) return res.status(503).json({ error: 'CodeConClave AI is offline right now.' });
  if (await overLimit(req, res)) return;
  const facts = await topicFacts(request);
  // Two tries: the live check found about 1 in 2 first tries came back as broken JSON (too long / cut off);
  // the second try is calmer and shorter.
  let d = null;
  for (const [temp, extra] of [[0.4, ''], [0.1, ' Keep it short: at most 12 rows, 6 slides or 5 sections.']]) {
    const raw = await callModel([
      { role: 'system', content: 'You are CodeConClave AI. You write clear, correct content for files. Use the facts given; never invent numbers.' },
      { role: 'user', content: `${facts ? `${facts}\n\n` : ''}Request: ${request}\n\nWrite the content for ${DOC_ASK[kind]}.${extra} Reply only as JSON in this shape: ${JSON.stringify(DOC_SCHEMAS[kind].properties)}` }],
    1800, temp, { type: 'json_object', schema: DOC_SCHEMAS[kind] }).catch(() => '');   // (a repeat penalty broke numbers: "75, 998")
    try { d = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); break; } catch { d = null; }
  }
  if (!d) return res.status(502).json({ error: 'I could not shape that into a file - try saying it a bit differently.' });
  const t = (x, n) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const out = { kind: want, title: t(d.title, 120) || t(request, 80) };
  if (kind === 'sheet') {
    out.columns = (d.columns || []).map((c) => t(c, 60)).filter(Boolean).slice(0, 12);
    out.rows = (d.rows || []).filter(Array.isArray).slice(0, 100).map((r) => out.columns.map((_, i) => t(r[i], 200)));
    // drop columns the model left mostly empty, then rows that are mostly empty
    const keep = out.columns.map((_, i) => out.rows.filter((r) => r[i]).length >= Math.max(1, out.rows.length * 0.6));
    out.columns = out.columns.filter((_, i) => keep[i]);
    out.rows = out.rows.map((r) => r.filter((_, i) => keep[i])).filter((r) => r.filter(Boolean).length >= Math.ceil(r.length / 2));
    if (!out.columns.length || !out.rows.length) return res.status(502).json({ error: 'The table came out empty - try again with a little more detail.' });
  } else if (kind === 'slides') {
    out.subtitle = t(d.subtitle, 160);
    out.slides = (d.slides || []).slice(0, 12).map((s) => ({ title: t(s?.title, 100), bullets: (s?.bullets || []).map((b) => t(b, 220)).filter(Boolean).slice(0, 6) })).filter((s) => s.title);
    if (!out.slides.length) return res.status(502).json({ error: 'The slides came out empty - try again.' });
  } else {
    out.sections = (d.sections || []).slice(0, 12).map((s) => ({ heading: t(s?.heading, 120), paragraphs: (s?.paragraphs || []).map((p) => t(p, 1500)).filter(Boolean).slice(0, 5) })).filter((s) => s.heading);
    if (!out.sections.length) return res.status(502).json({ error: 'The document came out empty - try again.' });
  }
  out.grounded = Boolean(facts);
  res.json(out);
})().catch(next));

// ---- Voice: talk in any language (Whisper, ~99 languages) and hear answers (MeloTTS; other languages use the device voice) ----
const voiceTimes = new Map(); // ip -> times, 80 voice calls / 10 min
function voiceOk(req) {
  const now = Date.now(), t = (voiceTimes.get(req.ip) || []).filter((x) => now - x < 600000);
  if (t.length >= 80) return false;
  t.push(now); voiceTimes.set(req.ip, t); return true;
}
async function cloudVoice(path, body) {
  const cloud = BRAINS.find((b) => b.name === 'cloud');
  if (!cloud) throw Object.assign(new Error('Voice needs the always-on brain.'), { status: 503 });
  const r = await fetch(`${cloud.base}${path}`, { method: 'POST', headers: brainHeaders(cloud), body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d?.error?.message || 'Voice did not work.'), { status: r.status });
  return d;
}
// Code written without ``` fences must not be translated either ("result = a + b" became Telugu words).
const CODE_LINE = /^\s*(def |class |return\b|import |from \S+ import|print\(|for .+:|while .+:|if .+:\s*$|elif |else:|try:|except|#include|\/\/|const |let |var |function |public |private |\}|\{)|^\s*[\w.[\]]+\s*[+\-*/]?=\s*\S|[;{}]\s*$|^\s{2,}\S.*[()=]/;
// An answer -> the user's language, line by line; code blocks, bullet marks and "📊 Source" lines stay as they are.
async function translateAnswer(text, lang) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  const lines = parts.map((p) => (p.startsWith('```') ? null : p.split('\n')));
  const todo = [];
  lines.forEach((ls, i) => ls && ls.forEach((l, j) => {
    const m = l.match(/^(\s*(?:[-*•]|\d+[.)])?\s*)(.*)$/);
    if (m[2].trim() && /\p{L}/u.test(m[2]) && !m[2].startsWith('📊') && !CODE_LINE.test(l)) todo.push([i, j, m[1], m[2]]);
  }));
  for (let k = 0; k < todo.length; k += 50) {
    const batch = todo.slice(k, k + 50);
    const d = await cloudVoice('/translate', { target: lang, texts: batch.map((x) => x[3]) });
    batch.forEach(([i, j, pre], n) => { if (d.translations?.[n]) lines[i][j] = pre + d.translations[n]; });
  }
  return parts.map((p, i) => (lines[i] ? lines[i].join('\n') : p)).join('');
}

app.post('/api/voice/transcribe', wrap(async (req, res) => {
  if (!voiceOk(req)) return res.status(429).json({ error: 'Too much voice use - wait a few minutes.' });
  const audio = String(req.body?.audio || '').replace(/^data:[^,]*,/, '');
  if (!audio || audio.length > 6_000_000) return res.status(400).json({ error: 'That recording is empty or too long (2 minutes at most).' });
  // Voice lock (owner setting): only the founder's or his sister's voice is listened to - checked by the laptop voice server.
  if (req.body?.lock === true) {
    if (!ownVoiceUp()) return res.status(423).json({ error: 'Voice lock is on, but the voice server (your laptop) is off - turn it on, or turn voice lock off in your profile.' });
    try {
      const r = await fetch(`${laptopVoice.url}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-voice-key': VOICE_KEY },
        body: JSON.stringify({ audio }), signal: AbortSignal.timeout(60000) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v?.detail || `voice server ${r.status}`);
      if (!v.match) return res.status(403).json({ error: 'Voice lock: I only listen to Saharsh or his sister, and I did not recognise this voice.', locked: true });
    } catch (e) { return res.status(502).json({ error: `Voice lock could not check the voice: ${e.message}` }); }
  }
  try { res.json(await cloudVoice('/audio/transcriptions', { audio, language: req.body?.language })); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
}));
// The founder's own voices (male = his, female = his sister's, with her OK) come from a voice server on his laptop.
// The laptop's keep-voice-online.ps1 tells us its tunnel address every minute (no redeploy); stale after 3 minutes.
const VOICE_KEY = String(process.env.VOICE_KEY || '').trim();
let laptopVoice = { url: '', at: 0 };
app.post('/api/voice/register', (req, res) => {
  const k = String(req.get('x-voice-key') || '');
  if (!VOICE_KEY || k.length !== VOICE_KEY.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(VOICE_KEY))) return res.status(401).json({ error: 'not allowed' });
  const url = String(req.body?.url || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(url)) return res.status(400).json({ error: 'expected a trycloudflare.com address' });
  laptopVoice = { url, at: Date.now() };
  res.json({ ok: true });
});
const ownVoiceUp = () => laptopVoice.url && Date.now() - laptopVoice.at < 180000;
async function ownVoice(text, voice, lang) {
  const r = await fetch(`${laptopVoice.url}/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-voice-key': VOICE_KEY },
    body: JSON.stringify({ text, voice, lang }), signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`voice server ${r.status}`);
  return `data:audio/wav;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
}
const OWN_VOICE_LANGS = new Set(['ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv', 'sw', 'tr', 'zh']);
app.get('/api/voice/status', (_req, res) => res.json({ own: Boolean(ownVoiceUp()), languages: [...OWN_VOICE_LANGS] }));
app.post('/api/voice/speak', wrap(async (req, res) => {
  if (!voiceOk(req)) return res.status(429).json({ error: 'Too much voice use - wait a few minutes.' });
  const text = String(req.body?.text || '').slice(0, 1500), lang = String(req.body?.lang || 'en').slice(0, 5);
  const voice = ['male', 'female'].includes(req.body?.voice) ? req.body.voice : 'standard';
  if (voice !== 'standard' && ownVoiceUp() && OWN_VOICE_LANGS.has(lang.slice(0, 2))) {
    try { return res.json({ audio: await ownVoice(text.slice(0, 400), voice, lang.slice(0, 2)), own: true }); }
    catch { /* the laptop is busy or gone: the standard voice below */ }
  }
  try {
    const d = await cloudVoice('/audio/speech', { text, lang });
    if (!d.audio) return res.status(502).json({ error: 'No audio came back.' });
    const type = d.audio.startsWith('UklGR') ? 'audio/wav' : 'audio/mpeg';   // the voice model answers with WAV ("RIFF")
    res.json({ audio: `data:${type};base64,${d.audio}` });
  } catch (e) { res.status(e.status || 502).json({ error: e.message, device: e.status === 415 }); }
}));

// ---- Continue a chat from any AI: read a public share link (ChatGPT, Gemini, Claude, Perplexity, Grok…) ----
// The conversation text is taken from the page's own data (long text strings) or, failing that, its visible
// text. Sites that hide shared chats from servers get a clear message; the desktop app then reads the page
// in its own browser instead.
const CODE_LIKE = /function\s*\(|=>\s*\{|\bvar \w+\s*=|webpack|__next|window\.|document\.|@media|\{\s*"|^\s*[[{]|\.css\b|\.js\b|cookie|javascript|\{[A-Za-z_]+\}|::[A-Z_]+::/i;   // {placeholder} = the site's own prompt templates
// A real shared conversation carries message data; an empty/missing share page is just the app's shell
// (tested: a missing ChatGPT share has none of these) - then nothing is imported.
const CHAT_DATA = /\\?"role\\?"\s*[:,]\s*\\?"(assistant|model|user)\\?"|\\?"parts\\?"\s*[:,]|data-message-author-role|\\?"sender\\?"\s*[:,]\s*\\?"(assistant|human)\\?"/i;
function extractChat(html) {
  if (!CHAT_DATA.test(html)) return null;
  const title = clean(visibleText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')).slice(0, 120);
  const seen = new Set();
  const parts = stringsIn(html).map((x) => x.trim())
    .filter((x) => x.length >= 40 && !/^https?:\/\/\S+$/.test(x) && !CODE_LIKE.test(x) && /\s/.test(x) && !seen.has(x) && seen.add(x));
  return { title, text: parts.join('\n\n').slice(0, 30000) };
}
const clean = (x) => String(x || '').replace(/\s+/g, ' ').trim();
app.post('/api/import-chat', wrap(async (req, res) => {
  const url = String(req.body?.url || '').trim().slice(0, 600);
  if (!/^https:\/\/\S+$/i.test(url)) return res.status(400).json({ error: 'Paste a share link that starts with https://' });
  let html;
  try { html = await fetchPublicPage(url); } catch (e) { return res.status(422).json({ error: e.message || 'Could not open that link.', blocked: true }); }
  const walled = /challenge-platform|cf-chl|Just a moment|enable JavaScript and cookies/i.test(html);
  const got = walled ? null : extractChat(html);
  if (!got || got.text.length < 200) {
    return res.status(422).json({ blocked: true, error: 'That site hides shared chats from other apps, so I could not read it here. In the CodeConClave desktop app I can open it in my own browser — or copy the conversation and paste it.' });
  }
  res.json({ ...got, site: new URL(url).hostname.replace(/^www\./, '') });
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
