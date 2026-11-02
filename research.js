// Deep research: plan a few searches, read many real sources at once, and hand the AI as much text as
// its reading window allows. All sources are free public APIs (no keys):
//   Wikipedia (full text of the best page + intros of others), Stack Overflow (best answers, with code),
//   MDN Web Docs, GitHub projects, arXiv papers, OpenAlex research (abstracts), Hacker News, GDELT news.
// Every source is shown to the user as a numbered link, so each claim can be checked.

import { specialists } from './sources.js';

const UA = { 'User-Agent': 'CodeConClave-AI/1.0 (research; https://codeconclave-ww5x.onrender.com)' };
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

async function get(url, ms = 9000, as = 'json') {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return as === 'json' ? r.json() : r.text();
}
const decode = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
// HTML answer -> plain text that keeps code as ``` blocks
function htmlText(html) {
  return decode(String(html)
    .replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_m, c) => `\n\`\`\`\n${c.replace(/<[^>]+>/g, '')}\n\`\`\`\n`)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ''))
    .replace(/\n{3,}/g, '\n\n').trim();
}

// ---- what kind of question is it? ----
const CODING = /\b(code|coding|program(ming)?|function|method|error|exception|traceback|bug|debug|compile|syntax|javascript|typescript|js|ts|python|java|kotlin|swift|c\+\+|c#|golang|go lang|rust|php|ruby|sql|html|css|react|vue|angular|next\.?js|node(\.js)?|npm|pip|api|regex|git|docker|kubernetes|linux|bash|powershell|variable|array|loop|class|async|await|promise|database|postgres|mysql|mongodb|framework|library|algorithm|leetcode)\b/i;
const WEB = /\b(html|css|javascript|js|dom|fetch|web ?api|browser|http|cors|flexbox|grid|svg|canvas|websocket|localstorage)\b/i;
const SCIENCE = /\b(research|study|studies|paper|science|scientific|physics|chemistry|biology|medicine|medical|disease|health|drug|vaccine|cancer|diabetes|climate|quantum|gene|genetic|dna|protein|brain|neural|machine learning|deep learning|llm|transformer|space|nasa|isro|telescope|planet|black hole|evolution|psychology)\b/i;
const TECH = /\b(ai|llm|startup|software|app|apps|gpu|chip|tech|technology|open source|cloud|crypto|blockchain|robot)\b/i;

// "what is the James Webb telescope and what has it found?" -> "james webb telescope"
const QUESTION_WORDS = new Set('what whats which who whom whose why how when where is are was were be been do does did done has have had the a an and or of to in on at for from by with about into tell me explain please can could would should will you your i my its it this that these those there their them they latest recent news found find give show list some any more most much many very really just also than then so if as up out new write make get use using'.split(' '));
export const searchWords = (q) => (q.toLowerCase().replace(/[^\p{L}\p{N}\s+#.-]/gu, ' ').split(/\s+/).filter((w) => w && !QUESTION_WORDS.has(w)).slice(0, 7).join(' ') || q);

// ---- sources ----
async function wikipedia(q, deep) {
  const s = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=4&format=json&utf8=1`, 8000);
  const titles = (s?.query?.search || []).map((x) => x.title);
  if (!titles.length) return [];
  const intro = await get(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=1500&redirects=1&format=json&titles=${encodeURIComponent(titles.join('|'))}`);
  const pages = Object.values(intro?.query?.pages || {}).filter((p) => p.extract).sort((a, b) => titles.indexOf(a.title) - titles.indexOf(b.title));
  const out = pages.map((p) => ({ title: p.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, site: 'Wikipedia', text: clean(p.extract), rank: 2 }));
  if (deep && out[0]) { // the best page: the whole article, not just its first paragraph
    try {
      const full = await get(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(out[0].title)}`);
      const text = Object.values(full?.query?.pages || {})[0]?.extract || '';
      if (text.length > out[0].text.length) out[0] = { ...out[0], text: text.replace(/\n{2,}/g, '\n').replace(/^=+ (See also|References|External links|Further reading|Notes|Bibliography) =+[\s\S]*$/m, '').trim(), rank: 0 };
    } catch { /* the intro is enough */ }
  }
  return out;
}
async function stackOverflow(q) {
  const s = await get(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=5&answers=1&filter=withbody`, 9000);
  const qs = (s?.items || []).filter((x) => x.is_answered).slice(0, 3);
  if (!qs.length) return [];
  const a = await get(`https://api.stackexchange.com/2.3/questions/${qs.map((x) => x.question_id).join(';')}/answers?order=desc&sort=votes&site=stackoverflow&pagesize=12&filter=withbody`, 9000);
  return qs.map((x) => {
    const answers = (a?.items || []).filter((y) => y.question_id === x.question_id).sort((p, r) => (r.is_accepted - p.is_accepted) || (r.score - p.score));
    const best = answers[0];
    if (!best) return null;
    return { title: decode(x.title), url: x.link, site: 'Stack Overflow', rank: 1,
      text: `Question (${x.score} votes): ${decode(x.title)}\n${htmlText(x.body).slice(0, 600)}\n\nBest answer (${best.score} votes${best.is_accepted ? ', accepted' : ''}):\n${htmlText(best.body)}` };
  }).filter(Boolean);
}
async function mdn(q) {
  const d = await get(`https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(q)}&locale=en-US&size=4`, 8000);
  return (d?.documents || []).slice(0, 3).map((x) => ({ title: x.title, url: `https://developer.mozilla.org${x.mdn_url}`, site: 'MDN Web Docs', text: clean(x.summary), rank: 2 }));
}
async function github(q) {
  const d = await get(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=4`, 8000);
  return (d?.items || []).map((r) => ({ title: r.full_name, url: r.html_url, site: 'GitHub', rank: 4,
    text: `Open-source project ${r.full_name} (${r.stargazers_count.toLocaleString('en-US')} stars${r.language ? `, ${r.language}` : ''}, updated ${String(r.pushed_at).slice(0, 10)}): ${clean(r.description) || 'no description'}` }));
}
async function arxiv(q) {
  const xml = await get(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&max_results=4&sortBy=relevance`, 10000, 'text');
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
    const tag = (t) => clean(decode((m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || ''));
    return { title: tag('title'), url: tag('id').replace(/^http:/, 'https:'), site: 'arXiv', rank: 3, text: `Research paper (${tag('published').slice(0, 10)}): ${tag('title')}. ${tag('summary')}` };
  }).filter((x) => x.title);
}
async function openAlex(q) {
  const d = await get(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=4&select=title,publication_year,abstract_inverted_index,doi,id,cited_by_count`, 9000);
  return (d?.results || []).map((w) => {
    const inv = w.abstract_inverted_index;
    let abstract = '';
    if (inv) { const words = []; for (const [word, at] of Object.entries(inv)) for (const i of at) words[i] = word; abstract = words.filter(Boolean).join(' '); }
    if (!abstract) return null;
    return { title: clean(w.title), url: w.doi || w.id, site: 'OpenAlex (research)', rank: 3, text: `Study (${w.publication_year}, cited ${w.cited_by_count} times): ${clean(w.title)}. ${abstract}` };
  }).filter(Boolean);
}
async function hackerNews(q) {
  const d = await get(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=4`);
  return (d?.hits || []).filter((h) => h.title).map((h) => ({ title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, site: 'Hacker News', rank: 5, text: `Tech discussion (${h.points || 0} points, ${String(h.created_at).slice(0, 10)}): ${h.title}` }));
}
async function news(q) {
  const d = await get(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}%20sourcelang:english&mode=artlist&format=json&maxrecords=8&sort=datedesc`, 16000);
  return (d?.articles || []).slice(0, 6).map((a) => ({ title: a.title, url: a.url, site: a.domain, rank: 5, text: `News headline (${String(a.seendate || '').slice(0, 8)}): ${a.title}` }));
}

// Gather sources for the question. `queries` are the planned searches (the first is the main one);
// `budget` is how many characters of source text the AI can read; `onStep` reports progress.
export async function gatherSources(question, queries, budget, onStep) {
  const main = queries[0];
  const coding = CODING.test(question), web = WEB.test(question), science = SCIENCE.test(question), tech = coding || TECH.test(question);
  const libs = ['Wikipedia', coding && 'Stack Overflow', web && 'MDN', tech && 'GitHub', science && 'arXiv', science && 'research papers', tech && 'Hacker News', 'news'].filter(Boolean);
  const extra = specialists(question, main);   // rare + live data: satellites, space, Earth, health, facts, economy…
  onStep(`Searching ${[...libs, ...extra.libs].join(', ')}`);
  const jobs = [
    // coding: Stack Overflow answers lead and Wikipedia gives only short intros (its search finds odd pages for code words)
    wikipedia(main, !coding).then((list) => (coding ? list.map((s) => ({ ...s, rank: 3 })) : list)),
    ...queries.slice(1).map((q) => wikipedia(q, false).then((list) => (coding ? list.map((s) => ({ ...s, rank: 4 })) : list))),
    ...(coding ? queries.slice(0, 2).map((q) => stackOverflow(q)) : []),
    web ? mdn(main) : null,
    tech ? github(main) : null,
    science ? arxiv(main) : null,
    science ? openAlex(main) : null,
    tech ? hackerNews(main) : null,
    news(main),
  ].filter(Boolean);
  const found = (await Promise.allSettled([...jobs, ...extra.jobs])).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  // best kinds first (full article, top answers), no duplicates, then fill the reading budget
  const seen = new Set();
  const ordered = found.filter((s) => s.text && !seen.has(s.url) && seen.add(s.url)).sort((a, b) => a.rank - b.rank);
  const caps = { 0: Math.max(4000, Math.floor(budget * 0.35)), 1: 5000, 2: 1600, 3: 1400, 4: 400, 5: 300 };
  const picked = [];
  let used = 0;
  for (const s of ordered) {
    const room = budget - used;
    if (room < 250 || picked.length >= 20) break;
    const text = s.text.slice(0, Math.min(caps[s.rank] ?? 1200, room));
    picked.push({ ...s, text });
    used += text.length + s.title.length + 20;
  }
  return picked.map((s, i) => ({ n: i + 1, ...s }));
}
export const kindOf = (q) => ({ coding: CODING.test(q), science: SCIENCE.test(q) });
