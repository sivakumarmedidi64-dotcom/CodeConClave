// App plugins: GitHub, Notion, Google/Outlook Calendar, Todoist, Linear, Jira, Asana and news feeds.
// Each person pastes their own token. It stays in their browser and comes with each request - it is
// never stored or logged here. Only the apps' fixed, official API hosts are called, except calendar
// and feed links, which go through the same private-address guard as shared links (fetchPublicPage).
// Reading happens right away; anything that creates something (an issue, a page, a task) is only
// called after the person checks it on its card and presses the button.

import { MORE_APPS } from './apps-more.js';

const UA = 'CodeConClave-AI';
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

async function api(url, { method = 'GET', headers = {}, body, ms = 15000 } = {}) {
  const r = await fetch(url, {
    method,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(ms),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('The app refused the token - check it is right and has access.'), { status: 400 });
    const why = data?.message || data?.error?.message || data?.errors?.[0]?.message || data?.errorMessages?.[0]
      || (data?.errors && typeof data.errors === 'object' ? Object.values(data.errors)[0] : '') || (typeof data?.error === 'string' ? data.error : '');
    throw Object.assign(new Error(`The app said no (error ${r.status})${why ? `: ${clip(why, 160)}` : ''}.`), { status: 502 });
  }
  return data;
}

// ---- Calendar (.ics) ----
const DAY = 86400000;
const IST = 'Asia/Kolkata';
function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(guess)).map((x) => [x.type, Number(x.value)]));
    return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess);
  } catch { return zonedToUtc(y, mo, d, h, mi, s, IST); } // unknown zone name (e.g. Outlook's Windows names): India time
}
function icsTime(value, params) {
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { t: zonedToUtc(+y, +mo, +d, 0, 0, 0, IST), allDay: true };
  if (z) return { t: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
  const tz = (params.match(/TZID=("?)([^;:"]+)\1/) || [])[2] || IST;
  return { t: zonedToUtc(+y, +mo, +d, +h, +mi, +s, tz), allDay: false, tz, wall: [+h, +mi, +s] };
}
function parseIcs(text) {
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (ev?.start) events.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const head = line.slice(0, i), value = line.slice(i + 1);
    const [name, ...rest] = head.split(';');
    const params = rest.join(';');
    const unesc = (v) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
    if (name === 'SUMMARY') ev.title = unesc(value);
    else if (name === 'LOCATION') ev.where = unesc(value);
    else if (name === 'UID') ev.uid = value;
    else if (name === 'STATUS') ev.status = value;
    else if (name === 'RRULE') ev.rrule = Object.fromEntries(value.split(';').map((kv) => kv.split('=')));
    else if (name === 'DTSTART') ev.start = icsTime(value, params);
    else if (name === 'DTEND') ev.end = icsTime(value, params);
    else if (name === 'RECURRENCE-ID') ev.recurrenceId = icsTime(value, params);
    else if (name === 'EXDATE') value.split(',').forEach((v) => { const x = icsTime(v, params); if (x) ev.exdates.push(x.t); });
  }
  return events;
}
const istParts = (t) => { const d = new Date(t + 330 * 60000); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay() }; };
const istDayStart = (t) => { const p = istParts(t); return Date.UTC(p.y, p.m, p.d) - 330 * 60000; };
const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
// Does a repeating event happen on this (India-time) day? Covers DAILY/WEEKLY/MONTHLY/YEARLY with
// INTERVAL, BYDAY (incl. "2MO"/"-1FR"), BYMONTHDAY, UNTIL and COUNT - what calendars really send.
function occursOn(ev, day) {
  const r = ev.rrule, start = istDayStart(ev.start.t);
  if (day < start) return false;
  const until = r.UNTIL ? icsTime(r.UNTIL, '')?.t : null;
  if (until && day > until) return false;
  const iv = Math.max(1, Number(r.INTERVAL) || 1);
  const a = istParts(ev.start.t), b = istParts(day);
  const byday = r.BYDAY ? r.BYDAY.split(',') : null;
  let hit = false;
  if (r.FREQ === 'DAILY') hit = Math.round((day - start) / DAY) % iv === 0 && (!byday || byday.includes(WD[b.wd]));
  else if (r.FREQ === 'WEEKLY') {
    const monday = (t, wd) => t - ((wd + 6) % 7) * DAY;
    const weeks = Math.round((monday(day, b.wd) - monday(start, a.wd)) / (7 * DAY));
    hit = weeks % iv === 0 && (byday ? byday.includes(WD[b.wd]) : b.wd === a.wd);
  } else if (r.FREQ === 'MONTHLY') {
    const months = (b.y - a.y) * 12 + (b.m - a.m);
    if (months % iv === 0) {
      if (r.BYMONTHDAY) hit = r.BYMONTHDAY.split(',').map(Number).includes(b.d);
      else if (byday) {
        hit = byday.some((x) => {
          const m = x.match(/^(-?\d)?(SU|MO|TU|WE|TH|FR|SA)$/);
          if (!m || WD[b.wd] !== m[2]) return false;
          if (!m[1]) return true;
          const n = Number(m[1]), dim = new Date(Date.UTC(b.y, b.m + 1, 0)).getUTCDate();
          return n > 0 ? Math.ceil(b.d / 7) === n : Math.ceil((dim - b.d + 1) / 7) === -n;
        });
      } else hit = b.d === a.d;
    }
  } else if (r.FREQ === 'YEARLY') hit = (b.y - a.y) % iv === 0 && b.m === a.m && b.d === a.d;
  if (!hit) return false;
  if (r.COUNT) { // count the earlier occurrences (capped: very old rules are treated as still running)
    let n = 0;
    for (let t = start, k = 0; t < day && k < 4000; t += DAY, k++) if (occursOn({ ...ev, rrule: { ...r, COUNT: '' } }, t)) n++;
    if (n >= Number(r.COUNT)) return false;
  }
  return true;
}
function eventsInRange(events, from, to) {
  const out = [];
  const moved = new Set(events.filter((e) => e.recurrenceId).map((e) => `${e.uid}|${istDayStart(e.recurrenceId.t)}`));
  for (const ev of events) {
    if (ev.status === 'CANCELLED') continue;
    const len = ev.end ? ev.end.t - ev.start.t : ev.start.allDay ? DAY : 3600000;
    if (!ev.rrule) {
      if (ev.start.t < to && ev.start.t + len > from) out.push({ ...ev, at: ev.start.t, len });
      continue;
    }
    for (let day = istDayStart(from); day < to; day += DAY) {
      if (!occursOn(ev, day) || moved.has(`${ev.uid}|${day}`)) continue;
      // same wall-clock time in the event's own zone (so a 9 am New York meeting follows its daylight saving)
      const p = istParts(day);
      const at = ev.start.tz ? zonedToUtc(p.y, p.m + 1, p.d, ...ev.start.wall, ev.start.tz) : day + (ev.start.t - istDayStart(ev.start.t));
      if (ev.exdates.some((x) => Math.abs(x - at) < 60000 || istDayStart(x) === day && ev.start.allDay)) continue;
      if (at < to && at + len > from) out.push({ ...ev, at, len });
    }
  }
  return out.sort((x, y) => x.at - y.at);
}
const fmtTime = (t) => new Date(t).toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' });
const fmtDay = (t) => new Date(t).toLocaleDateString('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' });

// ---- News feeds (RSS / Atom) ----
function parseFeed(xml, fallbackName) {
  const tag = (s, t) => { const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() : ''; };
  const name = tag(xml.split(/<item|<entry/i)[0], 'title') || fallbackName;
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]).slice(0, 25);
  return blocks.map((b) => {
    const href = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || tag(b, 'link');
    const when = Date.parse(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')) || 0;
    return { title: clip(tag(b, 'title'), 200), sub: name, url: /^https?:\/\//.test(href) ? href : '', at: when };
  }).filter((x) => x.title);
}

// ---- the apps ----
const ghHeaders = (c) => ({ Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
const notionHeaders = (c) => ({ Authorization: `Bearer ${c.token}`, 'Notion-Version': '2022-06-28' });
const notionId = (s) => { const m = String(s || '').replace(/-/g, '').match(/([0-9a-f]{32})(?:\?|$|#)/i) || String(s || '').replace(/-/g, '').match(/([0-9a-f]{32})/i); return m ? m[1] : ''; };
const notionTitle = (p) => {
  const t = p.object === 'database' ? p.title : Object.values(p.properties || {}).find((x) => x.type === 'title')?.title;
  return clip((t || []).map((x) => x.plain_text).join(''), 160) || 'Untitled';
};
const linearGql = (c, query, variables) => api('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: c.token }, body: { query, variables } })
  .then((d) => { if (d?.errors?.length) throw Object.assign(new Error(`Linear said: ${clip(d.errors[0].message, 160)}`), { status: 502 }); return d.data; });
const jiraBase = (c) => `https://${c.site}`;
const jiraHeaders = (c) => ({ Authorization: `Basic ${Buffer.from(`${c.email}:${c.token}`).toString('base64')}` });
const asanaHeaders = (c) => ({ Authorization: `Bearer ${c.token}` });
const asanaMe = async (c) => (await api('https://app.asana.com/api/1.0/users/me?opt_fields=name,workspaces.name', { headers: asanaHeaders(c) })).data;
const todoistTasks = (d) => (Array.isArray(d) ? d : d?.results || []);

const APPS = {
  github: {
    config(c) {
      const token = clip(c.token, 400);
      if (!/^(gh[pousr]_\w{20,}|github_pat_\w{20,})$/.test(token)) throw bad('That does not look like a GitHub token (it starts with github_pat_ or ghp_).');
      return { token };
    },
    read: {
      async test(c) { const u = await api('https://api.github.com/user', { headers: ghHeaders(c) }); return { text: `Connected to GitHub as ${u.login}.` }; },
      async repos(c) {
        const d = await api('https://api.github.com/user/repos?sort=updated&per_page=12', { headers: ghHeaders(c) });
        return { title: 'Your repositories', items: d.map((r) => ({ title: r.full_name, sub: [r.private ? 'private' : 'public', r.language, r.description && clip(r.description, 90)].filter(Boolean).join(' · '), url: r.html_url, at: Date.parse(r.pushed_at) })) };
      },
      async issues(c) {
        const d = await api('https://api.github.com/issues?filter=assigned&state=open&per_page=15', { headers: ghHeaders(c) });
        return { title: 'Open issues assigned to you', items: d.filter((x) => !x.pull_request).map((x) => ({ title: `#${x.number} ${clip(x.title, 140)}`, sub: x.repository?.full_name || '', url: x.html_url, at: Date.parse(x.updated_at) })) };
      },
      async prs(c) {
        const d = await api('https://api.github.com/search/issues?q=is%3Apr+is%3Aopen+author%3A%40me&sort=updated&per_page=15', { headers: ghHeaders(c) });
        return { title: 'Your open pull requests', items: (d.items || []).map((x) => ({ title: `#${x.number} ${clip(x.title, 140)}`, sub: x.repository_url.split('/repos/')[1] || '', url: x.html_url, at: Date.parse(x.updated_at) })) };
      },
      async notifications(c) {
        const d = await api('https://api.github.com/notifications?per_page=15', { headers: ghHeaders(c) });
        return { title: 'Your unread GitHub notifications', items: d.map((n) => ({ title: clip(n.subject?.title, 140), sub: `${n.repository?.full_name} · ${String(n.reason || '').replace(/_/g, ' ')}`, url: n.repository?.html_url, at: Date.parse(n.updated_at) })) };
      },
    },
    write: {
      async create_issue(c, a) {
        const repo = clip(a.repo, 140), title = clip(a.title, 250), body = String(a.body || '').slice(0, 20000);
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw bad('Write the repository as owner/name, like saharsh/codeconclave.');
        if (!title) throw bad('The issue needs a title.');
        const d = await api(`https://api.github.com/repos/${repo}/issues`, { method: 'POST', headers: ghHeaders(c), body: { title, body } });
        return { text: `Created issue #${d.number} in ${repo}.`, url: d.html_url };
      },
    },
  },
  notion: {
    config(c) {
      const token = clip(c.token, 300);
      if (!/^(ntn_|secret_)\w{20,}$/.test(token)) throw bad('That does not look like a Notion integration secret (it starts with ntn_ or secret_).');
      return { token, page: notionId(c.page) };
    },
    read: {
      async test(c) { const u = await api('https://api.notion.com/v1/users/me', { headers: notionHeaders(c) }); return { text: `Connected to Notion as "${u.name || 'your integration'}".` }; },
      async search(c, a) {
        const d = await api('https://api.notion.com/v1/search', { method: 'POST', headers: notionHeaders(c), body: { query: clip(a.query, 200), page_size: 12 } });
        return { title: a.query ? `Notion pages for "${clip(a.query, 60)}"` : 'Your latest Notion pages', items: (d.results || []).map((p) => ({ title: notionTitle(p), sub: p.object, url: p.url, at: Date.parse(p.last_edited_time) })) };
      },
    },
    write: {
      async add_note(c, a) {
        if (!c.page) throw bad('Add the link of the Notion page to write into (Plugins → Notion), and share that page with your integration.');
        const text = String(a.text || '').trim().slice(0, 20000);
        if (!text) throw bad('There is nothing to add.');
        const paras = text.split(/\n{2,}/).flatMap((p) => p.match(/[\s\S]{1,1900}/g) || []).slice(0, 40);
        await api(`https://api.notion.com/v1/blocks/${c.page}/children`, { method: 'PATCH', headers: notionHeaders(c),
          body: { children: paras.map((p) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: p } }] } })) } });
        return { text: 'Added to your Notion page.', url: `https://www.notion.so/${c.page}` };
      },
    },
  },
  calendar: {
    config(c) {
      const url = clip(c.url, 1500).replace(/^webcal:\/\//i, 'https://');
      if (!/^https:\/\/\S+$/.test(url)) throw bad('Paste the calendar\'s secret address (it starts with https:// and usually ends in .ics).');
      return { url };
    },
    read: {
      async test(c, _a, h) {
        const text = await h.fetchPublicPage(c.url);
        if (!/BEGIN:VCALENDAR/.test(text)) throw bad('That link did not give a calendar - use the "Secret address in iCal format".');
        return { text: `Connected - found ${parseIcs(text).length} events in your calendar.` };
      },
      async events(c, a, h) {
        const text = await h.fetchPublicPage(c.url);
        if (!/BEGIN:VCALENDAR/.test(text)) throw bad('That link did not give a calendar - use the "Secret address in iCal format".');
        const today = istDayStart(Date.now());
        const range = a.range === 'tomorrow' ? [today + DAY, today + 2 * DAY, 'tomorrow'] : a.range === 'week' ? [today, today + 7 * DAY, 'in the next 7 days'] : [today, today + DAY, 'today'];
        const list = eventsInRange(parseIcs(text), range[0], range[1]).slice(0, 30);
        return {
          title: `Your calendar ${range[2]}`,
          items: list.map((e) => ({ title: clip(e.title || '(no title)', 160),
            sub: [a.range === 'week' ? fmtDay(e.at) : '', e.start.allDay ? 'All day' : `${fmtTime(e.at)} – ${fmtTime(e.at + e.len)}`, e.where && clip(e.where, 80)].filter(Boolean).join(' · '), at: e.at })),
        };
      },
    },
    write: {},
  },
  todoist: {
    config(c) {
      const token = clip(c.token, 100);
      if (!/^[0-9a-f]{40}$/i.test(token)) throw bad('That does not look like a Todoist API token (40 letters and numbers).');
      return { token };
    },
    read: {
      async test(c) { await api('https://api.todoist.com/api/v1/projects?limit=1', { headers: { Authorization: `Bearer ${c.token}` } }); return { text: 'Connected to Todoist.' }; },
      async tasks(c) {
        const d = await api(`https://api.todoist.com/api/v1/tasks/filter?query=${encodeURIComponent('today | overdue')}&limit=30`, { headers: { Authorization: `Bearer ${c.token}` } });
        return { title: 'Your Todoist tasks for today (and overdue)', items: todoistTasks(d).map((t) => ({ title: clip(t.content, 200), sub: t.due?.string || t.due?.date || '', url: `https://app.todoist.com/app/task/${t.id}` })) };
      },
    },
    write: {
      async add_task(c, a) {
        const content = clip(a.content, 500), due = clip(a.due, 80);
        if (!content) throw bad('The task needs some words.');
        const t = await api('https://api.todoist.com/api/v1/tasks', { method: 'POST', headers: { Authorization: `Bearer ${c.token}` }, body: { content, ...(due ? { due_string: due, due_lang: 'en' } : {}) } });
        return { text: `Added to Todoist${t.due?.string ? ` (due ${t.due.string})` : ''}.`, url: `https://app.todoist.com/app/task/${t.id}` };
      },
    },
  },
  linear: {
    config(c) {
      const token = clip(c.token, 200);
      if (!/^lin_api_\w{20,}$/.test(token)) throw bad('That does not look like a Linear API key (it starts with lin_api_).');
      return { token };
    },
    read: {
      async test(c) { const d = await linearGql(c, '{ viewer { name } }'); return { text: `Connected to Linear as ${d.viewer.name}.` }; },
      async issues(c) {
        const d = await linearGql(c, '{ viewer { assignedIssues(first: 20, orderBy: updatedAt, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { identifier title url updatedAt state { name } } } } }');
        return { title: 'Your open Linear issues', items: d.viewer.assignedIssues.nodes.map((x) => ({ title: `${x.identifier} ${clip(x.title, 140)}`, sub: x.state?.name || '', url: x.url, at: Date.parse(x.updatedAt) })) };
      },
    },
    write: {
      async create_issue(c, a) {
        const title = clip(a.title, 250), description = String(a.body || '').slice(0, 20000);
        if (!title) throw bad('The issue needs a title.');
        const teams = (await linearGql(c, '{ teams(first: 1) { nodes { id key } } }')).teams.nodes;
        if (!teams.length) throw bad('Your Linear account has no team to put the issue in.');
        const d = await linearGql(c, 'mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success issue { identifier url } } }', { i: { teamId: teams[0].id, title, description } });
        return { text: `Created ${d.issueCreate.issue.identifier} in Linear.`, url: d.issueCreate.issue.url };
      },
    },
  },
  jira: {
    config(c) {
      const site = clip(c.site, 120).replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
      if (!/^[a-z0-9-]+\.atlassian\.net$/.test(site)) throw bad('The Jira site looks like yourteam.atlassian.net.');
      const email = clip(c.email, 200), token = clip(c.token, 400);
      if (!/^\S+@\S+\.\S+$/.test(email)) throw bad('Add the email you sign in to Jira with.');
      if (token.length < 20) throw bad('Paste your Atlassian API token.');
      return { site, email, token };
    },
    read: {
      async test(c) { const u = await api(`${jiraBase(c)}/rest/api/3/myself`, { headers: jiraHeaders(c) }); return { text: `Connected to Jira as ${u.displayName}.` }; },
      async issues(c) {
        const jql = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC';
        const d = await api(`${jiraBase(c)}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=20&fields=summary,status,updated`, { headers: jiraHeaders(c) });
        return { title: 'Your open Jira issues', items: (d.issues || []).map((x) => ({ title: `${x.key} ${clip(x.fields?.summary, 140)}`, sub: x.fields?.status?.name || '', url: `${jiraBase(c)}/browse/${x.key}`, at: Date.parse(x.fields?.updated) })) };
      },
    },
    write: {
      async create_issue(c, a) {
        const project = clip(a.project, 20).toUpperCase(), title = clip(a.title, 250), body = String(a.body || '').slice(0, 20000);
        if (!/^[A-Z][A-Z0-9_]{0,19}$/.test(project)) throw bad('Write the Jira project key, like CC or WEB.');
        if (!title) throw bad('The issue needs a title.');
        const description = body ? { type: 'doc', version: 1, content: body.split(/\n{2,}/).slice(0, 40).map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p.slice(0, 5000) }] })) } : undefined;
        const d = await api(`${jiraBase(c)}/rest/api/3/issue`, { method: 'POST', headers: jiraHeaders(c), body: { fields: { project: { key: project }, summary: title, issuetype: { name: 'Task' }, ...(description ? { description } : {}) } } });
        return { text: `Created ${d.key} in Jira.`, url: `${jiraBase(c)}/browse/${d.key}` };
      },
    },
  },
  asana: {
    config(c) {
      const token = clip(c.token, 300);
      if (token.length < 20 || /\s/.test(token)) throw bad('Paste your Asana personal access token.');
      return { token };
    },
    read: {
      async test(c) { const me = await asanaMe(c); return { text: `Connected to Asana as ${me.name}.` }; },
      async tasks(c) {
        const me = await asanaMe(c);
        const ws = me.workspaces?.[0]?.gid;
        if (!ws) throw bad('Your Asana account has no workspace.');
        const d = await api(`https://app.asana.com/api/1.0/tasks?assignee=me&workspace=${ws}&completed_since=now&limit=25&opt_fields=name,due_on,permalink_url,modified_at`, { headers: asanaHeaders(c) });
        return { title: 'Your open Asana tasks', items: (d.data || []).map((t) => ({ title: clip(t.name, 200), sub: t.due_on ? `due ${t.due_on}` : '', url: t.permalink_url, at: Date.parse(t.modified_at) })) };
      },
    },
    write: {
      async add_task(c, a) {
        const name = clip(a.content, 500), notes = String(a.notes || '').slice(0, 20000);
        if (!name) throw bad('The task needs some words.');
        const me = await asanaMe(c);
        const ws = me.workspaces?.[0]?.gid;
        if (!ws) throw bad('Your Asana account has no workspace.');
        const d = await api('https://app.asana.com/api/1.0/tasks', { method: 'POST', headers: asanaHeaders(c), body: { data: { name, notes, assignee: 'me', workspace: ws } } });
        return { text: 'Added to Asana.', url: d.data?.permalink_url };
      },
    },
  },
  feeds: {
    config(c) {
      const urls = String(c.urls || '').split(/[\s,]+/).map((u) => u.trim()).filter(Boolean).slice(0, 6);
      if (!urls.length || urls.some((u) => !/^https:\/\/\S+$/.test(u))) throw bad('Paste one or more feed links that start with https://');
      return { urls: urls.join('\n') };
    },
    read: {
      async test(c, a, h) { const r = await APPS.feeds.read.latest(c, a, h); return { text: `Connected - ${r.items.length} recent stories found.` }; },
      async latest(c, _a, h) {
        const urls = c.urls.split('\n');
        const got = await Promise.allSettled(urls.map(async (u) => parseFeed(await h.fetchPublicPage(u), new URL(u).hostname)));
        const items = got.flatMap((g) => (g.status === 'fulfilled' ? g.value : [])).sort((x, y) => y.at - x.at).slice(0, 20);
        if (!items.length) throw bad('I could not read stories from those links - check they are RSS or Atom feeds.');
        return { title: 'Latest from your feeds', items };
      },
    },
    write: {},
  },
};
Object.assign(APPS, MORE_APPS);   // ~25 more read-only plugins (apps-more.js)

const calls = new Map(); // ip -> times, 60 calls / 10 min
export function registerApps(app, { wrap, fetchPublicPage }) {
  app.post('/api/apps/:app/:action', wrap(async (req, res) => {
    const a = APPS[req.params.app];
    const action = req.params.action;
    const fn = a && (Object.hasOwn(a.read, action) ? a.read[action] : Object.hasOwn(a.write, action) ? a.write[action] : null);
    if (!fn) return res.status(404).json({ error: 'Unknown plugin action.' });
    const now = Date.now(), times = (calls.get(req.ip) || []).filter((t) => now - t < 600000);
    if (times.length >= 60) return res.status(429).json({ error: 'Too many plugin calls - wait a few minutes.' });
    times.push(now); calls.set(req.ip, times);
    try {
      const cfg = a.config(req.body?.config || {});
      const out = await fn(cfg, req.body?.args || {}, { fetchPublicPage });
      res.json({ ok: true, ...out, items: out.items?.slice(0, 30) });
    } catch (e) {
      const status = e.status || (e.name === 'TimeoutError' ? 504 : 502);
      res.status(status).json({ error: e.name === 'TimeoutError' ? 'The app took too long to answer.' : String(e.message || 'Could not reach the app.').slice(0, 300) });
    }
  }));
}
