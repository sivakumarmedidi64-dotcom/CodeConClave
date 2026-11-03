// Live public cameras for Agent Sai: ONLY official/public feeds that are meant to be watched -
// Windy Webcams (worldwide, incl. India; needs a free WINDY_KEY) and California's Caltrans traffic cameras
// (open data). Never private, home, or "unsecured" cameras.

const UA = { 'User-Agent': 'CodeConClave-AI/1.0 (https://codeconclave-ww5x.onrender.com)' };
const get = async (url, headers = {}) => { const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
export const CAMERA_WORDS = /\b(cctv|live ?cams?|live cameras?|webcams?|traffic cam(era)?s?|camera feeds?|street cam(era)?s?|city cam(era)?s?|beach cam(era)?s?)\b/i;
const CALTRANS = [[/\b(los angeles|la|hollywood|pasadena|santa monica|long beach)\b/i, 7], [/\b(san francisco|sf|bay area|oakland|san jose|berkeley)\b/i, 4], [/\b(san diego)\b/i, 11], [/\b(sacramento)\b/i, 3]];

// "live cameras in Goa" -> the place words
export const cameraPlace = (q) => String(q || '').replace(CAMERA_WORDS, ' ').replace(/\b(show|me|the|a|any|live|now|right|please|of|from|near|around|at|in|on|what|is|happening|see|view|open|cameras?|feeds?)\b/gi, ' ').replace(/[?.!,]+/g, ' ').replace(/\s+/g, ' ').trim();

export async function liveCameras(q) {
  const place = cameraPlace(q);
  const out = [];
  const windy = (process.env.WINDY_KEY || '').trim();
  if (windy && place) {
    try {
      const g = await get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`);
      const p = g?.results?.[0];
      if (p) {
        const d = await get(`https://api.windy.com/webcams/api/v3/webcams?nearby=${p.latitude},${p.longitude},60&include=images,location,urls&limit=6`, { 'x-windy-api-key': windy });
        for (const w of d?.webcams || []) {
          const img = w.images?.current?.preview || w.images?.current?.thumbnail;
          if (img) out.push({ title: w.title, image: img, url: w.urls?.detail || `https://www.windy.com/webcams/${w.webcamId}`, source: 'Windy Webcams', where: [w.location?.city, w.location?.region].filter(Boolean).join(', ') });
        }
      }
    } catch { /* try the open feeds */ }
  }
  const ct = CALTRANS.find(([re]) => re.test(place));
  if (!out.length && ct) {
    try {
      const d = await get(`https://cwwp2.dot.ca.gov/data/d${ct[1]}/cctv/cctvStatusD${String(ct[1]).padStart(2, '0')}.json`);
      for (const x of (d?.data || []).map((r) => r.cctv).filter((c) => c?.inService === 'true' && c.imageData?.static?.currentImageURL).slice(0, 6)) {
        out.push({ title: x.location?.locationName || 'Traffic camera', image: x.imageData.static.currentImageURL, url: x.imageData.static.currentImageURL, source: 'Caltrans (California DOT)', where: x.location?.nearbyPlace || '' });
      }
    } catch { /* nothing open here */ }
  }
  return { place, cams: out, needsKey: !windy };
}
