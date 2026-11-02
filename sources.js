// Rare and live data for deep research (and live chat answers): satellites and space, Earth events,
// medical research, structured facts, economy, security bugs and books. All free public APIs, no keys:
//   CelesTrak (satellite catalog + orbits), wheretheiss.at (live ISS), The Space Devs (launch schedule),
//   NASA/JPL (asteroid close approaches), NOAA SWPC (space weather), NASA EONET (events seen from orbit),
//   USGS (earthquakes), Europe PMC (papers), ClinicalTrials.gov, Wikidata (facts), World Bank (economy),
//   OSV (security bugs), Open Library (books).
// Each function returns sources: { title, url, site, text, rank } (lower rank = more important).

const UA = { 'User-Agent': 'CodeConClave-AI/1.0 (research; https://codeconclave-ww5x.onrender.com)' };
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
async function get(url, ms = 9000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const num = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export const SPACE = /\b(satellites?|orbits?|orbital|norad|iss|space station|starlink|cartosat|resourcesat|risat|gsat|insat|oceansat|eos-\d+|chandrayaan|aditya|mangalyaan|hubble|james webb|jwst|tiangong|launch(es)?|rockets?|isro|spacex|asteroids?|comets?|near[- ]earth|solar (storm|flare|wind)|geomagnetic|aurora|space weather)\b/i;
export const EARTH = /\b(earthquakes?|quakes?|seismic|tsunami|wildfires?|forest fires?|volcano(es)?|eruptions?|cyclones?|hurricanes?|typhoons?|severe storms?|floods?|icebergs?|landslides?|natural disasters?)\b/i;
export const HEALTH = /\b(disease|symptoms?|treatment|therapy|cure|drugs?|medicines?|vaccines?|virus|infection|cancer|diabetes|dengue|malaria|tuberculosis|covid|clinical|trials?|patients?|health|medical|surgery)\b/i;
export const ECON = /\b(gdp|population|inflation|unemployment|economy|per capita|life expectancy|literacy|poverty|exports?|imports?|co2 emissions)\b/i;
export const BOOKS = /\b(books?|novels?|author|wrote|written by|poems?|poetry)\b/i;
const CVE_ID = /\b(CVE-\d{4}-\d{4,7}|GHSA-[\w-]{14})\b/i;

// words that describe the question, not the thing being asked about
const NOISE = new Set('satellite satellites orbit orbits orbital where is are the a an now current currently live position located location height altitude speed launched launch details about info information of what when how far fast high which tell me show find right today latest data track tracking space'.split(' '));
const thingName = (q) => q.replace(/[?!.,]/g, ' ').split(/\s+/).filter((w) => w && !NOISE.has(w.toLowerCase())).slice(0, 4).join(' ');

// ---------- structured facts (Wikidata) ----------
const WD_PROPS = { P31: 'is a', P17: 'country', P27: 'citizenship', P495: 'country of origin', P159: 'headquarters', P112: 'founded by',
  P571: 'founded / started', P576: 'ended', P169: 'chief executive', P488: 'chairperson', P35: 'head of state', P6: 'head of government',
  P36: 'capital', P1082: 'population', P2046: 'area', P38: 'currency', P37: 'official language', P569: 'born', P570: 'died', P19: 'place of birth',
  P106: 'occupation', P69: 'educated at', P166: 'award received', P50: 'author', P577: 'published', P57: 'director', P176: 'manufacturer',
  P137: 'operator', P619: 'launch date', P377: 'NORAD satellite number', P2067: 'mass', P2048: 'height', P2044: 'elevation', P856: 'website' };
function wdValue(snak) {
  const v = snak?.datavalue?.value;
  if (v === undefined) return null;
  if (typeof v === 'string') return { text: v };
  if (v.id) return { id: v.id };
  if (v.time) return { text: v.time.replace(/^\+/, '').slice(0, 10).replace(/-00/g, '') };
  if (v.amount) return { text: num(Number(v.amount), 2) + (v.unit && v.unit !== '1' ? ` (${v.unit.split('/').pop()})` : '') };
  if (v.text) return { text: v.text };
  return null;
}
export async function wikidataFacts(name) {
  if (!name) return [];
  const s = await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=1`, 7000);
  const hit = s?.search?.[0];
  if (!hit) return [];
  const e = (await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hit.id}&props=claims|labels|descriptions&languages=en&format=json`, 8000))?.entities?.[hit.id];
  if (!e) return [];
  const facts = [];
  const ids = new Set();
  for (const [p, label] of Object.entries(WD_PROPS)) {
    const vals = (e.claims?.[p] || []).filter((c) => c.rank !== 'deprecated').slice(0, 3).map((c) => wdValue(c.mainsnak)).filter(Boolean);
    if (vals.length) { facts.push([label, vals, p]); vals.forEach((v) => v.id && ids.add(v.id)); }
  }
  if (!facts.length) return [];
  const labels = {};
  if (ids.size) {
    const l = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${[...ids].slice(0, 45).join('|')}&props=labels&languages=en&format=json`, 8000);
    for (const [id, x] of Object.entries(l?.entities || {})) labels[id] = x.labels?.en?.value || id;
  }
  const title = e.labels?.en?.value || name;
  const lines = facts.map(([label, vals]) => `${label}: ${vals.map((v) => v.text || labels[v.id] || v.id).join(', ')}`);
  const norad = (e.claims?.P377 || []).map((c) => wdValue(c.mainsnak)?.text).find(Boolean);
  return [{ title: `${title} (facts)`, url: `https://www.wikidata.org/wiki/${hit.id}`, site: 'Wikidata', rank: 1, norad,
    text: `Facts about ${title}${e.descriptions?.en?.value ? ` (${e.descriptions.en.value})` : ''}:\n${lines.join('\n')}` }];
}

// ---------- satellites (CelesTrak) and the live ISS ----------
const OWNERS = { IND: 'India', US: 'United States', PRC: 'China', CIS: 'Russia / former USSR', ESA: 'European Space Agency', JPN: 'Japan', FR: 'France',
  UK: 'United Kingdom', GER: 'Germany', ISS: 'International Space Station partners', CA: 'Canada', IT: 'Italy', SKOR: 'South Korea', ISRA: 'Israel', UAE: 'UAE', AB: 'Arab Satellite Org' };
const STATUS = { '+': 'working', '-': 'not working', P: 'partly working', B: 'backup', S: 'spare', X: 'extended mission', D: 'decayed (fell back to Earth)', '?': 'unknown' };
function satText(r, gp) {
  const parts = [`Satellite ${r.OBJECT_NAME} (NORAD ${r.NORAD_CAT_ID}, international id ${r.OBJECT_ID}), owner: ${OWNERS[r.OWNER] || r.OWNER}, status: ${STATUS[r.OPS_STATUS_CODE] || r.OPS_STATUS_CODE || 'unknown'}.`,
    `Launched ${r.LAUNCH_DATE} from ${r.LAUNCH_SITE}${r.DECAY_DATE ? `; came down ${r.DECAY_DATE}` : ''}.`];
  if (r.PERIOD) parts.push(`Orbit: one lap every ${r.PERIOD} minutes, inclination ${r.INCLINATION}°, highest point ${r.APOGEE} km, lowest point ${r.PERIGEE} km above Earth.`);
  if (gp) parts.push(`Latest orbit data (epoch ${String(gp.EPOCH).slice(0, 16)} UTC): ${num(gp.MEAN_MOTION, 3)} laps per day, eccentricity ${gp.ECCENTRICITY}.`);
  return parts.join(' ');
}
export async function satellites(q, noradHint) {
  const out = [];
  if (/\b(iss|space station)\b/i.test(q)) {
    const p = await get('https://api.wheretheiss.at/v1/satellites/25544', 7000).catch(() => null);
    if (p) out.push({ title: 'International Space Station - live position', url: 'https://wheretheiss.at/', site: 'wheretheiss.at (live)', rank: 0,
      text: `Live ISS position at ${new Date(p.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 16)} UTC: latitude ${num(p.latitude, 2)}, longitude ${num(p.longitude, 2)}, altitude ${num(p.altitude, 1)} km, speed ${num(p.velocity)} km/h, ${p.visibility === 'daylight' ? 'in sunlight' : 'in Earth\'s shadow'}.` });
    noradHint = noradHint || 25544;
  }
  let recs = [];
  if (noradHint) recs = await get(`https://celestrak.org/satcat/records.php?CATNR=${encodeURIComponent(noradHint)}&FORMAT=json`).catch(() => []);
  const name = thingName(q);
  if (!recs.length && name) recs = await get(`https://celestrak.org/satcat/records.php?NAME=${encodeURIComponent(name.toUpperCase())}&FORMAT=json`).catch(() => []);
  if (!recs.length && name && name.includes(' ')) recs = await get(`https://celestrak.org/satcat/records.php?NAME=${encodeURIComponent(name.split(' ')[0].toUpperCase())}&FORMAT=json`).catch(() => []);
  if (!Array.isArray(recs)) recs = [];
  recs = recs.filter((r) => r.OBJECT_TYPE === 'PAY').slice(0, 4).concat(recs.filter((r) => r.OBJECT_TYPE !== 'PAY').slice(0, recs.some((r) => r.OBJECT_TYPE === 'PAY') ? 0 : 2));
  for (const [i, r] of recs.entries()) {
    const gp = i === 0 && !r.DECAY_DATE ? (await get(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${r.NORAD_CAT_ID}&FORMAT=json`).catch(() => []))?.[0] : null;
    out.push({ title: `${r.OBJECT_NAME} - satellite catalog`, url: `https://celestrak.org/satcat/table-satcat.php?CATNR=${r.NORAD_CAT_ID}`, site: 'CelesTrak', rank: 1, text: satText(r, gp) });
  }
  return out;
}
const AGENCIES = /\b(isro|spacex|nasa|rocket lab|esa|blue origin|cnsa|roscosmos|jaxa|arianespace|ula)\b/i;
export async function launches(q) {
  const agency = (q.match(AGENCIES) || [])[1];
  const d = await get(`https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=6&mode=list${agency ? `&search=${encodeURIComponent(agency)}` : ''}`, 9000);
  const list = (d?.results || []).map((l) => `${l.name} - ${String(l.net || '').replace('T', ' ').slice(0, 16)} UTC, status: ${l.status?.name || l.status?.abbrev || '?'}${l.pad?.location?.name ? `, from ${l.pad.location.name}` : l.location ? `, from ${l.location}` : ''}`);
  if (!list.length) return [];
  return [{ title: `Upcoming rocket launches${agency ? ` (${agency.toUpperCase()})` : ''}`, url: 'https://thespacedevs.com/', site: 'The Space Devs (launch schedule)', rank: 1,
    text: `Upcoming launches as of ${now()}:\n${list.join('\n')}` }];
}
export async function asteroids() {
  const d = await get('https://ssd-api.jpl.nasa.gov/cad.api?dist-max=0.05&date-min=now&date-max=%2B30&sort=date&limit=8', 9000);
  const f = d?.fields || [];
  const at = (row, k) => row[f.indexOf(k)];
  const list = (d?.data || []).map((r) => { const au = Number(at(r, 'dist')); return `${at(r, 'des')}: passes Earth ${at(r, 'cd')} UTC at ${num(au * 149597870.7)} km (${num(au * 389.17, 2)} times the Moon's distance), speed ${num(at(r, 'v_rel'), 1)} km/s`; });
  if (!list.length) return [];
  return [{ title: 'Asteroids passing close to Earth (next 30 days)', url: 'https://cneos.jpl.nasa.gov/ca/', site: 'NASA/JPL', rank: 1, text: `Close approaches within 0.05 AU, as of ${now()}:\n${list.join('\n')}` }];
}
export async function spaceWeather() {
  const d = await get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', 8000);
  const rows = (Array.isArray(d) ? d : []).slice(-8);
  if (!rows.length) return [];
  const kp = (r) => Number(r.Kp ?? r[1]);
  const last = rows[rows.length - 1], max = Math.max(...rows.map(kp));
  const level = (k) => (k >= 7 ? 'strong geomagnetic storm' : k >= 5 ? 'geomagnetic storm' : k >= 4 ? 'active' : 'quiet');
  return [{ title: 'Space weather - planetary K-index', url: 'https://www.swpc.noaa.gov/products/planetary-k-index', site: 'NOAA Space Weather', rank: 1,
    text: `Geomagnetic activity (Kp, 0-9; 5+ is a storm): latest ${kp(last)} at ${last.time_tag ?? last[0]} UTC (${level(kp(last))}); highest in the last 24 hours: ${max} (${level(max)}).` }];
}

// ---------- Earth (events seen from orbit, earthquakes) ----------
const EONET_CATS = [[/wildfire|forest fire/i, 'wildfires'], [/volcano|eruption/i, 'volcanoes'], [/cyclone|hurricane|typhoon|storm/i, 'severeStorms'],
  [/flood/i, 'floods'], [/iceberg/i, 'seaLakeIce'], [/landslide/i, 'landslides']];
export async function earthEvents(q) {
  const cat = (EONET_CATS.find(([re]) => re.test(q)) || [])[1];
  const d = await get(`https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=12${cat ? `&category=${cat}` : ''}`, 9000);
  const list = (d?.events || []).map((e) => { const g = e.geometry?.[e.geometry.length - 1]; return `${e.title} (${e.categories?.[0]?.title || ''}, last seen ${String(g?.date || '').slice(0, 10)}${g?.coordinates ? `, at ${g.coordinates.slice(0, 2).map((x) => num(x, 2)).join(', ')}` : ''})`; });
  if (!list.length) return [];
  return [{ title: `Natural events tracked by NASA satellites${cat ? ` (${cat})` : ''}`, url: 'https://eonet.gsfc.nasa.gov/', site: 'NASA EONET', rank: 1, text: `Open events as of ${now()}:\n${list.join('\n')}` }];
}
export async function earthquakes(q) {
  const d = await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', 9000);
  let feats = d?.features || [];
  const place = (q.match(/\b(india|nepal|japan|indonesia|turkey|china|pakistan|afghanistan|iran|philippines|chile|mexico|california|alaska|taiwan|myanmar)\b/i) || [])[1];
  if (place) feats = feats.filter((f) => new RegExp(place, 'i').test(f.properties.place)).concat(feats.filter((f) => !new RegExp(place, 'i').test(f.properties.place)));
  const list = feats.slice(0, 10).map((f) => `M${f.properties.mag} - ${f.properties.place}, ${new Date(f.properties.time).toISOString().replace('T', ' ').slice(0, 16)} UTC, depth ${num(f.geometry.coordinates[2])} km${f.properties.tsunami ? ', tsunami alert' : ''}`);
  if (!list.length) return [];
  return [{ title: 'Earthquakes of magnitude 4.5+ in the past week', url: 'https://earthquake.usgs.gov/earthquakes/map/', site: 'USGS', rank: 1, text: `As of ${now()}${place ? ` (${place} first)` : ''}:\n${list.join('\n')}` }];
}

// ---------- health research ----------
export async function europePmc(q) {
  const d = await get(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=4&resultType=core&sort=CITED%20desc`, 10000);
  return (d?.resultList?.result || []).filter((r) => r.abstractText).slice(0, 3).map((r) => ({
    title: clean(r.title), url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`, site: 'Europe PMC (medical research)', rank: 2,
    text: `Study (${r.pubYear}, ${clean(r.journalInfo?.journal?.title || r.source)}, cited ${r.citedByCount || 0} times): ${clean(r.title)}. ${clean(String(r.abstractText).replace(/<[^>]+>/g, ''))}` }));
}
export async function clinicalTrials(q) {
  const d = await get(`https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(q)}&pageSize=4&fields=NCTId,BriefTitle,OverallStatus,Condition,Phase,StartDate`, 9000);
  const list = (d?.studies || []).map((s) => { const p = s.protocolSection || {}; return `${p.identificationModule?.briefTitle} (${p.identificationModule?.nctId}; ${p.statusModule?.overallStatus}; phase ${(p.designModule?.phases || []).join('/') || 'n/a'}; started ${p.statusModule?.startDateStruct?.date || '?'})`; });
  if (!list.length) return [];
  return [{ title: 'Clinical trials', url: `https://clinicaltrials.gov/search?term=${encodeURIComponent(q)}`, site: 'ClinicalTrials.gov', rank: 3, text: `Registered clinical trials:\n${list.join('\n')}` }];
}

// ---------- economy (World Bank) ----------
const WB_IND = [[/gdp per capita|per capita/i, 'NY.GDP.PCAP.CD', 'GDP per person (current US$)'], [/\bgdp\b|economy size/i, 'NY.GDP.MKTP.CD', 'GDP (current US$)'],
  [/population/i, 'SP.POP.TOTL', 'population'], [/inflation/i, 'FP.CPI.TOTL.ZG', 'inflation (consumer prices, % a year)'],
  [/unemployment/i, 'SL.UEM.TOTL.ZS', 'unemployment (% of labour force)'], [/life expectancy/i, 'SP.DYN.LE00.IN', 'life expectancy at birth (years)'],
  [/literacy/i, 'SE.ADT.LITR.ZS', 'adult literacy rate (%)'], [/poverty/i, 'SI.POV.DDAY', 'poverty headcount at $3/day (%)'],
  [/exports?/i, 'NE.EXP.GNFS.CD', 'exports of goods and services (US$)'], [/co2/i, 'EN.GHG.CO2.MT.CE.AR5', 'CO2 emissions (Mt)']];
let wbCountries = null;
async function wbCountry(q) {
  if (!wbCountries) {
    const d = await get('https://api.worldbank.org/v2/country?format=json&per_page=400', 9000);
    wbCountries = (d?.[1] || []).filter((c) => c.region?.value !== 'Aggregates').map((c) => ({ id: c.id, name: c.name.toLowerCase().replace(/,.*$/, '') }));
  }
  const s = q.toLowerCase().replace(/\b(usa|america|united states of america)\b/g, 'united states').replace(/\b(uk|britain)\b/g, 'united kingdom');
  return wbCountries.filter((c) => c.name.length > 3 && new RegExp(`\\b${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s)).slice(0, 3);
}
export async function worldBank(q) {
  const inds = WB_IND.filter(([re]) => re.test(q)).slice(0, 2);
  const countries = inds.length ? await wbCountry(q) : [];
  if (!inds.length || !countries.length) return [];
  const lines = [];
  for (const c of countries) for (const [, code, label] of inds) {
    const d = await get(`https://api.worldbank.org/v2/country/${c.id}/indicator/${code}?format=json&mrnev=1`, 8000).catch(() => null);
    const v = d?.[1]?.[0];
    if (v?.value !== null && v?.value !== undefined) lines.push(`${v.country.value}, ${label}, ${v.date}: ${code.endsWith('.CD') && v.value > 1e9 ? `$${num(v.value / 1e12, 3)} trillion` : num(v.value, 2)}`);
  }
  if (!lines.length) return [];
  return [{ title: 'World Bank indicators', url: 'https://data.worldbank.org/', site: 'World Bank', rank: 1, text: `Latest World Bank figures:\n${lines.join('\n')}` }];
}

// ---------- security bugs (OSV) and books ----------
export async function securityAdvisory(q) {
  const id = (q.match(CVE_ID) || [])[1];
  if (!id) return [];
  const v = await get(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id.toUpperCase())}`, 9000);
  const pkgs = (v.affected || []).slice(0, 5).map((a) => `${a.package?.ecosystem}:${a.package?.name}`).join(', ');
  return [{ title: `${v.id} security advisory`, url: `https://osv.dev/vulnerability/${v.id}`, site: 'OSV (open source vulnerabilities)', rank: 0,
    text: `${v.id}${v.aliases?.length ? ` (also ${v.aliases.slice(0, 3).join(', ')})` : ''}: ${clean(v.summary)} ${clean(v.details).slice(0, 1500)} Published ${String(v.published).slice(0, 10)}. Affected packages: ${pkgs || 'see advisory'}.` }];
}
export async function books(q) {
  const d = await get(`https://openlibrary.org/search.json?q=${encodeURIComponent(thingName(q) || q)}&limit=4&fields=title,author_name,first_publish_year,edition_count,key,subject`, 9000);
  return (d?.docs || []).slice(0, 3).map((b) => ({ title: b.title, url: `https://openlibrary.org${b.key}`, site: 'Open Library', rank: 3,
    text: `Book "${b.title}" by ${(b.author_name || ['unknown']).slice(0, 3).join(', ')}, first published ${b.first_publish_year || '?'}, ${b.edition_count || 0} editions${b.subject ? `; subjects: ${b.subject.slice(0, 6).join(', ')}` : ''}.` }));
}

// Which of these to ask for a question, and the libraries' names for the progress line.
export function specialists(q, main) {
  const jobs = [], libs = [];
  const add = (name, p) => { libs.push(name); jobs.push(p); };
  const wd = wikidataFacts(thingName(main) || main);
  add('Wikidata', wd);
  if (SPACE.test(q)) {
    if (/\b(satellites?|orbits?|norad|iss|space station|starlink|cartosat|resourcesat|risat|gsat|insat|oceansat|eos-\d+|hubble|tiangong|chandrayaan|aditya)\b/i.test(q))
      add('satellite catalog (CelesTrak)', wd.then((f) => satellites(q, f[0]?.norad)).catch(() => satellites(q)));
    if (/\b(launch(es)?|rockets?|isro|spacex)\b/i.test(q)) add('launch schedule', launches(q));
    if (/\b(asteroids?|comets?|near[- ]earth)\b/i.test(q)) add('NASA/JPL asteroids', asteroids());
    if (/\b(solar (storm|flare|wind)|geomagnetic|aurora|space weather)\b/i.test(q)) add('NOAA space weather', spaceWeather());
  }
  if (EARTH.test(q)) {
    if (/\b(earthquakes?|quakes?|seismic|tsunami)\b/i.test(q)) add('USGS earthquakes', earthquakes(q));
    else add('NASA EONET', earthEvents(q));
  }
  if (HEALTH.test(q)) { add('Europe PMC', europePmc(main)); add('ClinicalTrials.gov', clinicalTrials(main)); }
  if (ECON.test(q)) add('World Bank', worldBank(q));
  if (CVE_ID.test(q)) add('OSV', securityAdvisory(q));
  if (BOOKS.test(q)) add('Open Library', books(q));
  return { jobs, libs };
}
