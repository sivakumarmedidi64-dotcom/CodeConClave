// Remote: use CodeConClave on your laptop from your phone - from anywhere.
// The laptop (signed in, Remote turned on) shows a QR code with a one-time pairing code (10 minutes).
// The phone scans it and gets its own device key (kept only on that phone; we store just its hash).
// Then whatever you type or say on the phone goes to the laptop's open CodeConClave, which does the work
// there - your folder, the coding agent, apps through the desktop app - and sends the answer back.
// Nothing runs unless the laptop has Remote on; the laptop can unlink a phone any time.
import crypto from 'crypto';

const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const clip = (s, n) => String(s ?? '').replace(/\u0000/g, '').slice(0, n);
const hostIdOk = (h) => /^[a-z0-9]{8,40}$/i.test(String(h || ''));
const WAIT_MS = 25000, ONLINE_MS = 45000;

export function registerRemote(app, { store, wrap }) {
  const pairs = new Map();   // sha(code) -> { uid, hostId, hostName, expires }
  const hosts = new Map();   // "uid:hostId" -> { seen, name, jobs: [], waiters: [] }
  const phones = new Map();  // deviceId -> { events: [], waiters: [], seq, seen }
  const host = (uid, hid) => { const k = `${uid}:${hid}`; if (!hosts.has(k)) hosts.set(k, { seen: 0, name: '', jobs: [], waiters: [] }); return hosts.get(k); };
  const phone = (id) => { if (!phones.has(id)) phones.set(id, { events: [], waiters: [], seq: 0, seen: 0 }); return phones.get(id); };
  const wake = (box) => box.waiters.splice(0).forEach((f) => f());
  // wait for news, up to 25 s (or until the other side hangs up)
  const hold = (box, res) => new Promise((ok) => { const t = setTimeout(ok, WAIT_MS); const f = () => { clearTimeout(t); ok(); }; box.waiters.push(f); res.on('close', f); });
  const online = (h) => Date.now() - h.seen < ONLINE_MS;
  const devices = async (uid) => { const v = await store.getPref(uid, 'remoteDevices').catch(() => null); return Array.isArray(v) ? v : []; };
  const saveDevices = (uid, list) => store.putPref(uid, 'remoteDevices', list.slice(-10));
  const needUser = (req, res) => {
    if (!store) { res.status(503).json({ error: 'Accounts are not switched on.' }); return true; }
    if (!req.user) { res.status(401).json({ error: 'Sign in first — Remote links your phone to your account.' }); return true; }
    return false;
  };
  // the phone sends "x-remote: <userId>.<deviceId>.<secret>"
  async function phoneAuth(req, res) {
    const [uid, did, secret] = String(req.get('x-remote') || '').split('.');
    const fail = () => { res.status(401).json({ error: 'This phone is not linked any more. Open Remote on your laptop and scan the code again.', unlinked: true }); return null; };
    if (!store || !uid || !did || !secret || !/^\w{1,40}$/.test(uid) || !/^[a-f0-9]{12}$/.test(did)) return fail();
    const d = (await devices(uid)).find((x) => x.id === did);
    if (!d || d.hash.length !== 64 || !crypto.timingSafeEqual(Buffer.from(d.hash), Buffer.from(sha(secret)))) return fail();
    return { uid, d };
  }

  // laptop: a fresh one-time code for the QR
  app.post('/api/remote/pair', wrap(async (req, res) => {
    if (needUser(req, res)) return;
    const hostId = String(req.body?.hostId || ''); if (!hostIdOk(hostId)) return res.status(400).json({ error: 'Bad laptop id.' });
    for (const [k, v] of pairs) if (v.expires < Date.now()) pairs.delete(k);
    for (const [k, v] of pairs) if (v.uid === String(req.user.id) && v.hostId === hostId) pairs.delete(k);   // one live code per laptop
    const code = crypto.randomBytes(16).toString('base64url'), expires = Date.now() + 10 * 60000;
    pairs.set(sha(code), { uid: String(req.user.id), hostId, hostName: clip(req.body?.hostName, 60).trim() || 'My laptop', expires });
    res.json({ code, expires });
  }));
  // phone: scanned the code -> its own key
  app.post('/api/remote/claim', wrap(async (req, res) => {
    if (!store) return res.status(503).json({ error: 'Accounts are not switched on.' });
    const k = sha(String(req.body?.code || '')), p = pairs.get(k);
    if (!p || p.expires < Date.now()) return res.status(400).json({ error: 'This code expired or was already used. On your laptop press “New code” and scan again.' });
    pairs.delete(k);
    const id = crypto.randomBytes(6).toString('hex'), secret = crypto.randomBytes(24).toString('base64url');
    const name = clip(req.body?.name, 60).trim() || 'Phone';
    const list = await devices(p.uid); list.push({ id, hash: sha(secret), name, hostId: p.hostId, hostName: p.hostName, created: Date.now() });
    await saveDevices(p.uid, list);
    const h = host(p.uid, p.hostId); h.jobs.push({ id: `pair-${id}`, kind: 'paired', device: { id, name }, at: Date.now() }); wake(h);
    res.json({ token: `${p.uid}.${id}.${secret}`, hostName: p.hostName, name });
  }));
  // phone -> laptop: a task
  app.post('/api/remote/send', wrap(async (req, res) => {
    const a = await phoneAuth(req, res); if (!a) return;
    const text = clip(req.body?.text, 4000).trim(); if (!text) return res.status(400).json({ error: 'Type something first.' });
    const h = host(a.uid, a.d.hostId);
    if (h.jobs.filter((j) => j.kind === 'ask').length >= 10) return res.status(429).json({ error: 'Your laptop already has 10 things waiting — give it a moment.' });
    const job = { id: crypto.randomBytes(6).toString('hex'), kind: 'ask', text, device: { id: a.d.id, name: a.d.name }, at: Date.now() };
    h.jobs.push(job); wake(h);
    res.json({ id: job.id, online: online(h), hostName: h.name || a.d.hostName });
  }));
  // phone: wait for answers (long poll); also tells if the laptop is online
  app.get('/api/remote/phone/wait', wrap(async (req, res) => {
    const a = await phoneAuth(req, res); if (!a) return;
    const box = phone(a.d.id), since = Number(req.query.since) || 0, h = host(a.uid, a.d.hostId); box.seen = Date.now();
    const ready = () => box.events.filter((e) => e.seq > since);
    if (!ready().length && req.query.wait !== '0') await hold(box, res);
    res.json({ events: ready(), online: online(h), hostName: h.name || a.d.hostName, name: a.d.name });
  }));
  app.post('/api/remote/unlink', wrap(async (req, res) => {   // the phone unlinks itself
    const a = await phoneAuth(req, res); if (!a) return;
    await saveDevices(a.uid, (await devices(a.uid)).filter((d) => d.id !== a.d.id)); phones.delete(a.d.id);
    res.json({ ok: true });
  }));

  // laptop: wait for work (long poll) - this is also how the laptop says "I'm online"
  app.get('/api/remote/host/wait', wrap(async (req, res) => {
    if (needUser(req, res)) return;
    const hostId = String(req.query.hostId || ''); if (!hostIdOk(hostId)) return res.status(400).json({ error: 'Bad laptop id.' });
    const h = host(String(req.user.id), hostId); h.seen = Date.now(); h.name = clip(req.query.name, 60).trim() || h.name;
    if (!h.jobs.length && req.query.wait !== '0') await hold(h, res);
    h.seen = Date.now();
    res.json({ jobs: h.jobs.splice(0) });
  }));
  // laptop -> phone: progress and answers
  app.post('/api/remote/host/reply', wrap(async (req, res) => {
    if (needUser(req, res)) return;
    const did = String(req.body?.deviceId || '');
    if (!(await devices(req.user.id)).some((d) => d.id === did)) return res.status(404).json({ error: 'That phone is not linked any more.' });
    const box = phone(did); box.seq = Math.max(box.seq + 1, Date.now());
    const links = (Array.isArray(req.body?.links) ? req.body.links : []).slice(0, 8).map((l) => ({ url: clip(l?.url, 600), title: clip(l?.title, 120) })).filter((l) => /^https?:\/\//.test(l.url));
    const images = (Array.isArray(req.body?.images) ? req.body.images : []).slice(0, 2).filter((x) => typeof x === 'string' && x.length < 400000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x));
    box.events.push({ seq: box.seq, job: clip(req.body?.job, 40), status: clip(req.body?.status, 200), text: clip(req.body?.text, 20000), done: Boolean(req.body?.done), links, images, at: Date.now() });
    if (box.events.length > 60) box.events.splice(0, box.events.length - 60);
    wake(box); res.json({ ok: true });
  }));
  // laptop: the linked phones (and unlink one)
  app.get('/api/remote/devices', wrap(async (req, res) => {
    if (needUser(req, res)) return;
    res.json({ devices: (await devices(req.user.id)).map((d) => ({ id: d.id, name: d.name, hostId: d.hostId, hostName: d.hostName, created: d.created, seen: phones.get(d.id)?.seen || 0 })) });
  }));
  app.delete('/api/remote/devices/:id', wrap(async (req, res) => {
    if (needUser(req, res)) return;
    await saveDevices(req.user.id, (await devices(req.user.id)).filter((d) => d.id !== req.params.id)); phones.delete(req.params.id);
    res.json({ ok: true });
  }));
}
