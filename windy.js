// Windy: the forecast for the next days at any place (Point Forecast API, GFS model) and the live
// weather map (Windy's own embed). Keys live on the server only (WINDY_POINT_FORECAST_KEY).

const UA = { 'User-Agent': 'CodeConClave-AI/1.0 (https://codeconclave-ww5x.onrender.com)' };
export const FORECAST_WORDS = /\b(forecast|tomorrow|tonight|this week|next (few )?days|weekend|will it (rain|be)|going to rain|rain (later|today|tomorrow)|next \d+ (hours|days))\b/i;
export const MAP_WORDS = /\b(weather|wind|rain|radar|storm|cyclone|temperature|clouds?) (map|radar)\b|\bmap of (the )?(weather|wind|rain|storm|cyclone)\b|\bwindy map\b/i;

// Indian states (not towns) -> a city in them; most users are in India, so India wins a tie ("Goa" was Genoa)
const STATES = { goa: 'Panjim', 'andhra pradesh': 'Amaravati', andhra: 'Amaravati', ap: 'Amaravati', telangana: 'Hyderabad', 'tamil nadu': 'Chennai', karnataka: 'Bengaluru', kerala: 'Kochi',
  maharashtra: 'Mumbai', gujarat: 'Ahmedabad', rajasthan: 'Jaipur', punjab: 'Amritsar', haryana: 'Gurugram', 'uttar pradesh': 'Lucknow', up: 'Lucknow', bihar: 'Patna', 'west bengal': 'Kolkata',
  odisha: 'Bhubaneswar', orissa: 'Bhubaneswar', 'madhya pradesh': 'Bhopal', mp: 'Bhopal', chhattisgarh: 'Raipur', jharkhand: 'Ranchi', assam: 'Guwahati', 'himachal pradesh': 'Shimla', himachal: 'Shimla',
  uttarakhand: 'Dehradun', kashmir: 'Srinagar', 'jammu and kashmir': 'Srinagar', ladakh: 'Leh', sikkim: 'Gangtok', meghalaya: 'Shillong', tripura: 'Agartala', manipur: 'Imphal', mizoram: 'Aizawl',
  nagaland: 'Kohima', 'arunachal pradesh': 'Itanagar', delhi: 'New Delhi', india: 'Nagpur' };
export async function geocode(place) {
  const raw = String(place || '').trim(), key = raw.toLowerCase().replace(/\s+/g, ' ');
  const name = STATES[key] || raw;
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8`, { headers: UA, signal: AbortSignal.timeout(8000) });
  const list = (await r.json())?.results || [];
  const p = list.find((x) => x.country_code === 'IN' && x.name.toLowerCase() === name.toLowerCase()) || list.find((x) => x.country_code === 'IN' && (x.population || 0) > 20000) || list[0];
  return p ? { name: STATES[key] ? `${raw.replace(/\b\w/g, (c) => c.toUpperCase())} (${p.name})` : [p.name, p.admin1, p.country].filter(Boolean).join(', '), lat: p.latitude, lon: p.longitude, tz: p.timezone || 'Asia/Kolkata', country: p.country, cc: p.country_code } : null;
}

// next 3 days, by day: min/max temperature, rain, wind - plus the next 12 hours in short
export async function windyForecast(place) {
  const key = (process.env.WINDY_POINT_FORECAST_KEY || '').trim();
  if (!key) return null;
  const g = await geocode(place);
  if (!g) return null;
  const r = await fetch('https://api.windy.com/api/point-forecast/v2', { method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ lat: g.lat, lon: g.lon, model: 'gfs', parameters: ['temp', 'precip', 'wind', 'rh'], levels: ['surface'], key }) });
  if (!r.ok) return null;
  const d = await r.json();
  const ts = d.ts || [], temp = d['temp-surface'] || [], rain = d['past3hprecip-surface'] || [], u = d['wind_u-surface'] || [], v = d['wind_v-surface'] || [];
  const day = (t) => new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: g.tz });
  const days = new Map();
  ts.forEach((t, i) => {
    if (t > Date.now() + 3.5 * 864e5 || t < Date.now() - 3 * 3600e3) return;   // from now on, about 3 days
    const k = day(t), x = days.get(k) || { min: 99, max: -99, rain: 0, wind: 0 };
    const c = temp[i] - 273.15, w = Math.hypot(u[i] || 0, v[i] || 0) * 3.6;
    x.min = Math.min(x.min, c); x.max = Math.max(x.max, c); x.rain += (rain[i] || 0) * 1000; x.wind = Math.max(x.wind, w);
    days.set(k, x);
  });
  const lines = [...days].slice(0, 4).map(([k, x]) => `${k}: ${x.min.toFixed(0)}-${x.max.toFixed(0)} °C, rain ${x.rain < 0.5 ? 'none' : `${x.rain.toFixed(1)} mm`}, wind up to ${x.wind.toFixed(0)} km/h`);
  return lines.length ? { summary: `Forecast for ${g.name} (Windy, GFS model):\n${lines.join('\n')}`, source: 'Windy (GFS forecast)', place: g } : null;
}

// the live weather map for a place (Windy's free embed - no key needed in the page)
export async function windyMap(place, text) {
  const g = await geocode(place || 'India');
  if (!g) return null;
  const overlay = /\brain|radar|storm|cyclone\b/i.test(text) ? 'rain' : /\btemp|heat|hot|cold\b/i.test(text) ? 'temp' : /\bcloud/i.test(text) ? 'clouds' : 'wind';
  return { title: `${overlay[0].toUpperCase()}${overlay.slice(1)} map · ${g.name}`, url: `https://embed.windy.com/embed2.html?lat=${g.lat}&lon=${g.lon}&detailLat=${g.lat}&detailLon=${g.lon}&zoom=7&level=surface&overlay=${overlay}&product=ecmwf&menu=&message=true&marker=true&calendar=now&type=map&location=coordinates&metricWind=km%2Fh&metricTemp=%C2%B0C` };
}
