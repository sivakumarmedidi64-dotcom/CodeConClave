// Shared spaces: TEAMS (a group working together) and ORGANIZATIONS (a company: teamspaces, admins,
// policies, audit). Solo work stays in each person's own chats - nothing here mixes into it.
// Everything is kept on the server (Neon) so teammates really share it; every change is checked
// against the person's role, and organizations get an audit log of who did what.
import crypto from 'crypto';

const ROLES = ['owner', 'admin', 'member', 'guest'];
const RANK = { owner: 4, admin: 3, member: 2, guest: 1 };
// item kinds per space type - kept separate on purpose
// aichat = an AI chat a member shared with the team; share = a share-space link (private or public)
const TEAM_KINDS = new Set(['message', 'task', 'page', 'knowledge', 'rule', 'meeting', 'decision', 'aichat', 'share']);
const ORG_KINDS = new Set(['knowledge', 'rule', 'approval', 'audit', 'announcement', 'decision']);
const TEAMSPACE_KINDS = TEAM_KINDS;
const kindsFor = (sp) => (sp.kind === 'org' ? ORG_KINDS : TEAM_KINDS);
// who may write what (admins set the standards and decide approvals)
const WRITE_RANK = { rule: 3, announcement: 3, audit: 99, share: 99 };
const TEAM_SEATS = 20; // a team holds up to 20 people (organizations' teamspaces follow the organization)
const hashTok = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const same = (a, b) => a != null && b != null && String(a) === String(b);
const clip = (s, n) => String(s ?? '').replace(/\u0000/g, '').slice(0, n);
const newId = () => `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
const STOP = new Set('the a an and or of to in on at for from by with about is are was were be been do does did what which who how why when where this that these those it its our we you your i my me can could should would will please tell show give find'.split(' '));
const words = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
// private data an organization can choose to hide from the AI: emails, phone numbers, Aadhaar, PAN, cards
export function maskPrivate(text) {
  return String(text || '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '[aadhaar]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[pan]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[card]')
    .replace(/(\+?91[\s-]?)?\b[6-9]\d{9}\b/g, '[phone]');
}

export function registerSpaces(app, { store, wrap, engineAsk }) {
  const needUser = (req, res) => { if (!store) { res.status(503).json({ error: 'Accounts are not switched on.' }); return true; } if (!req.user) { res.status(401).json({ error: 'Sign in first (bottom-left) — teams and organizations are kept on your account.' }); return true; } return false; };
  // the space + the person's role in it (an org's admins also run its teamspaces)
  async function access(req, res, id, min = 'guest') {
    if (needUser(req, res)) return null;
    const sp = await store.getSpace(String(id));
    if (!sp) { res.status(404).json({ error: 'That space does not exist (or was deleted).' }); return null; }
    let role = await store.memberRole(sp.id, req.user.id);
    if (sp.parentId) { const orgRole = await store.memberRole(sp.parentId, req.user.id); if (RANK[orgRole] >= 3 && (!role || RANK[orgRole] > RANK[role])) role = orgRole; }
    if (!role || RANK[role] < RANK[min]) { res.status(403).json({ error: min === 'admin' ? 'Only admins can do that here.' : 'You are not a member of this space.' }); return null; }
    return { sp, role };
  }
  async function audit(spaceId, user, action, detail = '') {
    try { const sp = await store.getSpace(spaceId); const orgId = sp?.kind === 'org' ? sp.id : sp?.parentId; if (!orgId) return;
      await store.putItem(orgId, 'audit', newId(), { at: Date.now(), who: user?.id || '', whoName: user?.name || user?.email || '', action, detail: clip(detail, 300), space: sp.name }, user?.id); } catch { /* audit must never break the action */ }
  }
  const view = async (sp, role) => ({ space: sp, myRole: role, members: await store.listMembers(sp.id), children: sp.kind === 'org' ? await store.childSpaces(sp.id) : [], seats: sp.kind === 'team' ? TEAM_SEATS : null });

  // ---- spaces ----
  app.get('/api/spaces', wrap(async (req, res) => { if (needUser(req, res)) return; res.json({ spaces: await store.listSpaces(req.user.id) }); }));
  app.post('/api/spaces', wrap(async (req, res) => {
    if (needUser(req, res)) return;
    const kind = ['team', 'org', 'teamspace'].includes(req.body?.kind) ? req.body.kind : null;
    const name = clip(req.body?.name, 80).trim();
    if (!kind || !name) return res.status(400).json({ error: 'Give it a name.' });
    let parentId = null;
    if (kind === 'teamspace') { const a = await access(req, res, req.body?.parentId, 'admin'); if (!a) return; if (a.sp.kind !== 'org') return res.status(400).json({ error: 'Teamspaces live inside an organization.' }); parentId = a.sp.id; }
    else if ((await store.listSpaces(req.user.id)).filter((x) => x.ownerId === req.user.id && x.kind === kind).length >= 10) return res.status(429).json({ error: 'That is the most you can create for now.' });
    const sp = await store.createSpace({ id: newId(), kind, name, ownerId: req.user.id, parentId, settings: kind === 'org' ? { domain: '', disabledTools: [], agentMode: 'ask', protectedPaths: ['payments/', 'auth/', '.env'], maskPrivate: false, retentionDays: 0 } : {}, created: Date.now() });
    await store.addMember(sp.id, req.user.id, 'owner');
    await audit(sp.id, req.user, kind === 'teamspace' ? 'teamspace.created' : `${kind}.created`, name);
    res.json(await view(sp, 'owner'));
  }));
  app.get('/api/spaces/:id', wrap(async (req, res) => { const a = await access(req, res, req.params.id); if (!a) return; res.json(await view(a.sp, a.role)); }));
  app.patch('/api/spaces/:id', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'admin'); if (!a) return;
    const f = {};
    if (req.body?.name) f.name = clip(req.body.name, 80).trim();
    if (req.body?.settings && typeof req.body.settings === 'object') {
      const x = req.body.settings, cur = a.sp.settings || {};
      f.settings = { ...cur,
        ...(x.domain !== undefined ? { domain: clip(x.domain, 80).trim().toLowerCase().replace(/^@/, '') } : {}),
        ...(Array.isArray(x.disabledTools) ? { disabledTools: x.disabledTools.map((t) => clip(t, 20)).slice(0, 20) } : {}),
        ...(['readonly', 'ask', 'auto'].includes(x.agentMode) ? { agentMode: x.agentMode } : {}),
        ...(Array.isArray(x.protectedPaths) ? { protectedPaths: x.protectedPaths.map((p) => clip(p, 120)).filter(Boolean).slice(0, 40) } : {}),
        ...(x.maskPrivate !== undefined ? { maskPrivate: Boolean(x.maskPrivate) } : {}),
        ...(x.publicShares !== undefined ? { publicShares: Boolean(x.publicShares) } : {}),
        ...(x.retentionDays !== undefined ? { retentionDays: Math.max(0, Math.min(3650, Number(x.retentionDays) || 0)) } : {}),
        ...(x.instructions !== undefined ? { instructions: clip(x.instructions, 2000) } : {}) };
    }
    await store.updateSpace(a.sp.id, f);
    await audit(a.sp.id, req.user, 'settings.changed', Object.keys(req.body?.settings || {}).join(', ') || 'name');
    res.json(await view(await store.getSpace(a.sp.id), a.role));
  }));
  app.delete('/api/spaces/:id', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'owner'); if (!a) return;
    await audit(a.sp.id, req.user, 'space.deleted', a.sp.name);
    for (const c of a.sp.kind === 'org' ? await store.childSpaces(a.sp.id) : []) await store.deleteSpace(c.id);
    await store.deleteSpace(a.sp.id); res.json({ ok: true });
  }));

  // ---- members & invites ----
  app.post('/api/spaces/:id/invites', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'admin'); if (!a) return;
    const role = ['admin', 'member', 'guest'].includes(req.body?.role) ? req.body.role : 'member';
    const token = crypto.randomBytes(18).toString('base64url');
    await store.createInvite(crypto.createHash('sha256').update(token).digest('hex'), a.sp.id, role, Date.now() + 14 * 864e5, req.user.id);
    await audit(a.sp.id, req.user, 'invite.created', role);
    res.json({ token, role, expires: Date.now() + 14 * 864e5 });
  }));
  app.post('/api/join', wrap(async (req, res) => {
    if (needUser(req, res)) return;
    const inv = await store.getInvite(crypto.createHash('sha256').update(String(req.body?.token || '')).digest('hex'));
    if (!inv || inv.expires < Date.now()) return res.status(400).json({ error: 'This invite link is not valid any more — ask for a new one.' });
    const sp = await store.getSpace(inv.spaceId); if (!sp) return res.status(404).json({ error: 'That space was deleted.' });
    const cur = await store.memberRole(sp.id, req.user.id);
    if (!cur && sp.kind === 'team' && (await store.listMembers(sp.id)).length >= TEAM_SEATS) return res.status(403).json({ error: `This team is full (${TEAM_SEATS} people). Ask the team owner to make room.` });
    if (!cur || RANK[inv.role] > RANK[cur]) await store.addMember(sp.id, req.user.id, inv.role);
    await audit(sp.id, req.user, 'member.joined', inv.role);
    res.json({ space: sp });
  }));
  // organizations with a company email domain: people with that email can join themselves
  app.get('/api/spaces-for-my-domain', wrap(async (req, res) => {
    if (needUser(req, res)) return;
    const dom = String(req.user.email || '').split('@')[1]?.toLowerCase();
    if (!dom || /^(gmail|yahoo|outlook|hotmail|icloud|proton(mail)?)\./.test(dom)) return res.json({ spaces: [] });
    res.json({ spaces: (await store.listOrgsByDomain?.(dom)) || [] });
  }));
  app.post('/api/spaces/:id/join-domain', wrap(async (req, res) => {
    if (needUser(req, res)) return;
    const sp = await store.getSpace(req.params.id), dom = String(req.user.email || '').split('@')[1]?.toLowerCase();
    if (!sp || sp.kind !== 'org' || !dom || sp.settings?.domain !== dom) return res.status(403).json({ error: 'Your email is not on this organization’s domain.' });
    if (!(await store.memberRole(sp.id, req.user.id))) await store.addMember(sp.id, req.user.id, 'member');
    await audit(sp.id, req.user, 'member.joined', 'by company email');
    res.json({ space: sp });
  }));
  app.patch('/api/spaces/:id/members/:uid', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'admin'); if (!a) return;
    const role = ['admin', 'member', 'guest'].includes(req.body?.role) ? req.body.role : null;
    if (!role) return res.status(400).json({ error: 'Pick admin, member or guest.' });
    if (await store.memberRole(a.sp.id, req.params.uid) === 'owner') return res.status(400).json({ error: 'The owner stays the owner.' });
    await store.addMember(a.sp.id, req.params.uid, role); await audit(a.sp.id, req.user, 'member.role', role);
    res.json(await view(a.sp, a.role));
  }));
  app.delete('/api/spaces/:id/members/:uid', wrap(async (req, res) => {
    const self = String(req.params.uid) === String(req.user?.id);
    const a = await access(req, res, req.params.id, self ? 'guest' : 'admin'); if (!a) return;
    if (await store.memberRole(a.sp.id, req.params.uid) === 'owner') return res.status(400).json({ error: 'The owner cannot be removed.' });
    await store.removeMember(a.sp.id, req.params.uid); await audit(a.sp.id, req.user, self ? 'member.left' : 'member.removed', '');
    res.json({ ok: true });
  }));

  // ---- items: messages, tasks, pages, knowledge, rules, meetings, decisions, approvals, announcements ----
  app.get('/api/spaces/:id/items/:kind', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, req.params.kind === 'audit' ? 'admin' : 'guest'); if (!a) return;
    if (!kindsFor(a.sp).has(req.params.kind)) return res.status(400).json({ error: 'Not part of this space.' });
    res.json({ items: await store.listItems(a.sp.id, req.params.kind, { since: Number(req.query.since) || 0, limit: Math.min(500, Number(req.query.limit) || 200) }) });
  }));
  app.put('/api/spaces/:id/items/:kind/:itemId', wrap(async (req, res) => {
    const kind = req.params.kind;
    const a = await access(req, res, req.params.id, 'guest'); if (!a) return;
    if (!kindsFor(a.sp).has(kind) || kind === 'audit') return res.status(400).json({ error: 'Not part of this space.' });
    if (RANK[a.role] < (WRITE_RANK[kind] || 2)) return res.status(403).json({ error: kind === 'rule' ? 'Only admins set the standards.' : 'Guests can only read here.' });
    const old = await store.getItem(a.sp.id, kind, req.params.itemId);
    if (old && old.authorId && !same(old.authorId, req.user.id) && RANK[a.role] < 3 && !['task', 'page'].includes(kind)) return res.status(403).json({ error: 'Only its author or an admin can change this.' });
    let data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
    const text = JSON.stringify(data); if (text.length > 200000) return res.status(413).json({ error: 'That is too big to save.' });
    data = { ...data, by: old?.data?.by || req.user.id, byName: old?.data?.byName || req.user.name || req.user.email, at: old?.data?.at || Date.now(), editedAt: Date.now() };
    // pages keep their last 20 versions (page history)
    if (kind === 'page' && old) data.history = [{ at: old.data.editedAt || old.updated, byName: old.data.lastByName || old.data.byName, title: old.data.title, body: clip(old.data.body, 60000) }, ...(old.data.history || [])].slice(0, 20);
    if (kind === 'page') data.lastByName = req.user.name || req.user.email;
    // approvals: anyone asks, admins decide
    if (kind === 'approval' && old && data.status !== old.data.status && RANK[a.role] < 3) return res.status(403).json({ error: 'Only admins approve or reject.' });
    await store.putItem(a.sp.id, kind, clip(req.params.itemId, 80), data, old?.authorId || req.user.id);
    await audit(a.sp.id, req.user, `${kind}.${old ? 'updated' : 'created'}`, data.title || data.text || data.name || '');
    res.json({ ok: true });
  }));
  app.delete('/api/spaces/:id/items/:kind/:itemId', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'member'); if (!a) return;
    const old = await store.getItem(a.sp.id, req.params.kind, req.params.itemId);
    if (!old) return res.json({ ok: true });
    if (!same(old.authorId, req.user.id) && RANK[a.role] < 3) return res.status(403).json({ error: 'Only its author or an admin can delete this.' });
    await store.deleteItem(a.sp.id, req.params.kind, req.params.itemId); await audit(a.sp.id, req.user, `${req.params.kind}.deleted`, old.data?.title || '');
    res.json({ ok: true });
  }));

  // ---- the shared brain: answers from the space's own knowledge, pages, rules, decisions and meetings ----
  async function gather(sp, deep = false) {
    const spaces = [sp, ...(sp.kind === 'org' && deep ? await store.childSpaces(sp.id) : [])];
    if (sp.parentId) spaces.push(await store.getSpace(sp.parentId));
    const chunks = [];
    for (const s of spaces.filter(Boolean)) {
      for (const kind of ['knowledge', 'page', 'rule', 'decision', 'meeting']) {
        for (const it of await store.listItems(s.id, kind, { limit: 300 })) {
          const title = it.data.title || it.data.name || kind, body = [it.data.body, it.data.text, it.data.summary, (it.data.actions || []).join('\n')].filter(Boolean).join('\n');
          for (let i = 0; i < Math.max(1, body.length); i += 900) chunks.push({ space: s.name, kind, title, text: body.slice(i, i + 1000), id: it.id });
        }
      }
    }
    return chunks;
  }
  function rank(chunks, q, n = 6) {
    const want = words(q);
    return chunks.map((c) => { const t = `${c.title} ${c.text}`.toLowerCase(); let sc = 0; for (const w of want) { if (t.includes(w)) sc += 1; if (c.title.toLowerCase().includes(w)) sc += 2; } return { ...c, sc }; })
      .filter((c) => c.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, n);
  }
  async function brainAnswer(sp, question, user, deep) {
    const hits = rank(await gather(sp, deep), question);
    const rules = (await store.listItems(sp.id, 'rule', { limit: 50 })).map((r) => `- ${r.data.text || r.data.title}`).join('\n');
    const block = hits.map((h, i) => `[${i + 1}] ${h.kind} "${h.title}"${deep ? ` (${h.space})` : ''}:\n${h.text}`).join('\n\n');
    const system = `You are CodeConClave AI inside the ${sp.kind === 'org' ? 'organization' : 'team'} "${sp.name}". Answer the member's question from the ${sp.kind === 'org' ? 'company' : 'team'} knowledge below, citing [n]. If the knowledge does not cover it, say so plainly and suggest what to add. Be short and clear.${sp.settings?.instructions ? `\nCompany instructions: ${sp.settings.instructions}` : ''}${rules ? `\nStandards everyone follows:\n${rules}` : ''}`;
    const answer = hits.length ? await engineAsk([{ role: 'system', content: system }, { role: 'user', content: `Knowledge:\n${block}\n\nQuestion: ${question}` }], { engine: 'chat', max: 700, temperature: 0.2, ms: 40000 })
      : `I couldn't find anything about that in the ${sp.kind === 'org' ? 'company' : 'team'} brain yet. Add it under ${sp.kind === 'org' ? 'Company brain' : 'Team brain'} (a page, a note or a file) and I'll answer from it for everyone.`;
    await audit(sp.id, user, 'brain.asked', question);
    return { answer: String(answer).trim(), sources: hits.map((h, i) => ({ n: i + 1, title: h.title, kind: h.kind, space: h.space, id: h.id })) };
  }
  app.post('/api/spaces/:id/ask', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id); if (!a) return;
    const q = clip(req.body?.question, 600).trim(); if (!q) return res.status(400).json({ error: 'Ask something.' });
    res.json(await brainAnswer(a.sp, a.sp.settings?.maskPrivate ? maskPrivate(q) : q, req.user, a.sp.kind === 'org'));
  }));

  // ---- the team chat: everyone + @CodeConClave ----
  app.post('/api/spaces/:id/channel', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'member'); if (!a) return;
    const text = clip(req.body?.text, 4000).trim(); if (!text) return res.status(400).json({ error: 'Type a message.' });
    const msg = { text, by: req.user.id, byName: req.user.name || req.user.email, at: Date.now() };
    await store.putItem(a.sp.id, 'message', newId(), msg, req.user.id);
    let reply = null;
    if (/@(codeconclave|cc|ai)\b/i.test(text)) {
      const recent = (await store.listItems(a.sp.id, 'message', { limit: 20 })).reverse().map((m) => `${m.data.byName}${m.data.ai ? ' (AI)' : ''}: ${m.data.text}`).join('\n');
      const q = text.replace(/@(codeconclave|cc|ai)\b/ig, '').trim();
      const hits = rank(await gather(a.sp), q, 4);
      const rules = (await store.listItems(a.sp.id, 'rule', { limit: 50 })).map((r) => `- ${r.data.text}`).join('\n');
      const out = await engineAsk([{ role: 'system', content: `You are CodeConClave AI, a teammate in the team chat of "${a.sp.name}". Reply to ${msg.byName} helpfully and briefly, like a smart colleague. Use the team knowledge when it helps (cite [n]).${rules ? `\nTeam standards:\n${rules}` : ''}` },
        { role: 'user', content: `${hits.length ? `Team knowledge:\n${hits.map((h, i) => `[${i + 1}] ${h.title}: ${h.text}`).join('\n')}\n\n` : ''}Recent chat:\n${recent}\n\nReply to the last message.` }], { engine: 'chat', max: 600, temperature: 0.4, ms: 40000 }).catch(() => 'Sorry, I could not answer just now — try again in a moment.');
      reply = { text: String(out).trim(), by: 'ai', byName: 'CodeConClave AI', ai: true, at: Date.now() + 1 };
      await store.putItem(a.sp.id, 'message', newId(), reply, null);
    }
    await audit(a.sp.id, req.user, 'message.sent', '');
    res.json({ ok: true, reply });
  }));

  // ---- AI jobs for teams: plan a task, standup, release notes, meeting notes -> tasks, write a page ----
  const JSONONLY = 'Reply with JSON only.';
  const firstJson = (s) => { const t = String(s || ''), x = t.indexOf('{'), y = t.lastIndexOf('}'); if (x < 0 || y <= x) return null; try { return JSON.parse(t.slice(x, y + 1)); } catch { return null; } };
  app.post('/api/spaces/:id/ai/:job', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'member'); if (!a) return;
    const job = req.params.job, sp = a.sp;
    const tasks = async () => (await store.listItems(sp.id, 'task', { limit: 300 })).map((t) => t.data);
    const rules = (await store.listItems(sp.id, 'rule', { limit: 50 })).map((r) => `- ${r.data.text}`).join('\n');
    const ask = (system, user, max = 900) => engineAsk([{ role: 'system', content: system }, { role: 'user', content: user }], { engine: 'chat', max, temperature: 0.3, ms: 60000 });
    let out;
    if (job === 'plan-task') {
      const t = clip(req.body?.title, 300), d = clip(req.body?.detail, 2000);
      const j = firstJson(await ask(`You break a team task into clear steps. ${JSONONLY} {"steps":["…"],"acceptance":["…"],"risk":"low|medium|high","estimate":"e.g. 2 hours"}${rules ? `\nFollow the team standards:\n${rules}` : ''}`, `Task: ${t}\n${d}`));
      out = j || { steps: [], acceptance: [], risk: 'unknown', estimate: '' };
    } else if (job === 'standup') {
      const list = await tasks();
      out = { text: String(await ask('You write a short daily standup for a team: Done yesterday, Doing today, Blocked — grouped by person, in bullet points. Plain text.', list.map((t) => `${t.status}: ${t.title} (${t.assigneeName || 'unassigned'})${t.blocked ? ' [blocked]' : ''}`).join('\n') || 'No tasks yet.')).trim() };
    } else if (job === 'release-notes') {
      const done = (await tasks()).filter((t) => t.status === 'done');
      out = { text: String(await ask('You write friendly release notes from finished tasks: a one-line headline, then "New", "Improved", "Fixed" sections with short bullets. Plain text.', done.map((t) => `- ${t.title}${t.detail ? `: ${clip(t.detail, 200)}` : ''}`).join('\n') || 'Nothing finished yet.')).trim() };
    } else if (job === 'meeting') {
      const tr = clip(req.body?.transcript, 30000);
      if (tr.length < 40) return res.status(400).json({ error: 'Paste the meeting notes or transcript first.' });
      const j = firstJson(await ask(`You turn meeting notes into a summary and action items. ${JSONONLY} {"title":"…","summary":"3-6 short lines","decisions":["…"],"actions":[{"task":"…","owner":"name or empty"}]}`, tr, 1400)) || {};
      const id = newId();
      const m = { title: clip(j.title || 'Meeting notes', 120), summary: clip(j.summary, 3000), decisions: (j.decisions || []).map((x) => clip(x, 300)).slice(0, 15), actions: (j.actions || []).map((x) => clip(x.task, 300)).slice(0, 20), transcript: tr.slice(0, 20000) };
      await store.putItem(sp.id, 'meeting', id, { ...m, by: req.user.id, byName: req.user.name || req.user.email, at: Date.now() }, req.user.id);
      // each action item becomes a task on the board
      for (const x of (j.actions || []).slice(0, 20)) await store.putItem(sp.id, 'task', newId(), { title: clip(x.task, 200), detail: `From the meeting "${m.title}"`, status: 'todo', assigneeName: clip(x.owner, 60), by: req.user.id, byName: req.user.name || req.user.email, at: Date.now() }, req.user.id);
      out = { id, ...m };
    } else if (job === 'write-page') {
      const p = clip(req.body?.prompt, 1500);
      out = { body: String(await ask(`You write clear team documents in Markdown (headings, short paragraphs, bullet lists, tables when useful). Write only the document.${rules ? `\nFollow the team standards:\n${rules}` : ''}`, p, 1800)).trim() };
    } else return res.status(404).json({ error: 'Unknown job.' });
    await audit(sp.id, req.user, `ai.${job}`, req.body?.title || '');
    res.json(out);
  }));

  // ---- organization: audit export, data export, usage overview ----
  app.get('/api/spaces/:id/audit.csv', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'admin'); if (!a) return;
    const rows = await store.listItems(a.sp.id, 'audit', { limit: 5000 });
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="audit-${a.sp.name.replace(/[^\w-]+/g, '_')}.csv"`);
    res.send(['time,who,action,space,detail', ...rows.map((r) => [new Date(r.data.at).toISOString(), r.data.whoName, r.data.action, r.data.space, r.data.detail].map(esc).join(','))].join('\n'));
  }));
  app.get('/api/spaces/:id/export', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'admin'); if (!a) return;
    const out = { space: a.sp, members: await store.listMembers(a.sp.id), items: {} };
    for (const k of kindsFor(a.sp)) out.items[k] = (await store.listItems(a.sp.id, k, { limit: 5000 })).map((i) => i.data);
    for (const c of a.sp.kind === 'org' ? await store.childSpaces(a.sp.id) : []) { out.teamspaces = out.teamspaces || []; const t = { space: c, items: {} }; for (const k of TEAMSPACE_KINDS) t.items[k] = (await store.listItems(c.id, k, { limit: 5000 })).map((i) => i.data); out.teamspaces.push(t); }
    await audit(a.sp.id, req.user, 'data.exported', '');
    res.setHeader('Content-Disposition', `attachment; filename="${a.sp.name.replace(/[^\w-]+/g, '_')}-export.json"`); res.json(out);
  }));
  app.get('/api/spaces/:id/overview', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'admin'); if (!a) return;
    const log = await store.listItems(a.sp.id, 'audit', { since: Date.now() - 30 * 864e5, limit: 5000 });
    const byPerson = {}, byAction = {};
    for (const r of log) { byPerson[r.data.whoName || 'someone'] = (byPerson[r.data.whoName || 'someone'] || 0) + 1; const k = r.data.action.split('.')[0]; byAction[k] = (byAction[k] || 0) + 1; }
    const kids = await store.childSpaces(a.sp.id);
    let tasksDone = 0, tasksOpen = 0;
    for (const c of kids) for (const t of await store.listItems(c.id, 'task', { limit: 1000 })) t.data.status === 'done' ? tasksDone++ : tasksOpen++;
    res.json({ members: (await store.listMembers(a.sp.id)).length, teamspaces: kids.length, actions30d: log.length, byPerson, byAction, tasksDone, tasksOpen,
      approvalsWaiting: (await store.listItems(a.sp.id, 'approval', { limit: 500 })).filter((x) => x.data.status === 'waiting').length });
  }));

  // ---- share space: a link to the team's work. Private = only the team's members can open it; public = anyone with the
  // link can view it (read only). Public links show pages, the tasks board and shared AI chats - never the team chat,
  // the brain, the standards or the member list. Teamspaces inside an organization get public links only if it allows them.
  const SHARE_WHAT = ['space', 'page', 'tasks', 'chat'];
  async function publicAllowed(sp) { if (!sp.parentId) return true; const org = await store.getSpace(sp.parentId); return org?.settings?.publicShares === true; }
  async function roleIn(sp, user) {
    if (!user || !sp) return null;
    let role = await store.memberRole(sp.id, user.id);
    if (sp.parentId) { const o = await store.memberRole(sp.parentId, user.id); if (RANK[o] >= 3 && (!role || RANK[o] > RANK[role])) role = o; }
    return role || null;
  }
  const NO_PUBLIC = 'Your organization has public links turned off - make a private link (team members only), or ask an admin to allow them in Policies.';
  app.post('/api/spaces/:id/shares', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'member'); if (!a) return;
    if (a.sp.kind === 'org') return res.status(400).json({ error: 'Share links are made from a team or a teamspace.' });
    const what = SHARE_WHAT.includes(req.body?.what) ? req.body.what : null;
    if (!what) return res.status(400).json({ error: 'Pick what to share.' });
    const ref = clip(req.body?.ref, 80);
    let title = clip(req.body?.title, 120).trim();
    if (what === 'page' || what === 'chat') {
      const it = ref ? await store.getItem(a.sp.id, what === 'page' ? 'page' : 'aichat', ref) : null;
      if (!it) return res.status(404).json({ error: 'That is not in the team any more.' });
      title = title || clip(it.data.title, 120) || (what === 'page' ? 'Page' : 'AI chat');
    }
    title = title || (what === 'tasks' ? `${a.sp.name} - tasks` : a.sp.name);
    const visibility = req.body?.visibility === 'public' ? 'public' : 'private';
    if (visibility === 'public' && !(await publicAllowed(a.sp))) return res.status(403).json({ error: NO_PUBLIC });
    const token = crypto.randomBytes(18).toString('base64url'), id = hashTok(token);
    await store.putItem(a.sp.id, 'share', id, { token, what, ref, title, visibility, views: 0, by: req.user.id, byName: req.user.name || req.user.email, at: Date.now() }, req.user.id);
    await audit(a.sp.id, req.user, 'share.created', `${visibility} ${what}: ${title}`);
    res.json({ id, token, url: `/s/${token}`, visibility, title });
  }));
  app.patch('/api/spaces/:id/shares/:sid', wrap(async (req, res) => {
    const a = await access(req, res, req.params.id, 'member'); if (!a) return;
    const it = await store.getItem(a.sp.id, 'share', clip(req.params.sid, 80));
    if (!it) return res.status(404).json({ error: 'That link was turned off.' });
    if (!same(it.authorId, req.user.id) && RANK[a.role] < 3) return res.status(403).json({ error: 'Only the person who made the link, or an admin, can change it.' });
    const visibility = req.body?.visibility === 'public' ? 'public' : 'private';
    if (visibility === 'public' && !(await publicAllowed(a.sp))) return res.status(403).json({ error: NO_PUBLIC });
    await store.putItem(a.sp.id, 'share', it.id, { ...it.data, visibility }, it.authorId);
    await audit(a.sp.id, req.user, 'share.changed', `${visibility}: ${it.data.title}`);
    res.json({ ok: true, visibility });
  }));
  // what a share link shows (the /s/<token> page reads this)
  app.get('/api/share/:token', wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!store) return res.status(503).json({ error: 'Sharing is not switched on.' });
    const it = await store.findItem('share', hashTok(clip(req.params.token, 80)));
    const sp = it ? await store.getSpace(it.spaceId) : null;
    if (!it || !sp) return res.status(404).json({ error: 'This link was turned off, or it never existed.' });
    const d = it.data, role = await roleIn(sp, req.user);
    const isPublic = d.visibility === 'public' && await publicAllowed(sp);
    if (!isPublic && !role) return res.status(req.user ? 403 : 401).json({ private: true, signedIn: Boolean(req.user), space: { name: sp.name },
      error: req.user ? `This link is private - only members of ${sp.name} can open it.` : 'This link is private - sign in with an account that is in the team.' });
    const org = sp.parentId ? await store.getSpace(sp.parentId) : null;
    const m = (t, n) => { const s = clip(t, n); return org?.settings?.maskPrivate && !role ? maskPrivate(s) : s; };
    const pageOut = (p) => ({ id: p.id, title: m(p.data.title || 'Untitled', 200), body: m(p.data.body, 60000), editedAt: p.data.editedAt || p.updated, byName: p.data.lastByName || p.data.byName || '' });
    const taskOut = (t) => ({ title: m(t.data.title, 300), status: ['todo', 'doing', 'done'].includes(t.data.status) ? t.data.status : 'todo', who: clip(t.data.assigneeName, 80), estimate: clip(t.data.estimate, 40) });
    const chatOut = (c) => ({ id: c.id, title: m(c.data.title || 'AI chat', 200), byName: c.data.byName || '', at: c.data.at || c.updated,
      messages: (Array.isArray(c.data.messages) ? c.data.messages : []).slice(0, 200).map((x) => ({ role: x.role === 'user' ? 'user' : 'ai', content: m(x.content, 20000) })) });
    let content;
    if (d.what === 'page') { const p = await store.getItem(sp.id, 'page', d.ref); if (!p) return res.status(404).json({ error: 'The page behind this link was deleted.' }); content = { page: pageOut(p) }; }
    else if (d.what === 'chat') { const c = await store.getItem(sp.id, 'aichat', d.ref); if (!c) return res.status(404).json({ error: 'The chat behind this link was removed from the team.' }); content = { chat: chatOut(c) }; }
    else if (d.what === 'tasks') content = { tasks: (await store.listItems(sp.id, 'task', { limit: 300 })).map(taskOut) };
    else content = { pages: (await store.listItems(sp.id, 'page', { limit: 50 })).map(pageOut), tasks: (await store.listItems(sp.id, 'task', { limit: 300 })).map(taskOut), chats: (await store.listItems(sp.id, 'aichat', { limit: 20 })).map(chatOut) };
    if (!role) store.putItem(sp.id, 'share', it.id, { ...d, views: (Number(d.views) || 0) + 1, lastView: Date.now() }, it.authorId).catch(() => {});
    res.json({ space: { name: sp.name, id: role ? sp.id : undefined }, what: d.what, title: d.title, byName: d.byName, at: d.at, visibility: isPublic ? 'public' : 'private', member: Boolean(role), content });
  }));

  // ---- the AI connected to the team: a member's own AI chat on /team follows the team's standards and knows its brain ----
  const ctxCache = new Map();
  async function teamContext(user, spaceId, question) {
    if (!store || !user || !spaceId) return null;
    const sp = await store.getSpace(clip(spaceId, 80));
    if (!sp || sp.kind === 'org' || !(await roleIn(sp, user))) return null;
    let c = ctxCache.get(sp.id);
    if (!c || c.until < Date.now()) {
      c = { chunks: (await gather(sp)).filter((x) => x.kind !== 'rule'), rules: (await store.listItems(sp.id, 'rule', { limit: 40 })).map((r) => `- ${clip(r.data.text || r.data.title, 240)}`).join('\n'), until: Date.now() + 30000 };
      ctxCache.set(sp.id, c); if (ctxCache.size > 500) ctxCache.delete(ctxCache.keys().next().value);
    }
    const hits = rank(c.chunks, question, 3);
    const parts = [`You are working for the team "${sp.name}" - this person is one of its members.`];
    if (c.rules) parts.push(`The team's standards - follow them in everything you write or build for this team:\n${c.rules}`);
    // the matching notes go next to the question (the chat puts them there) - data, not instructions
    const notes = hits.map((h) => `- ${h.kind} "${clip(h.title, 100)}": ${clip(h.text, 600)}`).join('\n');
    const org = sp.parentId ? await store.getSpace(sp.parentId) : null;
    const mask = (t) => (org?.settings?.maskPrivate ? maskPrivate(t) : t);
    return { name: sp.name, text: mask(parts.join('\n\n')), notes: mask(notes) };
  }

  // ---- the organization's rules for its members' AI use (used by the chat) ----
  const policyCache = new Map();
  async function policyFor(user) {
    if (!user || !store) return null;
    const hit = policyCache.get(user.id); if (hit && hit.until > Date.now()) return hit.p;
    const orgs = (await store.listSpaces(user.id)).filter((s) => s.kind === 'org');
    const p = orgs.length ? { orgs: orgs.map((o) => o.id), disabledTools: [...new Set(orgs.flatMap((o) => o.settings?.disabledTools || []))], maskPrivate: orgs.some((o) => o.settings?.maskPrivate),
      agentMode: orgs.some((o) => o.settings?.agentMode === 'readonly') ? 'readonly' : orgs.some((o) => o.settings?.agentMode === 'ask') ? 'ask' : 'auto', protectedPaths: [...new Set(orgs.flatMap((o) => o.settings?.protectedPaths || []))],
      instructions: orgs.map((o) => o.settings?.instructions).filter(Boolean).join('\n') } : null;
    policyCache.set(user.id, { p, until: Date.now() + 60000 });
    return p;
  }
  // retention: chat messages older than the organization's limit are deleted (run by the server's tick)
  async function applyRetention() {
    // only organizations keep a retention setting; their teamspaces follow it
    for (const sp of (await store.allOrgs?.()) || []) {
      const days = Number(sp.settings?.retentionDays) || 0; if (!days) continue;
      for (const c of await store.childSpaces(sp.id)) await store.deleteItemsBefore(c.id, 'message', Date.now() - days * 864e5);
    }
  }
  return { policyFor, audit, applyRetention, teamContext };
}
