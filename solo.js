// SOLO tools - for one person building alone: Founder Mode (an outcome -> brief, plan, tasks, data, API,
// launch steps), the Solo Reviewer (ship / fix first / block release, with findings) and a Launch checklist
// made for their project. These belong to the person only; nothing is shared with a team.

const clip = (s, n) => String(s ?? '').slice(0, n);
const firstJson = (s) => { const t = String(s || ''), a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; } };
const arr = (v, n, m = 300) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => (typeof x === 'string' ? clip(x, m) : x));

export function registerSolo(app, { wrap, engineAsk, overLimit }) {
  const ask = async (system, user, max = 2200) => firstJson(await engineAsk([{ role: 'system', content: `${system}\nReply with JSON only.` }, { role: 'user', content: user }], { engine: 'chat', max, temperature: 0.3, ms: 90000 }));

  app.post('/api/solo/brief', wrap(async (req, res) => {
    const idea = clip(req.body?.idea, 3000).trim();
    if (idea.length < 8) return res.status(400).json({ error: 'Describe what you want to build or achieve.' });
    if (await overLimit(req, res)) return;
    let j = null;
    for (let i = 0; i < 2 && !j?.title; i++) {
      j = await ask(`You are CodeConClave AI in Founder Mode: a senior product lead + architect for a solo builder. Turn the outcome into a real plan.
{"title":"…","oneLiner":"…","users":["who it is for"],"problem":"…","features":["must-have features, max 8"],"plan":["build steps in order, max 8"],"tasks":["small tasks to do, max 12"],"data":[{"table":"…","fields":["name type"]}],"api":[{"method":"GET|POST|PUT|DELETE","path":"/…","purpose":"…"}],"stack":"recommended stack in one line","risks":["max 4"],"launch":["launch steps, max 8"]}`, idea).catch(() => null);
    }
    if (!j?.title) return res.status(502).json({ error: 'I could not make the plan this time — please try again.' });
    res.json({ title: clip(j.title, 120), oneLiner: clip(j.oneLiner, 300), users: arr(j.users, 5), problem: clip(j.problem, 600), features: arr(j.features, 8), plan: arr(j.plan, 8), tasks: arr(j.tasks, 12),
      data: arr(j.data, 8).filter((d) => d && d.table).map((d) => ({ table: clip(d.table, 60), fields: arr(d.fields, 12, 80) })), api: arr(j.api, 12).filter((x) => x && x.path).map((x) => ({ method: clip(x.method, 8), path: clip(x.path, 100), purpose: clip(x.purpose, 160) })),
      stack: clip(j.stack, 200), risks: arr(j.risks, 4), launch: arr(j.launch, 8) });
  }));

  app.post('/api/solo/review', wrap(async (req, res) => {
    const files = (Array.isArray(req.body?.files) ? req.body.files : []).filter((f) => f && typeof f.text === 'string').slice(0, 25);
    let budget = 45000;
    const parts = [];
    for (const f of files) { if (budget <= 0) break; const t = clip(f.text, Math.min(budget, 15000)); budget -= t.length; parts.push(`=== ${clip(f.path || 'file', 200)}\n${t}`); }
    const code = clip(req.body?.code, 40000);
    if (!parts.length && code.trim().length < 20) return res.status(400).json({ error: 'Paste code or connect a folder to review.' });
    if (await overLimit(req, res)) return;
    const j = await ask(`You are CodeConClave AI as a strict senior reviewer for a solo developer. Check security (secrets, injection, auth), bugs and edge cases, error handling, performance (N+1, leaks), accessibility, mobile layout, and tests. Be specific and honest; do not invent problems.
{"verdict":"ship|fix|block","summary":"2-3 lines","findings":[{"severity":"high|medium|low","area":"security|bug|performance|accessibility|tests|quality","file":"path or empty","issue":"…","fix":"…"}],"good":["things done well, max 3"]}
verdict: ship = no real problems; fix = fix before release; block = serious risk (security hole, data loss, crash).`, parts.length ? parts.join('\n\n') : code, 2600).catch(() => null);
    if (!j?.verdict) return res.status(502).json({ error: 'The review did not finish — please try again.' });
    res.json({ verdict: ['ship', 'fix', 'block'].includes(j.verdict) ? j.verdict : 'fix', summary: clip(j.summary, 600),
      findings: arr(j.findings, 25).filter((f) => f && f.issue).map((f) => ({ severity: ['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium', area: clip(f.area, 20), file: clip(f.file, 200), issue: clip(f.issue, 500), fix: clip(f.fix, 700) })),
      good: arr(j.good, 3), reviewed: parts.length ? files.map((f) => f.path).slice(0, parts.length) : ['pasted code'] });
  }));

  app.post('/api/solo/checklist', wrap(async (req, res) => {
    const project = clip(req.body?.project, 1500).trim() || 'a web app';
    const j = await ask('You are CodeConClave AI helping a solo founder launch. Make a launch checklist for THEIR project, grouped. {"groups":[{"name":"Setup|Quality|Security|Growth|Legal|After launch","items":["short, concrete steps"]}]} Max 6 groups, 6 items each. Include domain and hosting, SEO basics, analytics, error monitoring, backups, privacy policy and terms, payments if they sell, email deliverability, app store rules if it is a mobile app, and security hardening.', project, 1600).catch(() => null);
    if (!j?.groups) return res.status(502).json({ error: 'I could not make the checklist — please try again.' });
    res.json({ project, groups: arr(j.groups, 6).filter((g) => g && g.name).map((g) => ({ name: clip(g.name, 40), items: arr(g.items, 6, 200) })) });
  }));
}
