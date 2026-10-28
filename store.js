// Accounts storage. Two backends with the same functions:
//  - Neon Postgres when DATABASE_URL is set (the live site),
//  - plain local JSON files in ./data otherwise (running on your own PC - "local files too").
// Every read and write is scoped to one user id, so people's data never mixes.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ---- passwords (scrypt) and stored keys (AES-256-GCM) ----
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(password, Buffer.from(salt, 'base64'), want.length);
  return crypto.timingSafeEqual(got, want);
}
// Sessions: the browser keeps a random token; only its SHA-256 is stored.
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const tokenHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

let dataKey = null; // 32 bytes, from DATA_KEY (live) or ./data/.key (local)
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}
export function decrypt(blob) {
  const [v, iv, tag, enc] = String(blob || '').split('.');
  if (v !== 'v1') throw new Error('unknown secret format');
  const d = crypto.createDecipheriv('aes-256-gcm', dataKey, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

const userOut = (u) => u && { id: String(u.id), email: u.email, name: u.name, role: u.role, google: Boolean(u.google_sub) };

// ---- Neon Postgres ----
async function pgStore(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 5, ssl: { rejectUnauthorized: true } });
  const q = (text, params) => pool.query(text, params);
  await q(`
    create table if not exists users (
      id bigserial primary key,
      email text unique not null,
      name text not null default '',
      pass_hash text,
      google_sub text unique,
      role text not null default 'user',
      created_at timestamptz not null default now());
    create table if not exists sessions (
      token_hash text primary key,
      user_id bigint not null references users(id) on delete cascade,
      expires_at timestamptz not null);
    create table if not exists chats (
      user_id bigint not null references users(id) on delete cascade,
      id text not null,
      title text not null default 'New chat',
      messages jsonb not null default '[]',
      updated bigint not null default 0,
      primary key (user_id, id));
    create table if not exists memories (
      user_id bigint primary key references users(id) on delete cascade,
      items jsonb not null default '[]');
    create table if not exists secrets (
      user_id bigint not null references users(id) on delete cascade,
      name text not null,
      value_enc text not null,
      primary key (user_id, name));`);
  const one = async (text, params) => (await q(text, params)).rows[0] || null;
  return {
    kind: 'neon',
    async createUser({ email, name, passHash = null, googleSub = null, role = 'user' }) {
      return userOut(await one('insert into users (email, name, pass_hash, google_sub, role) values ($1,$2,$3,$4,$5) returning *', [email, name, passHash, googleSub, role]));
    },
    async userByEmail(email) { const u = await one('select * from users where email = $1', [email]); return u && { ...userOut(u), passHash: u.pass_hash }; },
    async userByGoogle(sub) { return userOut(await one('select * from users where google_sub = $1', [sub])); },
    async linkGoogle(id, sub) { await q('update users set google_sub = $2 where id = $1', [id, sub]); },
    async setRole(id, role) { await q('update users set role = $2 where id = $1', [id, role]); },
    async createSession(hash, userId, expires) { await q('insert into sessions values ($1,$2,$3)', [hash, userId, new Date(expires)]); },
    async sessionUser(hash) {
      return userOut(await one('select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()', [hash]));
    },
    async deleteSession(hash) { await q('delete from sessions where token_hash = $1', [hash]); },
    async listChats(userId) {
      return (await q('select id, title, messages, updated from chats where user_id = $1 order by updated desc limit 200', [userId])).rows
        .map((r) => ({ id: r.id, title: r.title, messages: r.messages, updated: Number(r.updated) }));
    },
    async putChat(userId, c) {
      await q(`insert into chats (user_id, id, title, messages, updated) values ($1,$2,$3,$4,$5)
               on conflict (user_id, id) do update set title = excluded.title, messages = excluded.messages, updated = excluded.updated`,
      [userId, c.id, c.title, JSON.stringify(c.messages), c.updated]);
    },
    async deleteChat(userId, id) { await q('delete from chats where user_id = $1 and id = $2', [userId, id]); },
    async getMemory(userId) { return (await one('select items from memories where user_id = $1', [userId]))?.items || []; },
    async putMemory(userId, items) {
      await q('insert into memories values ($1,$2) on conflict (user_id) do update set items = excluded.items', [userId, JSON.stringify(items)]);
    },
    async getSecret(userId, name) { return (await one('select value_enc from secrets where user_id = $1 and name = $2', [userId, name]))?.value_enc || null; },
    async putSecret(userId, name, enc) {
      await q('insert into secrets values ($1,$2,$3) on conflict (user_id, name) do update set value_enc = excluded.value_enc', [userId, name, enc]);
    },
    async deleteSecret(userId, name) { await q('delete from secrets where user_id = $1 and name = $2', [userId, name]); },
  };
}

// ---- local files (./data/db.json, written atomically) ----
function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'db.json');
  let db = { nextId: 1, users: [], sessions: [], chats: [], memories: {}, secrets: [] };
  try { db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  const save = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file); };
  const uid = (id) => String(id);
  return {
    kind: 'local files',
    async createUser({ email, name, passHash = null, googleSub = null, role = 'user' }) {
      if (db.users.some((u) => u.email === email)) throw Object.assign(new Error('exists'), { code: '23505' });
      const u = { id: db.nextId++, email, name, pass_hash: passHash, google_sub: googleSub, role };
      db.users.push(u); save(); return userOut(u);
    },
    async userByEmail(email) { const u = db.users.find((x) => x.email === email); return u && { ...userOut(u), passHash: u.pass_hash }; },
    async userByGoogle(sub) { return userOut(db.users.find((u) => u.google_sub === sub)); },
    async linkGoogle(id, sub) { const u = db.users.find((x) => uid(x.id) === uid(id)); if (u) { u.google_sub = sub; save(); } },
    async setRole(id, role) { const u = db.users.find((x) => uid(x.id) === uid(id)); if (u) { u.role = role; save(); } },
    async createSession(hash, userId, expires) { db.sessions.push({ hash, userId: uid(userId), expires }); save(); },
    async sessionUser(hash) {
      const s = db.sessions.find((x) => x.hash === hash && x.expires > Date.now());
      return s ? userOut(db.users.find((u) => uid(u.id) === s.userId)) : null;
    },
    async deleteSession(hash) { db.sessions = db.sessions.filter((x) => x.hash !== hash); save(); },
    async listChats(userId) {
      return db.chats.filter((c) => c.userId === uid(userId)).sort((a, b) => b.updated - a.updated).slice(0, 200)
        .map(({ id, title, messages, updated }) => ({ id, title, messages, updated }));
    },
    async putChat(userId, c) {
      db.chats = db.chats.filter((x) => !(x.userId === uid(userId) && x.id === c.id));
      db.chats.push({ userId: uid(userId), ...c }); save();
    },
    async deleteChat(userId, id) { db.chats = db.chats.filter((x) => !(x.userId === uid(userId) && x.id === id)); save(); },
    async getMemory(userId) { return db.memories[uid(userId)] || []; },
    async putMemory(userId, items) { db.memories[uid(userId)] = items; save(); },
    async getSecret(userId, name) { return db.secrets.find((s) => s.userId === uid(userId) && s.name === name)?.enc || null; },
    async putSecret(userId, name, enc) {
      db.secrets = db.secrets.filter((s) => !(s.userId === uid(userId) && s.name === name));
      db.secrets.push({ userId: uid(userId), name, enc }); save();
    },
    async deleteSecret(userId, name) { db.secrets = db.secrets.filter((s) => !(s.userId === uid(userId) && s.name === name)); save(); },
  };
}

export async function openStore() {
  const url = (process.env.DATABASE_URL || '').trim();
  // Render's disk is wiped on every restart/deploy: local files there would lose people's accounts.
  if (!url && process.env.RENDER) throw new Error('set DATABASE_URL (Neon) to switch accounts on - local files are only for running on your own PC');
  const dir = path.resolve(process.env.DATA_DIR || 'data');
  if (process.env.DATA_KEY) dataKey = Buffer.from(process.env.DATA_KEY, 'base64');
  else if (!url) { // local: keep a key file next to the data
    fs.mkdirSync(dir, { recursive: true });
    const kf = path.join(dir, '.key');
    if (!fs.existsSync(kf)) fs.writeFileSync(kf, crypto.randomBytes(32).toString('base64'));
    dataKey = Buffer.from(fs.readFileSync(kf, 'utf8').trim(), 'base64');
  }
  if (url && (!dataKey || dataKey.length !== 32)) throw new Error('DATA_KEY (32 bytes, base64) must be set when DATABASE_URL is used');
  return url ? pgStore(url) : fileStore(dir);
}
