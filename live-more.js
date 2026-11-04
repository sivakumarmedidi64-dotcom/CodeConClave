// More live data, from free public sources (no keys):
//   public holidays (Nager.Date), sunrise / sunset / day length (Open-Meteo), moon phase and the next full / new moon
//   (worked out from the moon's 29.53-day cycle - no guessing), live flights over a place (OpenSky Network),
//   and the local time anywhere (Open-Meteo time zones).
// Each returns { summary, source } - the chat uses it as live data, like the weather.
import { geocode } from './windy.js';

const UA = { 'User-Agent': 'CodeConClave-AI/1.0 (+https://codeconclave-ww5x.onrender.com)' };
const get = async (url, ms = 9000) => { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const COUNTRIES = { india: 'IN', usa: 'US', us: 'US', america: 'US', 'united states': 'US', uk: 'GB', britain: 'GB', england: 'GB', uae: 'AE', dubai: 'AE', canada: 'CA', australia: 'AU', germany: 'DE', france: 'FR',
  japan: 'JP', singapore: 'SG', 'saudi arabia': 'SA', 'new zealand': 'NZ', italy: 'IT', spain: 'ES', brazil: 'BR', china: 'CN', 'south africa': 'ZA', nepal: 'NP', 'sri lanka': 'LK', malaysia: 'MY', ireland: 'IE', netherlands: 'NL' };

export const HOLIDAY_Q = /\b(public holidays?|bank holidays?|national holidays?|next holiday|upcoming holidays?|holidays? (this|next) (month|year)|holiday list|govt holidays?|government holidays?)\b/i;
export const SUN_Q = /\b(sunrise|sunset|sun ?rise|sun ?set|day length|daylight hours|golden hour)\b/i;
export const MOON_Q = /\b(moon phase|phase of the moon|full moon|new moon|amavasya|pournami|purnima|pournima|half moon|crescent moon)\b/i;
export const FLIGHT_Q = /\b(flights?|planes?|aircraft|aeroplanes?|airplanes?)\b[^.?!]{0,30}\b(above|over|overhead|near|around|flying)\b/i;
export const TIME_Q = /\b(what(?:'s| is) the time|current time|local time|time now|time right now)\b[^.?!]{0,20}\b(in|at)\b|\bwhat time is it (in|at)\b/i;
export const EXTRA_LIVE = new RegExp([HOLIDAY_Q, SUN_Q, MOON_Q, FLIGHT_Q, TIME_Q].map((r) => r.source).join('|'), 'i');

const placeIn = (q) => (String(q).match(/\b(?:in|at|for|over|above|near|around)\s+([A-Za-z][A-Za-z .'-]{1,40}?)(?:\s+(?:today|tomorrow|now|right now|this week|this month|this year|tonight))?\s*[?.!]*$/i) || [])[1] || '';
async function where(q, loc) {
  const name = placeIn(q);
  if (!name && loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) return { name: 'your location', lat: loc.lat, lon: loc.lon };
  return name ? geocode(name) : null;
}

// India: Google's public "Holidays in India" calendar (festivals too); other countries: Nager.Date
async function indiaHolidays() {
  const r = await fetch('https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics', { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ''), ev = [];
  for (const blk of (await r.text()).split('BEGIN:VEVENT').slice(1)) {
    const d = (blk.match(/DTSTART;VALUE=DATE:(\d{8})/) || [])[1], n = (blk.match(/SUMMARY:(.+)/) || [])[1];
    if (d && n && d >= today) ev.push([d, n.replace(/\\,/g, ',').trim()]);
  }
  ev.sort((a, b) => a[0].localeCompare(b[0]));
  const rows = ev.slice(0, 10).map(([d, n]) => new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ': ' + n);
  return rows.length ? { summary: `Next holidays and festivals in India (official holidays differ by state and office):\n${rows.join('\n')}`, source: 'Holidays in India (Google public calendar)' } : null;
}
async function holidays(q) {
  const t = q.toLowerCase(), hit = Object.keys(COUNTRIES).find((k) => new RegExp(`\\b${k}\\b`).test(t)), cc = hit ? COUNTRIES[hit] : 'IN';
  if (cc === 'IN') return indiaHolidays();
  const r = await fetch(`https://date.nager.at/api/v3/NextPublicHolidays/${cc}`, { headers: UA, signal: AbortSignal.timeout(9000) });
  const list = r.status === 200 ? await r.json().catch(() => null) : null;
  if (!Array.isArray(list) || !list.length) return null;
  const rows = list.slice(0, 8).map((h) => `${new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}: ${h.name}${h.localName && h.localName !== h.name ? ` (${h.localName})` : ''}`);
  return { summary: `Next public holidays (${cc}${cc === 'IN' ? ' - national holidays only; state holidays and festivals vary by state' : ''}):\n${rows.join('\n')}`, source: 'Nager.Date public holidays' };
}
async function sun(q, loc) {
  const p = await where(q, loc); if (!p) return null;
  const d = await get(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=sunrise,sunset,daylight_duration&timezone=auto&forecast_days=2`);
  const day = d?.daily; if (!day?.sunrise?.length) return null;
  const tm = (s) => String(s).slice(11, 16);
  const hrs = (s) => { const m = Math.round(Number(s) / 60); return `${Math.floor(m / 60)} h ${m % 60} min`; };
  return { summary: `Sun in ${p.name} (local time, ${d.timezone}): today sunrise ${tm(day.sunrise[0])}, sunset ${tm(day.sunset[0])}, daylight ${hrs(day.daylight_duration[0])}. Tomorrow sunrise ${tm(day.sunrise[1])}, sunset ${tm(day.sunset[1])}.`, source: 'Open-Meteo' };
}
function moon() {
  const SYN = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14) / 864e5;   // a known new moon
  const nowD = Date.now() / 864e5, age = ((nowD - ref) % SYN + SYN) % SYN, frac = age / SYN;
  const names = [[0.03, 'New moon (Amavasya)'], [0.22, 'Waxing crescent'], [0.28, 'First quarter'], [0.47, 'Waxing gibbous'], [0.53, 'Full moon (Pournami)'], [0.72, 'Waning gibbous'], [0.78, 'Last quarter'], [0.97, 'Waning crescent'], [1.01, 'New moon (Amavasya)']];
  const phase = names.find(([x]) => frac < x)[1], lit = Math.round((1 - Math.cos(2 * Math.PI * frac)) / 2 * 100);
  const next = (target) => { let d = (target - frac) * SYN; if (d < 0.5) d += SYN; return new Date(Date.now() + d * 864e5).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); };
  return { summary: `Moon today: ${phase}, about ${lit}% lit (day ${Math.floor(age) + 1} of 29.5). Next full moon (Pournami): about ${next(0.5)}. Next new moon (Amavasya): about ${next(1)}. (Worked out from the moon's 29.53-day cycle - exact times can differ by a few hours.)`, source: 'Moon cycle (astronomy)' };
}
async function flights(q, loc) {
  const p = await where(q, loc); if (!p) return null;
  const b = 0.7, d = await get(`https://opensky-network.org/api/states/all?lamin=${p.lat - b}&lomin=${p.lon - b}&lamax=${p.lat + b}&lomax=${p.lon + b}`, 12000);
  const st = (d?.states || []).filter((s) => !s[8]);   // in the air
  if (!st.length) return { summary: `The OpenSky Network shows no aircraft near ${p.name} right now. It is a volunteer network with few receivers in India, so real flights there often don't appear - for flight times, check the airline or the airport's website.`, source: 'OpenSky Network (volunteer receivers)' };
  const rows = st.sort((a, c) => (c[7] || 0) - (a[7] || 0)).slice(0, 8).map((s) => `${String(s[1] || '').trim() || 'unknown flight'} (${s[2]}) at ${Math.round((s[7] || s[13] || 0) * 3.281).toLocaleString('en-IN')} ft, ${Math.round((s[9] || 0) * 3.6)} km/h`);
  return { summary: `${st.length} aircraft are in the air within about 75 km of ${p.name} right now. Some of them:\n${rows.join('\n')}`, source: 'OpenSky Network (live)' };
}
async function localTime(q) {
  const name = placeIn(q) || (String(q).match(/\btime in ([A-Za-z][A-Za-z .'-]{1,40})/i) || [])[1]; if (!name) return null;
  const p = await geocode(name.trim()); if (!p) return null;
  const tz = p.tz || 'UTC', t = new Date().toLocaleString('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  return { summary: `Local time in ${p.name}: ${t} (${tz}).`, source: 'Time zone database' };
}
export async function extraLive(q, loc) {
  const t = String(q || '');
  if (HOLIDAY_Q.test(t)) return holidays(t);
  if (MOON_Q.test(t)) return moon();
  if (SUN_Q.test(t)) return sun(t, loc);
  if (FLIGHT_Q.test(t)) return flights(t, loc);
  if (TIME_Q.test(t)) return localTime(t);
  return null;
}
