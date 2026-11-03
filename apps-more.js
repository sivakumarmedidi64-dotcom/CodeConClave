// More app plugins (same rules as apps.js): each person pastes their own token; it stays in their browser
// and only comes with each request. Only each app's official API host is called (user-typed hosts go
// through fetchPublicPage's private-address guard). These only READ - nothing is created or changed.
// Every action returns { title, items: [{ title, sub, url, at }] }.

const UA = 'CodeConClave-AI';
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const need = (v, re, msg) => { const s = clip(v, 300); if (!re.test(s)) throw bad(msg); return s; };
const basic = (a, b) => `Basic ${Buffer.from(`${a}:${b}`).toString('base64')}`;
const at = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : undefined; };

async function api(url, { headers = {}, method = 'GET', body, ms = 15000 } = {}) {
  const r = await fetch(url, { method, headers: { 'User-Agent': UA, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw bad('The app refused the key - check it is right and has access.');
    const why = data?.message || data?.error?.message || data?.errors?.[0]?.message || data?.detail || (typeof data?.error === 'string' ? data.error : '');
    throw Object.assign(new Error(`The app said no (error ${r.status})${why ? `: ${clip(why, 160)}` : ''}.`), { status: 502 });
  }
  return data;
}
const pubJson = async (h, url) => { const t = await h.fetchPublicPage(url); try { return JSON.parse(t); } catch { throw bad('That address did not answer with data.'); } };

export const MORE_APPS = {
  trello: {
    config: (c) => ({ key: need(c.key, /^[0-9a-f]{32}$/i, 'The Trello API key is 32 letters and numbers.'), token: need(c.token, /^[\w-]{40,}$/, 'Paste your Trello token (a long code).') }),
    read: {
      async cards(c) { const d = await api(`https://api.trello.com/1/members/me/cards?key=${c.key}&token=${c.token}&filter=open`);
        return { title: 'Your Trello cards', items: (d || []).slice(0, 30).map((x) => ({ title: clip(x.name, 160), sub: x.due ? `due ${x.due.slice(0, 10)}` : '', url: x.shortUrl, at: at(x.dateLastActivity) })) }; },
      async boards(c) { const d = await api(`https://api.trello.com/1/members/me/boards?key=${c.key}&token=${c.token}&filter=open`);
        return { title: 'Your Trello boards', items: (d || []).map((x) => ({ title: clip(x.name, 160), url: x.shortUrl, at: at(x.dateLastActivity) })) }; },
    },
  },
  clickup: {
    config: (c) => ({ token: need(c.token, /^pk_[\w-]{20,}$/, 'A ClickUp personal token starts with pk_') }),
    read: {
      async tasks(c) {
        const h = { Authorization: c.token };
        const [u, t] = await Promise.all([api('https://api.clickup.com/api/v2/user', { headers: h }), api('https://api.clickup.com/api/v2/team', { headers: h })]);
        const team = t?.teams?.[0]; if (!team) return { title: 'Your ClickUp tasks', items: [] };
        const d = await api(`https://api.clickup.com/api/v2/team/${team.id}/task?assignees[]=${u.user.id}&subtasks=true&order_by=due_date`, { headers: h });
        return { title: 'Your ClickUp tasks', items: (d.tasks || []).slice(0, 30).map((x) => ({ title: clip(x.name, 160), sub: [x.status?.status, x.due_date ? `due ${new Date(Number(x.due_date)).toISOString().slice(0, 10)}` : ''].filter(Boolean).join(' · '), url: x.url })) };
      },
    },
  },
  airtable: {
    config: (c) => ({ token: need(c.token, /^pat[\w.]{20,}$/, 'An Airtable personal access token starts with pat'), base: need(c.base, /^app\w{10,}$/, 'The base id starts with app (it is in the base\'s link).'), table: need(c.table, /^.{1,80}$/, 'Type the table name.') }),
    read: {
      async records(c) { const d = await api(`https://api.airtable.com/v0/${c.base}/${encodeURIComponent(c.table)}?maxRecords=25`, { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: `Airtable: ${c.table}`, items: (d.records || []).map((r) => { const v = Object.values(r.fields || {}).map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))); return { title: clip(v[0] || '(empty)', 160), sub: clip(v.slice(1, 4).join(' · '), 140) }; }) }; },
    },
  },
  sheets: {
    config: (c) => ({ url: need(c.url, /^https:\/\/\S+$/, 'Paste the sheet\'s published CSV link (File → Share → Publish to web → CSV).') }),
    read: {
      async rows(c, _a, h) {
        const text = await h.fetchPublicPage(c.url.replace(/\/edit.*$/, '/export?format=csv'));
        if (/<html/i.test(text.slice(0, 200))) throw bad('That link gave a web page, not a sheet - publish it as CSV (File → Share → Publish to web).');
        const rows = text.split(/\r?\n/).filter(Boolean).map((l) => l.split(',').map((x) => x.replace(/^"|"$/g, '').trim()));
        const head = rows.shift() || [];
        return { title: `Your sheet (${rows.length} rows)`, items: rows.slice(0, 30).map((r) => ({ title: clip(r[0], 120), sub: clip(r.slice(1, 5).map((v, i) => `${head[i + 1] || ''} ${v}`.trim()).join(' · '), 160) })) };
      },
    },
  },
  youtube: {
    config: (c) => ({ key: need(c.key, /^AIza[\w-]{30,}$/, 'A YouTube (Google) API key starts with AIza') }),
    read: {
      async search(c, a) { const q = clip(a.query || 'trending', 120);
        const d = await api(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(q)}&key=${c.key}`);
        return { title: `YouTube videos: ${q}`, items: (d.items || []).map((x) => ({ title: clip(x.snippet?.title, 160), sub: `${x.snippet?.channelTitle || ''} · ${String(x.snippet?.publishedAt || '').slice(0, 10)}`, url: `https://www.youtube.com/watch?v=${x.id?.videoId}`, at: at(x.snippet?.publishedAt) })) }; },
    },
  },
  monday: {
    config: (c) => ({ token: need(c.token, /^ey[\w.-]{40,}$/, 'Paste your monday.com API token (Profile → Developers → My access tokens).') }),
    read: {
      async items(c) { const d = await api('https://api.monday.com/v2', { method: 'POST', headers: { Authorization: c.token, 'API-Version': '2024-10' }, body: { query: '{ boards(limit:5, order_by: used_at){ name items_page(limit:8){ items { name state updated_at } } } }' } });
        return { title: 'Your monday.com items', items: (d?.data?.boards || []).flatMap((b) => (b.items_page?.items || []).map((x) => ({ title: clip(x.name, 160), sub: b.name, at: at(x.updated_at) }))).slice(0, 30) }; },
    },
  },
  hubspot: {
    config: (c) => ({ token: need(c.token, /^pat-[\w-]{20,}$/, 'A HubSpot private app token starts with pat-') }),
    read: {
      async deals(c) { const d = await api('https://api.hubapi.com/crm/v3/objects/deals?limit=20&properties=dealname,amount,dealstage,closedate', { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: 'Your HubSpot deals', items: (d.results || []).map((x) => ({ title: clip(x.properties?.dealname, 160), sub: [x.properties?.amount && `₹/$ ${x.properties.amount}`, x.properties?.dealstage].filter(Boolean).join(' · '), at: at(x.updatedAt) })) }; },
      async contacts(c) { const d = await api('https://api.hubapi.com/crm/v3/objects/contacts?limit=20&properties=firstname,lastname,email,company', { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: 'Your HubSpot contacts', items: (d.results || []).map((x) => ({ title: clip(`${x.properties?.firstname || ''} ${x.properties?.lastname || ''}`.trim() || x.properties?.email, 120), sub: [x.properties?.email, x.properties?.company].filter(Boolean).join(' · '), at: at(x.updatedAt) })) }; },
    },
  },
  stripe: {
    config: (c) => ({ key: need(c.key, /^(rk|sk)_(live|test)_\w{20,}$/, 'Use a Stripe restricted key (rk_live_… with read access) - never your full secret key if you can avoid it.') }),
    read: {
      async payments(c) { const d = await api('https://api.stripe.com/v1/charges?limit=15', { headers: { Authorization: basic(c.key, '') } });
        return { title: 'Your latest Stripe payments', items: (d.data || []).map((x) => ({ title: `${(x.amount / 100).toFixed(2)} ${String(x.currency).toUpperCase()} · ${x.status}${x.refunded ? ' · refunded' : ''}`, sub: clip(x.billing_details?.email || x.description || '', 120), at: x.created * 1000 })) }; },
      async balance(c) { const d = await api('https://api.stripe.com/v1/balance', { headers: { Authorization: basic(c.key, '') } });
        const fmt = (l) => (l || []).map((b) => `${(b.amount / 100).toFixed(2)} ${String(b.currency).toUpperCase()}`).join(', ') || '0';
        return { title: 'Your Stripe balance', items: [{ title: `Available: ${fmt(d.available)}` }, { title: `Pending: ${fmt(d.pending)}` }] }; },
    },
  },
  shopify: {
    config: (c) => ({ shop: need(String(c.shop || '').replace(/^https?:\/\//, '').replace(/\.myshopify\.com.*$/, ''), /^[a-z0-9][a-z0-9-]{1,60}$/, 'Type your shop name, like mystore (from mystore.myshopify.com).'), token: need(c.token, /^shpat_\w{20,}$/, 'A Shopify Admin API token starts with shpat_') }),
    read: {
      async orders(c) { const d = await api(`https://${c.shop}.myshopify.com/admin/api/2025-07/orders.json?limit=15&status=any`, { headers: { 'X-Shopify-Access-Token': c.token } });
        return { title: 'Your latest Shopify orders', items: (d.orders || []).map((o) => ({ title: `${o.name} · ${o.total_price} ${o.currency}`, sub: [o.financial_status, o.fulfillment_status || 'unfulfilled', o.customer?.first_name].filter(Boolean).join(' · '), at: at(o.created_at) })) }; },
      async products(c) { const d = await api(`https://${c.shop}.myshopify.com/admin/api/2025-07/products.json?limit=20`, { headers: { 'X-Shopify-Access-Token': c.token } });
        return { title: 'Your Shopify products', items: (d.products || []).map((p) => ({ title: clip(p.title, 140), sub: `${p.status} · ${p.variants?.[0]?.price || ''}`, at: at(p.updated_at) })) }; },
    },
  },
  wordpress: {
    config: (c) => ({ site: need(String(c.site || '').replace(/\/+$/, ''), /^https:\/\/[\w.-]+\.[a-z]{2,}(\/[\w./-]*)?$/i, 'Type your site, like https://myblog.com') }),
    read: {
      async posts(c, _a, h) { const d = await pubJson(h, `${c.site}/wp-json/wp/v2/posts?per_page=12&_fields=title,link,date,status`);
        return { title: 'Latest posts on your site', items: (Array.isArray(d) ? d : []).map((p) => ({ title: clip(p.title?.rendered?.replace(/<[^>]+>/g, ''), 160), url: p.link, at: at(p.date) })) }; },
    },
  },
  gitlab: {
    config: (c) => ({ token: need(c.token, /^glpat-[\w-]{20,}$/, 'A GitLab personal access token starts with glpat-') }),
    read: {
      async issues(c) { const d = await api('https://gitlab.com/api/v4/issues?scope=assigned_to_me&state=opened&per_page=20', { headers: { 'PRIVATE-TOKEN': c.token } });
        return { title: 'Your open GitLab issues', items: (d || []).map((x) => ({ title: `#${x.iid} ${clip(x.title, 140)}`, sub: x.references?.full || '', url: x.web_url, at: at(x.updated_at) })) }; },
      async mrs(c) { const d = await api('https://gitlab.com/api/v4/merge_requests?scope=assigned_to_me&state=opened&per_page=20', { headers: { 'PRIVATE-TOKEN': c.token } });
        return { title: 'Your open merge requests', items: (d || []).map((x) => ({ title: `!${x.iid} ${clip(x.title, 140)}`, sub: x.references?.full || '', url: x.web_url, at: at(x.updated_at) })) }; },
    },
  },
  vercel: {
    config: (c) => ({ token: need(c.token, /^[\w-]{20,}$/, 'Paste a Vercel token (Account Settings → Tokens).') }),
    read: {
      async deployments(c) { const d = await api('https://api.vercel.com/v6/deployments?limit=12', { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: 'Your latest Vercel deployments', items: (d.deployments || []).map((x) => ({ title: `${x.name} · ${x.state || x.readyState}`, sub: x.url, url: x.url ? `https://${x.url}` : '', at: x.created })) }; },
    },
  },
  netlify: {
    config: (c) => ({ token: need(c.token, /^[\w-]{30,}$/, 'Paste a Netlify personal access token (User settings → Applications).') }),
    read: {
      async sites(c) { const d = await api('https://api.netlify.com/api/v1/sites?per_page=20', { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: 'Your Netlify sites', items: (d || []).map((x) => ({ title: x.name, sub: [x.published_deploy?.state, x.ssl_url].filter(Boolean).join(' · '), url: x.ssl_url || x.url, at: at(x.updated_at) })) }; },
    },
  },
  sentry: {
    config: (c) => ({ token: need(c.token, /^(sntrys_|sntryu_)?[\w-]{30,}$/, 'Paste a Sentry auth token.'), org: need(c.org, /^[\w-]{2,60}$/, 'Type your Sentry organization slug.') }),
    read: {
      async issues(c) { const d = await api(`https://sentry.io/api/0/organizations/${c.org}/issues/?query=is:unresolved&limit=15`, { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: 'Unresolved Sentry issues', items: (d || []).map((x) => ({ title: clip(x.title, 160), sub: `${x.project?.slug || ''} · ${x.count} events`, url: x.permalink, at: at(x.lastSeen) })) }; },
    },
  },
  zendesk: {
    config: (c) => ({ sub: need(String(c.sub || '').replace(/\.zendesk\.com.*$/, '').replace(/^https?:\/\//, ''), /^[a-z0-9-]{2,60}$/, 'Type your Zendesk subdomain (from yourteam.zendesk.com).'), email: need(c.email, /^\S+@\S+\.\S+$/, 'Type your Zendesk email.'), token: need(c.token, /^\w{20,}$/, 'Paste your Zendesk API token.') }),
    read: {
      async tickets(c) { const d = await api(`https://${c.sub}.zendesk.com/api/v2/search.json?query=${encodeURIComponent('type:ticket status<solved')}&sort_by=updated_at&per_page=20`, { headers: { Authorization: basic(`${c.email}/token`, c.token) } });
        return { title: 'Open Zendesk tickets', items: (d.results || []).map((x) => ({ title: `#${x.id} ${clip(x.subject, 140)}`, sub: `${x.status} · ${x.priority || 'normal'}`, url: `https://${c.sub}.zendesk.com/agent/tickets/${x.id}`, at: at(x.updated_at) })) }; },
    },
  },
  freshdesk: {
    config: (c) => ({ domain: need(String(c.domain || '').replace(/\.freshdesk\.com.*$/, '').replace(/^https?:\/\//, ''), /^[a-z0-9-]{2,60}$/, 'Type your Freshdesk domain (from yourteam.freshdesk.com).'), key: need(c.key, /^\w{10,}$/, 'Paste your Freshdesk API key.') }),
    read: {
      async tickets(c) { const d = await api(`https://${c.domain}.freshdesk.com/api/v2/tickets?per_page=20&order_by=updated_at`, { headers: { Authorization: basic(c.key, 'X') } });
        const ST = { 2: 'open', 3: 'pending', 4: 'resolved', 5: 'closed' };
        return { title: 'Your Freshdesk tickets', items: (d || []).map((x) => ({ title: `#${x.id} ${clip(x.subject, 140)}`, sub: ST[x.status] || '', url: `https://${c.domain}.freshdesk.com/a/tickets/${x.id}`, at: at(x.updated_at) })) }; },
    },
  },
  intercom: {
    config: (c) => ({ token: need(c.token, /^[\w=:-]{20,}$/, 'Paste your Intercom access token.') }),
    read: {
      async conversations(c) { const d = await api('https://api.intercom.io/conversations?per_page=15', { headers: { Authorization: `Bearer ${c.token}`, 'Intercom-Version': '2.11' } });
        return { title: 'Latest Intercom conversations', items: (d.conversations || []).map((x) => ({ title: clip(x.title || x.source?.body?.replace(/<[^>]+>/g, '') || '(no subject)', 160), sub: `${x.state}${x.read ? '' : ' · unread'}`, at: (x.updated_at || 0) * 1000 })) }; },
    },
  },
  mailchimp: {
    config: (c) => ({ key: need(c.key, /^[0-9a-f]{32}-[a-z]{2}\d{1,2}$/, 'A Mailchimp API key looks like 0123…abcd-us21') }),
    read: {
      async campaigns(c) { const dc = c.key.split('-')[1];
        const d = await api(`https://${dc}.api.mailchimp.com/3.0/campaigns?count=12&sort_field=create_time&sort_dir=DESC`, { headers: { Authorization: basic('cc', c.key) } });
        return { title: 'Your Mailchimp campaigns', items: (d.campaigns || []).map((x) => ({ title: clip(x.settings?.subject_line || x.settings?.title, 160), sub: [x.status, x.report_summary ? `opens ${Math.round((x.report_summary.open_rate || 0) * 100)}%` : ''].filter(Boolean).join(' · '), url: x.long_archive_url, at: at(x.send_time || x.create_time) })) }; },
    },
  },
  calendly: {
    config: (c) => ({ token: need(c.token, /^ey[\w.-]{40,}$/, 'Paste a Calendly personal access token (Integrations → API & webhooks).') }),
    read: {
      async events(c) { const h = { Authorization: `Bearer ${c.token}` };
        const me = await api('https://api.calendly.com/users/me', { headers: h });
        const d = await api(`https://api.calendly.com/scheduled_events?user=${encodeURIComponent(me.resource.uri)}&min_start_time=${new Date().toISOString()}&sort=start_time:asc&count=15&status=active`, { headers: h });
        return { title: 'Your upcoming Calendly meetings', items: (d.collection || []).map((x) => ({ title: clip(x.name, 140), sub: new Date(x.start_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }), at: at(x.start_time) })) }; },
    },
  },
  pipedrive: {
    config: (c) => ({ token: need(c.token, /^[0-9a-f]{40}$/i, 'A Pipedrive API token is 40 letters and numbers.') }),
    read: {
      async deals(c) { const d = await api(`https://api.pipedrive.com/v1/deals?status=open&limit=20&api_token=${c.token}`);
        return { title: 'Your open Pipedrive deals', items: (d.data || []).map((x) => ({ title: clip(x.title, 140), sub: [x.formatted_value, x.person_name, x.org_name].filter(Boolean).join(' · '), at: at(x.update_time) })) }; },
    },
  },
  toggl: {
    config: (c) => ({ token: need(c.token, /^[0-9a-f]{32}$/i, 'A Toggl Track API token is 32 letters and numbers (Profile settings).') }),
    read: {
      async entries(c) { const d = await api('https://api.track.toggl.com/api/v9/me/time_entries', { headers: { Authorization: basic(c.token, 'api_token') } });
        return { title: 'Your recent time entries', items: (d || []).slice(0, 20).map((x) => ({ title: clip(x.description || '(no description)', 140), sub: x.duration > 0 ? `${Math.round(x.duration / 60)} min` : 'running now', at: at(x.start) })) }; },
    },
  },
  wakatime: {
    config: (c) => ({ key: need(c.key, /^(waka_)?[0-9a-f-]{36}$/i, 'Paste your WakaTime secret API key.') }),
    read: {
      async stats(c) { const d = await api('https://wakatime.com/api/v1/users/current/stats/last_7_days', { headers: { Authorization: basic(c.key, '') } });
        const s = d?.data || {};
        return { title: `Your coding this week: ${s.human_readable_total || 'not ready yet'}`, items: (s.languages || []).slice(0, 8).map((l) => ({ title: l.name, sub: `${l.text} · ${Math.round(l.percent)}%` })) }; },
    },
  },
  confluence: {
    config: (c) => ({ site: need(String(c.site || '').replace(/^https?:\/\//, '').replace(/\/.*$/, ''), /^[\w-]+\.atlassian\.net$/, 'Type your site, like yourteam.atlassian.net'), email: need(c.email, /^\S+@\S+\.\S+$/, 'Type your Atlassian email.'), token: need(c.token, /^[\w=-]{20,}$/, 'Paste your Atlassian API token.') }),
    read: {
      async pages(c, a) { const q = clip(a.query || '', 80);
        const cql = q ? `type=page AND text ~ "${q.replace(/"/g, '')}" ORDER BY lastmodified DESC` : 'type=page ORDER BY lastmodified DESC';
        const d = await api(`https://${c.site}/wiki/rest/api/search?limit=15&cql=${encodeURIComponent(cql)}`, { headers: { Authorization: basic(c.email, c.token) } });
        return { title: q ? `Confluence pages about "${q}"` : 'Recently changed Confluence pages', items: (d.results || []).map((x) => ({ title: clip(x.title || x.content?.title, 160), sub: clip(x.excerpt?.replace(/@@@\w*@@@/g, ''), 120), url: `https://${c.site}/wiki${x.url || ''}`, at: at(x.lastModified) })) }; },
    },
  },
  bluesky: {
    config: (c) => ({ handle: need(String(c.handle || '').replace(/^@/, ''), /^[\w.-]+\.[a-z]{2,}$/i, 'Type a Bluesky handle, like name.bsky.social') }),
    read: {
      async posts(c) { const d = await api(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(c.handle)}&limit=15`);
        return { title: `Latest from @${c.handle}`, items: (d.feed || []).map((f) => ({ title: clip(f.post?.record?.text || '(picture)', 200), sub: `${f.post?.likeCount || 0} likes`, url: `https://bsky.app/profile/${c.handle}/post/${String(f.post?.uri || '').split('/').pop()}`, at: at(f.post?.record?.createdAt) })) }; },
    },
  },
  mastodon: {
    config: (c) => { const m = String(c.account || '').trim().match(/^@?([\w.]+)@([\w.-]+\.[a-z]{2,})$/i); if (!m) throw bad('Type the account like @name@mastodon.social'); return { user: m[1], host: m[2].toLowerCase() }; },
    read: {
      async posts(c, _a, h) { const acc = await pubJson(h, `https://${c.host}/api/v1/accounts/lookup?acct=${encodeURIComponent(c.user)}`);
        const d = await pubJson(h, `https://${c.host}/api/v1/accounts/${encodeURIComponent(acc.id)}/statuses?limit=15&exclude_replies=true`);
        return { title: `Latest from @${c.user}@${c.host}`, items: (Array.isArray(d) ? d : []).map((s) => ({ title: clip(String(s.content || '').replace(/<[^>]+>/g, ' '), 200) || '(picture)', sub: `${s.favourites_count} likes`, url: s.url, at: at(s.created_at) })) }; },
    },
  },
  hackernews: {
    config: () => ({ on: true }),
    read: {
      async top() { const d = await api('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20');
        return { title: 'Top of Hacker News right now', items: (d.hits || []).map((x) => ({ title: clip(x.title, 160), sub: `${x.points} points · ${x.num_comments} comments`, url: x.url || `https://news.ycombinator.com/item?id=${x.objectID}`, at: at(x.created_at) })) }; },
    },
  },
};
for (const a of Object.values(MORE_APPS)) {
  a.write = a.write || {};
  // "Save and check it works": run the main read once with the new key
  const first = Object.keys(a.read)[0];
  a.read.test = async (c, args, h) => { const r = await a.read[first](c, args, h); return { text: `Connected - ${r.items.length} item${r.items.length === 1 ? '' : 's'} found.` }; };
}
