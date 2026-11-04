// Even more plugins (same rules as apps.js / apps-more.js): each person pastes their OWN key; it stays in their
// browser and only comes with each request. Only each service's official API host is called.
// Razorpay can also CREATE a payment link - that always waits for the person's button in the chat.
// Every read returns { title, items: [{ title, sub, url, at }] }.

const UA = 'CodeConClave-AI';
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const need = (v, re, msg) => { const s = clip(v, 300); if (!re.test(s)) throw bad(msg); return s; };
const basic = (a, b) => `Basic ${Buffer.from(`${a}:${b}`).toString('base64')}`;
const at = (v) => { const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v); return Number.isFinite(t) ? t : undefined; };
const inr = (paise, cur = 'INR') => `${cur === 'INR' ? '₹' : `${cur} `}${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const list = (v) => String(v || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean).slice(0, 10);

async function api(url, { headers = {}, method = 'GET', body, form, ms = 15000 } = {}) {
  const r = await fetch(url, { method, headers: { 'User-Agent': UA, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...headers },
    body: body ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined, signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw bad('The service refused the key - check it is right and has access.');
    if (r.status === 404) throw bad('Not found - check the name or id you typed.');
    const why = data?.error?.description || data?.message || data?.error?.message || data?.errors?.[0]?.message || data?.detail || (typeof data?.error === 'string' ? data.error : '');
    throw Object.assign(new Error(`The service said no (error ${r.status})${why ? `: ${clip(why, 160)}` : ''}.`), { status: 502 });
  }
  return data;
}

export const EXTRA_APPS = {
  razorpay: {
    config: (c) => ({ id: need(c.id, /^rzp_(live|test)_[A-Za-z0-9]{8,24}$/, 'The Razorpay Key Id starts with rzp_live_ or rzp_test_.'), secret: need(c.secret, /^[A-Za-z0-9]{12,48}$/, 'Paste the Key Secret Razorpay showed you (letters and numbers).') }),
    read: {
      async payments(c) { const d = await api('https://api.razorpay.com/v1/payments?count=15', { headers: { Authorization: basic(c.id, c.secret) } });
        return { title: 'Your latest Razorpay payments', items: (d.items || []).map((p) => ({ title: `${inr(p.amount, p.currency)} · ${p.status}`, sub: [p.method, p.email, p.contact].filter(Boolean).join(' · '), at: at(p.created_at) })) }; },
      async links(c) { const d = await api('https://api.razorpay.com/v1/payment_links', { headers: { Authorization: basic(c.id, c.secret) } });
        return { title: 'Your Razorpay payment links', items: (d.payment_links || []).slice(0, 20).map((l) => ({ title: `${inr(l.amount, l.currency)} · ${clip(l.description, 80) || 'payment link'}`, sub: l.status, url: l.short_url, at: at(l.created_at) })) }; },
      async settlements(c) { const d = await api('https://api.razorpay.com/v1/settlements?count=10', { headers: { Authorization: basic(c.id, c.secret) } });
        return { title: 'Your Razorpay settlements', items: (d.items || []).map((s) => ({ title: `${inr(s.amount)} · ${s.status}`, sub: s.utr ? `UTR ${s.utr}` : '', at: at(s.created_at) })) }; },
    },
    write: {
      async create_link(c, a) {
        const rupees = Number(String(a.amount ?? '').replace(/[^\d.]/g, ''));
        if (!(rupees >= 1 && rupees <= 500000)) throw bad('Type the amount in rupees (1 to 5,00,000).');
        const description = clip(a.description, 200) || 'Payment';
        const customer = {}; if (clip(a.name, 80)) customer.name = clip(a.name, 80); if (/^\S+@\S+\.\S+$/.test(clip(a.email, 120))) customer.email = clip(a.email, 120); if (/^\+?\d{10,13}$/.test(clip(a.contact, 20).replace(/\s/g, ''))) customer.contact = clip(a.contact, 20).replace(/\s/g, '');
        const d = await api('https://api.razorpay.com/v1/payment_links', { method: 'POST', headers: { Authorization: basic(c.id, c.secret) },
          body: { amount: Math.round(rupees * 100), currency: 'INR', description, ...(Object.keys(customer).length ? { customer } : {}), notify: { sms: false, email: false }, reminder_enable: false } });
        return { text: `Payment link for ₹${rupees.toLocaleString('en-IN')} created${c.id.startsWith('rzp_test_') ? ' (test mode)' : ''}.`, url: d.short_url };
      },
    },
  },
  render: {
    config: (c) => ({ key: need(c.key, /^rnd_[A-Za-z0-9]{16,}$/, 'A Render API key starts with rnd_') }),
    read: {
      async services(c) { const d = await api('https://api.render.com/v1/services?limit=20', { headers: { Authorization: `Bearer ${c.key}` } });
        return { title: 'Your Render services', items: (d || []).map((x) => x.service || x).map((s) => ({ title: clip(s.name, 120), sub: [s.type, s.suspended === 'suspended' ? 'suspended' : 'running', s.serviceDetails?.url].filter(Boolean).join(' · '), url: s.dashboardUrl || s.serviceDetails?.url, at: at(s.updatedAt) })) }; },
    },
  },
  cloudflare: {
    config: (c) => ({ token: need(c.token, /^[\w-]{30,80}$/, 'Paste a Cloudflare API token (about 40 letters and numbers).') }),
    read: {
      async zones(c) { const d = await api('https://api.cloudflare.com/client/v4/zones?per_page=30', { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: 'Your Cloudflare sites', items: (d.result || []).map((z) => ({ title: z.name, sub: [z.status, z.plan?.name].filter(Boolean).join(' · '), url: `https://dash.cloudflare.com/${z.account?.id || ''}/${z.name}`, at: at(z.modified_on) })) }; },
      async workers(c) { const acc = await api('https://api.cloudflare.com/client/v4/accounts?per_page=5', { headers: { Authorization: `Bearer ${c.token}` } });
        const id = acc.result?.[0]?.id; if (!id) throw bad('That token cannot see any Cloudflare account.');
        const d = await api(`https://api.cloudflare.com/client/v4/accounts/${id}/workers/scripts`, { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: 'Your Cloudflare Workers', items: (d.result || []).slice(0, 30).map((w) => ({ title: w.id, sub: w.modified_on ? `changed ${w.modified_on.slice(0, 10)}` : '', url: `https://dash.cloudflare.com/${id}/workers/services/view/${w.id}`, at: at(w.modified_on) })) }; },
    },
  },
  supabase: {
    config: (c) => ({ token: need(c.token, /^sbp_[a-f0-9]{30,}$/, 'A Supabase access token starts with sbp_') }),
    read: {
      async projects(c) { const d = await api('https://api.supabase.com/v1/projects', { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: 'Your Supabase projects', items: (d || []).map((p) => ({ title: clip(p.name, 120), sub: [p.status, p.region].filter(Boolean).join(' · '), url: `https://supabase.com/dashboard/project/${p.id || p.ref}`, at: at(p.created_at) })) }; },
    },
  },
  huggingface: {
    config: (c) => ({ token: need(c.token, /^hf_[A-Za-z0-9]{20,}$/, 'A Hugging Face token starts with hf_') }),
    read: {
      async models(c) { const me = await api('https://huggingface.co/api/whoami-v2', { headers: { Authorization: `Bearer ${c.token}` } });
        const d = await api(`https://huggingface.co/api/models?author=${encodeURIComponent(me.name)}&limit=30&sort=lastModified`, { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: `Your Hugging Face models (${me.name})`, items: (d || []).map((m) => ({ title: m.id, sub: [`${m.downloads || 0} downloads`, `${m.likes || 0} likes`, m.private ? 'private' : ''].filter(Boolean).join(' · '), url: `https://huggingface.co/${m.id}`, at: at(m.lastModified) })) }; },
      async spaces(c) { const me = await api('https://huggingface.co/api/whoami-v2', { headers: { Authorization: `Bearer ${c.token}` } });
        const d = await api(`https://huggingface.co/api/spaces?author=${encodeURIComponent(me.name)}&limit=30`, { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: `Your Hugging Face Spaces (${me.name})`, items: (d || []).map((s) => ({ title: s.id, sub: `${s.likes || 0} likes`, url: `https://huggingface.co/spaces/${s.id}`, at: at(s.lastModified) })) }; },
    },
  },
  kaggle: {
    config: (c) => ({ user: need(c.user, /^[A-Za-z0-9][\w-]{1,40}$/, 'Type your Kaggle username.'), key: need(c.key, /^[a-f0-9]{32}$/, 'The Kaggle API key is 32 letters and numbers (from kaggle.json).') }),
    read: {
      async notebooks(c) { const d = await api(`https://www.kaggle.com/api/v1/kernels/list?user=${encodeURIComponent(c.user)}&pageSize=20&sortBy=dateRun`, { headers: { Authorization: basic(c.user, c.key) } });
        return { title: 'Your Kaggle notebooks', items: (d || []).map((k) => ({ title: clip(k.title || k.ref, 140), sub: [k.lastRunTime ? `ran ${String(k.lastRunTime).slice(0, 10)}` : '', `${k.totalVotes || 0} votes`].filter(Boolean).join(' · '), url: `https://www.kaggle.com/code/${k.ref}`, at: at(k.lastRunTime) })) }; },
      async datasets(c) { const d = await api(`https://www.kaggle.com/api/v1/datasets/list?user=${encodeURIComponent(c.user)}`, { headers: { Authorization: basic(c.user, c.key) } });
        return { title: 'Your Kaggle datasets', items: (d || []).slice(0, 20).map((x) => ({ title: clip(x.title || x.ref, 140), sub: `${x.downloadCount || 0} downloads`, url: `https://www.kaggle.com/datasets/${x.ref}`, at: at(x.lastUpdated) })) }; },
    },
  },
  uptimerobot: {
    config: (c) => ({ key: need(c.key, /^[\w-]{20,80}$/, 'Paste your UptimeRobot API key (Main API key or read-only key).') }),
    read: {
      async monitors(c) { const d = await api('https://api.uptimerobot.com/v2/getMonitors', { method: 'POST', form: { api_key: c.key, format: 'json' } });
        if (d?.stat === 'fail') throw bad(d.error?.message || 'UptimeRobot refused the key.');
        const st = { 0: 'paused', 1: 'not checked yet', 2: 'up ✓', 8: 'seems down', 9: 'DOWN' };
        return { title: 'Your websites (UptimeRobot)', items: (d.monitors || []).map((m) => ({ title: clip(m.friendly_name, 120), sub: `${st[m.status] || m.status} · ${clip(m.url, 100)}`, url: m.url })) }; },
    },
  },
  dockerhub: {
    config: (c) => ({ user: need(c.user, /^[a-z0-9][a-z0-9_.-]{1,40}$/, 'Type your Docker Hub username (or any public account).') }),
    read: {
      async repos(c) { const d = await api(`https://hub.docker.com/v2/repositories/${encodeURIComponent(c.user)}/?page_size=25`);
        return { title: `Docker Hub images of ${c.user}`, items: (d.results || []).map((r) => ({ title: `${r.namespace}/${r.name}`, sub: `${r.pull_count || 0} pulls · ${r.star_count || 0} stars`, url: `https://hub.docker.com/r/${r.namespace}/${r.name}`, at: at(r.last_updated) })) }; },
    },
  },
  npm: {
    config: (c) => { const p = list(c.packages); if (!p.length || p.some((x) => !/^(@[\w.-]+\/)?[\w.-]{1,100}$/.test(x))) throw bad('Type npm package names, separated by commas (like express, react).'); return { packages: p.join(',') }; },
    read: {
      async packages(c) {
        const got = await Promise.allSettled(c.packages.split(',').map(async (p) => {
          const [info, dl] = await Promise.all([api(`https://registry.npmjs.org/${p.replace('/', '%2F')}/latest`), api(`https://api.npmjs.org/downloads/point/last-week/${p}`).catch(() => null)]);
          return { title: `${p} ${info.version}`, sub: `${(dl?.downloads || 0).toLocaleString('en-IN')} downloads last week`, url: `https://www.npmjs.com/package/${p}` }; }));
        return { title: 'Your npm packages', items: got.filter((g) => g.status === 'fulfilled').map((g) => g.value) }; },
    },
  },
  pypi: {
    config: (c) => { const p = list(c.packages); if (!p.length || p.some((x) => !/^[A-Za-z0-9][\w.-]{0,100}$/.test(x))) throw bad('Type PyPI package names, separated by commas (like requests, numpy).'); return { packages: p.join(',') }; },
    read: {
      async packages(c) {
        const got = await Promise.allSettled(c.packages.split(',').map(async (p) => {
          const [info, dl] = await Promise.all([api(`https://pypi.org/pypi/${encodeURIComponent(p)}/json`), api(`https://pypistats.org/api/packages/${encodeURIComponent(p.toLowerCase())}/recent`).catch(() => null)]);
          return { title: `${info.info?.name || p} ${info.info?.version || ''}`, sub: [clip(info.info?.summary, 90), dl?.data?.last_week != null ? `${dl.data.last_week.toLocaleString('en-IN')} downloads last week` : ''].filter(Boolean).join(' · '), url: `https://pypi.org/project/${p}/` }; }));
        return { title: 'Your PyPI packages', items: got.filter((g) => g.status === 'fulfilled').map((g) => g.value) }; },
    },
  },
  devto: {
    config: () => ({}),
    read: {
      async top() { const d = await api('https://dev.to/api/articles?top=1&per_page=15');
        return { title: 'Top on DEV today', items: (d || []).map((a) => ({ title: clip(a.title, 160), sub: `${a.user?.name || ''} · ${a.positive_reactions_count || 0} reactions`, url: a.url, at: at(a.published_at) })) }; },
    },
  },
  producthunt: {
    config: (c) => ({ token: need(c.token, /^[\w-]{30,80}$/, 'Paste your Product Hunt developer token.') }),
    read: {
      async today(c) { const d = await api('https://api.producthunt.com/v2/api/graphql', { method: 'POST', headers: { Authorization: `Bearer ${c.token}` }, body: { query: '{ posts(first: 15, order: VOTES) { edges { node { name tagline votesCount url } } } }' } });
        return { title: 'Top on Product Hunt', items: (d?.data?.posts?.edges || []).map((e) => ({ title: `${e.node.name} — ${clip(e.node.tagline, 90)}`, sub: `${e.node.votesCount} votes`, url: e.node.url })) }; },
    },
  },
};
for (const a of Object.values(EXTRA_APPS)) {
  a.write = a.write || {};
  // "Save and check it works": run the main read once with the new key
  const first = Object.keys(a.read)[0];
  a.read.test = async (c, args, h) => { const r = await a.read[first](c, args, h); return { text: `Connected - ${r.items.length} item${r.items.length === 1 ? '' : 's'} found.` }; };
}
