// Quick web lookup for everyday questions about the world right now ("who won…", "new movies this week",
// "latest news about ISRO"). Free, open sources only - the free Bing/Google feeds forbid use in a product:
//   Wikipedia (articles + the tables in "List of …" pages), Wikipedia's daily Current Events (world news,
//   each line linked to its newspaper), GDELT news, and the live specialists in sources.js.
// A search key (TAVILY_API_KEY or BRAVE_API_KEY on the server) adds the whole web on top.

import { specialists } from './sources.js';

const UA = { 'User-Agent': 'CodeConClave-AI/1.0 (https://codeconclave-ww5x.onrender.com)' };
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const decode = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&nbsp;|&#160;/g, ' ').replace(/&#91;|&#93;/g, '').replace(/&amp;/g, '&');
async function get(url, ms = 8000, as = 'json', init = {}) {
  const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return as === 'json' ? r.json() : r.text();
}
const STOP = new Set('what whats which who whom whose why how when where is are was were be been do does did the a an and or of to in on at for from by with about tell me please can could would will you your i my it this that there their they latest recent news new current today now give show list some any most much many just also than then so if as get week weeks month year released release releases upcoming happened happening'.split(' '));
const words = (q) => q.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
export const NEWSY = /\b(news|latest|today|yesterday|tonight|this (week|month|year)|happened|happening|current(ly)?|recent(ly)?|won|win|winner|score|result|election|released?|launch(ed)?|upcoming|new|now|2025|2026|died|dead|arrested|announced)\b/i;

// HTML table/list page -> plain lines ("cell | cell | cell")
function tableLines(html) {
  return decode(String(html)
    .replace(/<(style|script|sup)[\s\S]*?<\/\1>/gi, '').replace(/\s*\n\s*/g, ' ')
    .replace(/\b[A-Z](?:\s*<br\s*\/?>\s*[A-Z]){2,}\b/g, (m) => m.replace(/<br\s*\/?>|\s/g, ''))   // vertical "O<br>C<br>T" -> "OCT"
    .replace(/<\/t[dh]>/gi, ' | ').replace(/<\/tr>|<br\s*\/?>|<\/li>|<\/p>|<\/h\d>|<\/caption>/gi, '\n').replace(/<[^>]+>/g, ''))
    .split('\n').map((l) => clean(l).replace(/^\|\s*|\s*\|$/g, '').replace(/\s*\|\s*\|\s*/g, ' | ')).filter((l) => l.length > 3 && !/^\[?edit/i.test(l));
}
// Release tables ("OCTOBER | 2 | Film | …" then rows of the same day with no date): give every row its date.
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function datedRows(lines, year) {
  let month = -1, day = 0, dated = 0;
  const out = lines.map((l) => {
    let rest = l;
    const m = rest.match(/^([A-Z]{3,9}) \| /);
    if (m && MONTHS.includes(m[1].slice(0, 3))) { month = MONTHS.indexOf(m[1].slice(0, 3)); rest = rest.slice(m[0].length); }
    const d = rest.match(/^([1-9]|[12]\d|3[01]) \| /);
    if (d && month >= 0) { day = Number(d[1]); rest = rest.slice(d[0].length); }
    if (month < 0 || !day || rest === l && !/\|/.test(rest)) return { text: l };
    dated++;
    return { text: rest, date: new Date(Date.UTC(year, month, day)) };
  });
  return dated >= 3 ? out : null;
}

async function wikipedia(q, newsy) {
  const s = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=4&format=json&utf8=1`);
  const titles = (s?.query?.search || []).map((x) => x.title);
  if (!titles.length) return [];
  const intro = await get(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=1800&redirects=1&format=json&titles=${encodeURIComponent(titles.slice(0, 3).join('|'))}`);
  const pages = Object.values(intro?.query?.pages || {}).filter((p) => p.extract).sort((a, b) => titles.indexOf(a.title) - titles.indexOf(b.title));
  const url = (t) => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
  const out = pages.map((p) => ({ title: p.title, url: url(p.title), site: 'Wikipedia', text: clean(p.extract) }));
  // "List of Telugu films of 2026" & co: the answer is in the tables, which plain extracts drop
  const isList = (t) => /^list of|\bin (film|music|sports|video games?)\b|^\d{4} in /i.test(t) && !/highest|grossing|by length/i.test(t);
  const year = String(new Date().getFullYear());
  const list = titles.find((t) => isList(t) && t.includes(year)) || titles.find(isList);
  if (list) {
    try {
      const p = await get(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(list)}&prop=text&format=json&formatversion=2`, 9000);
      let lines = tableLines(p?.parse?.text || '');
      const rows = newsy && datedRows(lines, Number((list.match(/\b(19|20)\d\d\b/) || [year])[0]));
      if (rows) {   // released in the last 2 weeks, and coming in the next 2 weeks - each with its date
        const now = Date.now(), fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
        const near = rows.filter((r) => r.date && Math.abs(r.date - now) < 15 * 864e5);
        const past = near.filter((r) => r.date <= now).map((r) => `Released ${fmt(r.date)}: ${r.text}`);
        const soon = near.filter((r) => r.date > now).map((r) => `Coming ${fmt(r.date)}: ${r.text}`);
        const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
        if (past.length || soon.length) lines = [`Today is ${today}.`, ...past.reverse(), ...soon];
      } else if (newsy) {   // keep the rows of now: from this quarter's table ("October–December") or this month on
        const now = new Date(), q = Math.floor(now.getMonth() / 3) * 3;
        const m = (k) => new Date(now.getFullYear(), k, 1).toLocaleString('en', { month: 'long' });
        let at = lines.findIndex((l) => l.length < 40 && l.includes(m(q)) && l.includes(m(q + 2)));
        if (at < 0) at = lines.findIndex((l) => l.includes(m(now.getMonth())));
        if (at >= 0) lines = lines.slice(at);
      }
      if (lines.length) out.unshift({ title: list, url: url(list), site: 'Wikipedia', text: lines.join('\n').slice(0, 7000) });
    } catch { /* intros are enough */ }
  }
  return out;
}

// Wikipedia's Current Events portal: what happened in the world in the last 3 days (each line names its newspaper).
async function currentEvents(q) {
  const keys = words(q);
  const days = [0, 1, 2].map((k) => new Date(Date.now() - k * 864e5));
  const pages = await Promise.allSettled(days.map((d) => {
    const name = `Portal:Current_events/${d.getUTCFullYear()}_${d.toLocaleString('en', { month: 'long', timeZone: 'UTC' })}_${d.getUTCDate()}`;
    return get(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(name)}&prop=text&format=json&formatversion=2`, 8000)
      .then((p) => ({ name, date: d.toISOString().slice(0, 10), lines: tableLines(p?.parse?.text || '') }));
  }));
  const out = [];
  for (const r of pages) {
    if (r.status !== 'fulfilled') continue;
    const { name, date, lines } = r.value;
    const items = lines.filter((l) => l.length > 50 && !/^(edit|history|watch)\b/i.test(l));
    const hits = keys.length ? items.filter((l) => keys.some((k) => l.toLowerCase().includes(k))) : items;
    const use = (hits.length ? hits : (keys.length ? [] : items)).slice(0, 12);
    if (use.length) out.push({ title: `World news, ${date}`, url: `https://en.wikipedia.org/wiki/${name}`, site: 'Wikipedia Current Events', text: use.join('\n') });
  }
  return out;
}

async function gdelt(q) {
  const d = await get(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}%20sourcelang:english&mode=artlist&format=json&maxrecords=8&sort=datedesc`, 9000);
  return (d?.articles || []).slice(0, 6).map((a) => ({ title: a.title, url: a.url, site: a.domain, text: `News (${String(a.seendate || '').slice(0, 8)}): ${a.title}` }));
}

// Whole-web search when the founder adds a key (both have free monthly allowances).
async function searchApi(q) {
  const tavily = (process.env.TAVILY_API_KEY || '').trim(), brave = (process.env.BRAVE_API_KEY || '').trim();
  if (tavily) {
    const d = await get('https://api.tavily.com/search', 12000, 'json', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tavily}` },
      body: JSON.stringify({ query: q, max_results: 6, search_depth: 'basic', include_answer: false }) });
    return (d?.results || []).map((x) => ({ title: x.title, url: x.url, site: new URL(x.url).hostname.replace(/^www\./, ''), text: clean(x.content).slice(0, 1500) }));
  }
  if (brave) {
    const d = await get(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=6`, 10000, 'json', { headers: { 'X-Subscription-Token': brave, accept: 'application/json' } });
    return (d?.web?.results || []).map((x) => ({ title: decode(x.title), url: x.url, site: new URL(x.url).hostname.replace(/^www\./, ''), text: clean(decode(String(x.description || '').replace(/<[^>]+>/g, ''))) }));
  }
  return [];
}
export const webSearchConnected = () => Boolean((process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY || '').trim());

// Look it up everywhere at once; numbered sources, best first, within `budget` characters.
export async function webLookup(query, budget = 12000, onStep = () => {}) {
  const newsy = NEWSY.test(query);
  const extra = specialists(query, query);
  onStep(`Searching ${['the web', 'Wikipedia', newsy && 'today\'s news', ...extra.libs].filter(Boolean).slice(0, 5).join(', ')}`);
  const jobs = [searchApi(query), wikipedia(query, newsy), newsy ? currentEvents(query) : null, newsy ? gdelt(query) : null, ...extra.jobs].filter(Boolean);
  const found = (await Promise.allSettled(jobs)).flatMap((r) => (r.status === 'fulfilled' ? r.value || [] : []));
  const seen = new Set(), picked = [];
  let used = 0;
  for (const s of found) {
    if (!s?.text || seen.has(s.url)) continue;
    seen.add(s.url);
    const room = budget - used;
    if (room < 200 || picked.length >= 12) break;
    const text = s.text.slice(0, Math.min(4000, room));
    picked.push({ ...s, text });
    used += text.length + 40;
  }
  return picked.map((s, i) => ({ n: i + 1, ...s }));
}

// ---- Interest watches: "I love movies" -> tell the user when something new comes out ----
// Returns the newest real items for a topic; the app remembers which ones it already showed.
const FILM_LANG = { te: 'Telugu', hi: 'Hindi', ta: 'Tamil', kn: 'Kannada', ml: 'Malayalam', mr: 'Marathi', bn: 'Bengali', en: 'American' };
export async function watchItems(topic, lang = '') {
  const t = String(topic || '').toLowerCase().trim();
  if (!t) return [];
  if (/\b(movies?|films?|cinema|tollywood|bollywood|kollywood)\b/.test(t)) {
    const year = new Date().getFullYear();
    const langs = FILM_LANG[lang] && lang !== 'en' ? [FILM_LANG[lang]] : ['Telugu', 'Hindi'];
    const out = [];
    for (const L of langs) {
      try {
        const page = `List of ${L} films of ${year}`;
        const p = await get(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2`, 9000);
        const rows = datedRows(tableLines(p?.parse?.text || ''), year) || [];
        const now = Date.now();
        for (const r of rows) {
          if (!r.date || r.date > now || now - r.date > 4 * 864e5) continue;   // out in the last 4 days
          const name = r.text.split(' | ')[0].trim();
          if (!name) continue;
          out.push({ id: `${L}:${name}`, title: `New ${L} movie out: ${name}`, text: r.text.split(' | ').slice(1, 3).join(' · '),
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}`, date: r.date.toISOString().slice(0, 10) });
        }
      } catch { /* that list is missing - skip it */ }
    }
    return out.slice(0, 8);
  }
  const found = (await Promise.allSettled([currentEvents(t), gdelt(t)])).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const items = [];
  for (const s of found) {
    if (s.site === 'Wikipedia Current Events') {
      for (const line of s.text.split('\n').slice(0, 4)) items.push({ id: `ce:${line.slice(0, 80)}`, title: line.length > 140 ? `${line.slice(0, 137)}…` : line, text: '', url: s.url, date: s.title.slice(-10) });
    } else items.push({ id: s.url, title: s.title, text: s.site, url: s.url, date: '' });
  }
  return items.slice(0, 8);
}
