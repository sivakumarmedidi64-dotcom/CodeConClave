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
const spaceOut = (r) => r && { id: r.id, kind: r.kind, name: r.name, ownerId: String(r.owner_id ?? r.ownerId), parentId: r.parent_id ?? r.parentId ?? null, settings: r.settings || {}, created: Number(r.created) };
const itemOut = (r) => r && { id: r.id, kind: r.kind, data: r.data, authorId: r.author_id == null ? (r.authorId ?? null) : String(r.author_id), updated: Number(r.updated) };

// ---- Neon Postgres ----
async function pgStore(url) {
  const { default: pg } = await import('pg');
  // DB_SCHEMA keeps our tables in their own corner of a database that other apps also use (the old
  // app's tables live in "public"). Neon's pooled (-pooler) link refuses search_path, so use the direct one.
  const schema = (process.env.DB_SCHEMA || '').trim();
  if (schema && !/^[a-z_][a-z0-9_]{0,40}$/.test(schema)) throw new Error('DB_SCHEMA must be lowercase letters, digits or _');
  const conn = schema ? url.replace(/(@[^/:]*?)-pooler\./, '$1.') : url;
  const pool = new pg.Pool({ connectionString: conn, max: 5, ssl: { rejectUnauthorized: true }, ...(schema ? { options: `-c search_path=${schema}` } : {}) });
  if (schema) await pool.query(`create schema if not exists ${schema}`);
  return pgTables(pool);
}

async function pgTables(pool) {
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
      primary key (user_id, name));
    create table if not exists automations (
      user_id bigint not null references users(id) on delete cascade,
      id text not null,
      task text not null,
      schedule jsonb not null,
      enabled boolean not null default true,
      next_run bigint,
      last_run bigint,
      last_status text not null default '',
      created bigint not null,
      primary key (user_id, id));
    alter table automations add column if not exists steps jsonb;
    create table if not exists prefs (
      user_id bigint not null references users(id) on delete cascade,
      name text not null,
      value jsonb not null,
      primary key (user_id, name));
    create table if not exists spaces (
      id text primary key,
      kind text not null,
      name text not null,
      owner_id bigint not null references users(id) on delete cascade,
      parent_id text,
      settings jsonb not null default '{}',
      created bigint not null);
    create table if not exists space_members (
      space_id text not null references spaces(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      role text not null default 'member',
      joined bigint not null,
      primary key (space_id, user_id));
    create table if not exists api_keys (
      hash text primary key,
      user_id bigint not null references users(id) on delete cascade,
      created bigint not null);
    create table if not exists space_invites (
      token_hash text primary key,
      space_id text not null references spaces(id) on delete cascade,
      role text not null default 'member',
      expires bigint not null,
      created_by bigint not null);
    create table if not exists space_items (
      space_id text not null references spaces(id) on delete cascade,
      kind text not null,
      id text not null,
      data jsonb not null,
      author_id bigint,
      updated bigint not null,
      primary key (space_id, kind, id));
    create index if not exists space_items_recent on space_items (space_id, kind, updated);
    create index if not exists space_items_by_id on space_items (kind, id);
    create table if not exists app_kv (
      name text primary key,
      value jsonb not null,
      updated bigint not null default 0);`);
  const autoOut = (r) => r && { id: r.id, task: r.task, steps: r.steps || null, schedule: r.schedule, enabled: r.enabled,
    nextRun: r.next_run === null ? null : Number(r.next_run), lastRun: r.last_run === null ? null : Number(r.last_run), lastStatus: r.last_status };
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
    async setPassword(id, passHash) { await q('update users set pass_hash = $2 where id = $1', [id, passHash]); },
    async deleteSessionsOf(userId) { await q('delete from sessions where user_id = $1', [userId]); },
    // small app-wide values that must survive a restart (usage of guests, today's brain budget)
    async getKv(name) { return (await one('select value from app_kv where name = $1', [name]))?.value ?? null; },
    async putKv(name, value) { await q('insert into app_kv values ($1,$2,$3) on conflict (name) do update set value = excluded.value, updated = excluded.updated', [name, JSON.stringify(value), Date.now()]); },
    async pruneKv(prefix, before) { return (await q('delete from app_kv where name like $1 and updated < $2', [prefix.replace(/[%_]/g, '') + '%', before])).rowCount; },
    async createSession(hash, userId, expires) { await q('insert into sessions values ($1,$2,$3)', [hash, userId, new Date(expires)]); },
    // one account, a few devices: keep only the newest sign-ins (every sign-in lasts the same time, so newest = latest expiry)
    async trimSessions(userId, keep) {
      await q('delete from sessions where user_id = $1 and token_hash not in (select token_hash from sessions where user_id = $1 order by expires_at desc limit $2)', [userId, keep]);
    },
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
               on conflict (user_id, id) do update set title = excluded.title, messages = excluded.messages, updated = excluded.updated
               where chats.updated <= excluded.updated`,
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
    async listAutomations(userId) {
      return (await q('select * from automations where user_id = $1 order by created', [userId])).rows.map(autoOut);
    },
    async countAutomations(userId) { return Number((await one('select count(*) as n from automations where user_id = $1', [userId])).n); },
    async createAutomation(userId, a) {
      await q('insert into automations (user_id, id, task, schedule, enabled, next_run, created, steps) values ($1,$2,$3,$4,true,$5,$6,$7)',
        [userId, a.id, a.task, JSON.stringify(a.schedule), a.nextRun, Date.now(), a.steps ? JSON.stringify(a.steps) : null]);
    },
    async updateAutomation(userId, id, f) {
      await q(`update automations set enabled = coalesce($3, enabled), next_run = case when $4 then $5 else next_run end,
               last_run = coalesce($6, last_run), last_status = coalesce($7, last_status) where user_id = $1 and id = $2`,
      [userId, id, f.enabled ?? null, 'nextRun' in f, f.nextRun ?? null, f.lastRun ?? null, f.lastStatus ?? null]);
    },
    async deleteAutomation(userId, id) { await q('delete from automations where user_id = $1 and id = $2', [userId, id]); },
    async dueAutomations(now, limit) {
      return (await q('select * from automations where enabled and next_run is not null and next_run <= $1 order by next_run limit $2', [now, limit])).rows
        .map((r) => ({ userId: String(r.user_id), ...autoOut(r) }));
    },
    async userById(id) { return userOut(await one('select * from users where id = $1', [id])); },
    async getPref(userId, name) { return (await one('select value from prefs where user_id = $1 and name = $2', [userId, name]))?.value ?? null; },
    async putPref(userId, name, value) {
      await q('insert into prefs values ($1,$2,$3) on conflict (user_id, name) do update set value = excluded.value', [userId, name, JSON.stringify(value)]);
    },
    // ---- shared spaces ----
    async createSpace(sp) { await q('insert into spaces values ($1,$2,$3,$4,$5,$6,$7)', [sp.id, sp.kind, sp.name, sp.ownerId, sp.parentId || null, JSON.stringify(sp.settings || {}), sp.created]); return sp; },
    async getSpace(id) { const r = await one('select * from spaces where id = $1', [id]); return r && spaceOut(r); },
    async updateSpace(id, f) { if (f.name !== undefined) await q('update spaces set name = $2 where id = $1', [id, f.name]); if (f.settings !== undefined) await q('update spaces set settings = $2 where id = $1', [id, JSON.stringify(f.settings)]); },
    async deleteSpace(id) { await q('delete from spaces where id = $1', [id]); },
    async listSpaces(userId) { return (await q('select s.*, m.role as my_role from spaces s join space_members m on m.space_id = s.id where m.user_id = $1 order by s.created', [userId])).rows.map((r) => ({ ...spaceOut(r), myRole: r.my_role })); },
    async childSpaces(parentId) { return (await q('select * from spaces where parent_id = $1 order by created', [parentId])).rows.map(spaceOut); },
    async allOrgs() { return (await q("select * from spaces where kind = 'org'")).rows.map(spaceOut); },
    async listOrgsByDomain(dom) { return (await q("select * from spaces where kind = 'org' and settings->>'domain' = $1", [dom])).rows.map(spaceOut); },
    async addMember(spaceId, userId, role) { await q('insert into space_members values ($1,$2,$3,$4) on conflict (space_id, user_id) do update set role = excluded.role', [spaceId, userId, role, Date.now()]); },
    async memberRole(spaceId, userId) { return (await one('select role from space_members where space_id = $1 and user_id = $2', [spaceId, userId]))?.role || null; },
    async removeMember(spaceId, userId) { await q('delete from space_members where space_id = $1 and user_id = $2', [spaceId, userId]); },
    async listMembers(spaceId) { return (await q('select u.id, u.email, u.name, m.role, m.joined from space_members m join users u on u.id = m.user_id where m.space_id = $1 order by m.joined', [spaceId])).rows.map((r) => ({ id: String(r.id), email: r.email, name: r.name, role: r.role, joined: Number(r.joined) })); },
    async createInvite(hash, spaceId, role, expires, by) { await q('insert into space_invites values ($1,$2,$3,$4,$5)', [hash, spaceId, role, expires, by]); },
    async addApiKey(hash, userId) { await q('insert into api_keys values ($1,$2,$3) on conflict (hash) do nothing', [hash, userId, Date.now()]); },
    async apiKeyOwner(hash) { const r = await one('select user_id from api_keys where hash = $1', [hash]); return r ? String(r.user_id) : null; },
    async removeApiKey(hash) { await q('delete from api_keys where hash = $1', [hash]); },
    async getInvite(hash) { const r = await one('select * from space_invites where token_hash = $1', [hash]); return r && { spaceId: r.space_id, role: r.role, expires: Number(r.expires) }; },
    async putItem(spaceId, kind, id, data, authorId) { await q('insert into space_items values ($1,$2,$3,$4,$5,$6) on conflict (space_id, kind, id) do update set data = excluded.data, updated = excluded.updated', [spaceId, kind, id, JSON.stringify(data), authorId || null, Date.now()]); },
    async getItem(spaceId, kind, id) { const r = await one('select * from space_items where space_id = $1 and kind = $2 and id = $3', [spaceId, kind, id]); return r && itemOut(r); },
    async findItem(kind, id) { const r = await one('select * from space_items where kind = $1 and id = $2 limit 1', [kind, id]); return r && { ...itemOut(r), spaceId: r.space_id }; },
    async listItems(spaceId, kind, { since = 0, limit = 200 } = {}) { return (await q('select * from space_items where space_id = $1 and kind = $2 and updated > $3 order by updated desc limit $4', [spaceId, kind, since, limit])).rows.map(itemOut); },
    async deleteItem(spaceId, kind, id) { await q('delete from space_items where space_id = $1 and kind = $2 and id = $3', [spaceId, kind, id]); },
    async deleteItemsBefore(spaceId, kind, before) { return (await q('delete from space_items where space_id = $1 and kind = $2 and updated < $3', [spaceId, kind, before])).rowCount; },
  };
}

// ---- local files (./data/db.json, written atomically) ----
function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'db.json');
  let db = { nextId: 1, users: [], sessions: [], chats: [], memories: {}, secrets: [], automations: [], prefs: {}, spaces: [], members: [], invites: [], items: [], apiKeys: [] };
  try { db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  // Windows can refuse the rename while another program (antivirus, search indexer) holds the file - then write it directly
  const save = () => { const text = JSON.stringify(db); fs.writeFileSync(file + '.tmp', text); try { fs.renameSync(file + '.tmp', file); } catch { fs.writeFileSync(file, text); } };
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
    async setPassword(id, passHash) { const u = db.users.find((x) => uid(x.id) === uid(id)); if (u) { u.pass_hash = passHash; save(); } },
    async deleteSessionsOf(userId) { db.sessions = db.sessions.filter((x) => x.userId !== uid(userId)); save(); },
    async getKv(name) { return (db.kv || {})[name]?.value ?? null; },
    async putKv(name, value) { db.kv = db.kv || {}; db.kv[name] = { value, updated: Date.now() }; save(); },
    async pruneKv(prefix, before) { let n = 0; for (const [k, v] of Object.entries(db.kv || {})) if (k.startsWith(prefix) && v.updated < before) { delete db.kv[k]; n++; } if (n) save(); return n; },
    async createSession(hash, userId, expires) { db.sessions.push({ hash, userId: uid(userId), expires }); save(); },
    async trimSessions(userId, keep) {
      const mine = db.sessions.filter((x) => x.userId === uid(userId)).sort((a, b) => b.expires - a.expires);
      const drop = new Set(mine.slice(keep).map((x) => x.hash));
      if (drop.size) { db.sessions = db.sessions.filter((x) => !drop.has(x.hash)); save(); }
    },
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
      const old = db.chats.find((x) => x.userId === uid(userId) && x.id === c.id);
      if (old && old.updated > c.updated) return; // a newer copy is already saved
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
    async listAutomations(userId) {
      return db.automations.filter((a) => a.userId === uid(userId)).sort((a, b) => a.created - b.created).map(({ userId: _u, created: _c, ...a }) => a);
    },
    async countAutomations(userId) { return db.automations.filter((a) => a.userId === uid(userId)).length; },
    async createAutomation(userId, a) {
      db.automations.push({ userId: uid(userId), id: a.id, task: a.task, steps: a.steps || null, schedule: a.schedule, enabled: true, nextRun: a.nextRun, lastRun: null, lastStatus: '', created: Date.now() });
      save();
    },
    async updateAutomation(userId, id, f) {
      const a = db.automations.find((x) => x.userId === uid(userId) && x.id === id);
      if (!a) return;
      if (f.enabled !== undefined) a.enabled = f.enabled;
      if ('nextRun' in f) a.nextRun = f.nextRun;
      if (f.lastRun !== undefined) a.lastRun = f.lastRun;
      if (f.lastStatus !== undefined) a.lastStatus = f.lastStatus;
      save();
    },
    async deleteAutomation(userId, id) { db.automations = db.automations.filter((x) => !(x.userId === uid(userId) && x.id === id)); save(); },
    async dueAutomations(now, limit) {
      return db.automations.filter((a) => a.enabled && a.nextRun !== null && a.nextRun <= now).sort((a, b) => a.nextRun - b.nextRun).slice(0, limit)
        .map(({ created: _c, ...a }) => a);
    },
    async userById(id) { return userOut(db.users.find((u) => uid(u.id) === uid(id))); },
    async getPref(userId, name) { return db.prefs[`${uid(userId)}:${name}`] ?? null; },
    async putPref(userId, name, value) { db.prefs[`${uid(userId)}:${name}`] = value; save(); },
    // ---- shared spaces ----
    async createSpace(sp) { db.spaces.push({ ...sp, ownerId: uid(sp.ownerId) }); save(); return sp; },
    async getSpace(id) { return spaceOut(db.spaces.find((x) => x.id === id)); },
    async updateSpace(id, f) { const x = db.spaces.find((y) => y.id === id); if (x) { if (f.name !== undefined) x.name = f.name; if (f.settings !== undefined) x.settings = f.settings; save(); } },
    async deleteSpace(id) { db.spaces = db.spaces.filter((x) => x.id !== id); db.members = db.members.filter((x) => x.spaceId !== id); db.items = db.items.filter((x) => x.spaceId !== id); save(); },
    async listSpaces(userId) { return db.members.filter((m) => m.userId === uid(userId)).map((m) => ({ ...spaceOut(db.spaces.find((x) => x.id === m.spaceId)), myRole: m.role })).filter((x) => x.id); },
    async childSpaces(parentId) { return db.spaces.filter((x) => x.parentId === parentId).map(spaceOut); },
    async allOrgs() { return db.spaces.filter((x) => x.kind === 'org').map(spaceOut); },
    async listOrgsByDomain(dom) { return db.spaces.filter((x) => x.kind === 'org' && x.settings?.domain === dom).map(spaceOut); },
    async addMember(spaceId, userId, role) { const m = db.members.find((x) => x.spaceId === spaceId && x.userId === uid(userId)); if (m) m.role = role; else db.members.push({ spaceId, userId: uid(userId), role, joined: Date.now() }); save(); },
    async memberRole(spaceId, userId) { return db.members.find((x) => x.spaceId === spaceId && x.userId === uid(userId))?.role || null; },
    async removeMember(spaceId, userId) { db.members = db.members.filter((x) => !(x.spaceId === spaceId && x.userId === uid(userId))); save(); },
    async listMembers(spaceId) { return db.members.filter((m) => m.spaceId === spaceId).map((m) => { const u = db.users.find((y) => uid(y.id) === m.userId) || {}; return { id: m.userId, email: u.email, name: u.name, role: m.role, joined: m.joined }; }); },
    async createInvite(hash, spaceId, role, expires, by) { db.invites.push({ hash, spaceId, role, expires, by: uid(by) }); save(); },
    async addApiKey(hash, userId) { db.apiKeys = db.apiKeys || []; if (!db.apiKeys.some((k) => k.hash === hash)) db.apiKeys.push({ hash, userId: uid(userId), created: Date.now() }); save(); },
    async apiKeyOwner(hash) { return (db.apiKeys || []).find((k) => k.hash === hash)?.userId || null; },
    async removeApiKey(hash) { db.apiKeys = (db.apiKeys || []).filter((k) => k.hash !== hash); save(); },
    async getInvite(hash) { const r = db.invites.find((x) => x.hash === hash); return r && { spaceId: r.spaceId, role: r.role, expires: r.expires }; },
    async putItem(spaceId, kind, id, data, authorId) { const x = db.items.find((y) => y.spaceId === spaceId && y.kind === kind && y.id === id); if (x) { x.data = data; x.updated = Date.now(); } else db.items.push({ spaceId, kind, id, data, authorId: authorId ? uid(authorId) : null, updated: Date.now() }); save(); },
    async getItem(spaceId, kind, id) { return itemOut(db.items.find((y) => y.spaceId === spaceId && y.kind === kind && y.id === id)); },
    async findItem(kind, id) { const x = db.items.find((y) => y.kind === kind && y.id === id); return x && { ...itemOut(x), spaceId: x.spaceId }; },
    async listItems(spaceId, kind, { since = 0, limit = 200 } = {}) { return db.items.filter((y) => y.spaceId === spaceId && y.kind === kind && y.updated > since).sort((a, b) => b.updated - a.updated).slice(0, limit).map(itemOut); },
    async deleteItem(spaceId, kind, id) { db.items = db.items.filter((y) => !(y.spaceId === spaceId && y.kind === kind && y.id === id)); save(); },
    async deleteItemsBefore(spaceId, kind, before) { const n = db.items.length; db.items = db.items.filter((y) => !(y.spaceId === spaceId && y.kind === kind && y.updated < before)); save(); return n - db.items.length; },
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
