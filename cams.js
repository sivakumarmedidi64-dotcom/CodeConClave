// Live public cameras for Agent Sai: ONLY official/public feeds that are meant to be watched -
// Windy Webcams (worldwide, incl. India; needs a free WINDY_KEY) and California's Caltrans traffic cameras
// (open data). Never private, home, or "unsecured" cameras.

import { geocode } from './windy.js';

const UA = { 'User-Agent': 'CodeConClave-AI/1.0 (https://codeconclave-ww5x.onrender.com)' };
const get = async (url, headers = {}) => { const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
export const CAMERA_WORDS = /\b(cctv|live ?cams?|live cameras?|webcams?|traffic cam(era)?s?|camera feeds?|street cam(era)?s?|city cam(era)?s?|beach cam(era)?s?)\b/i;
const CALTRANS = [[/\b(los angeles|la|hollywood|pasadena|santa monica|long beach)\b/i, 7], [/\b(san francisco|sf|bay area|oakland|san jose|berkeley)\b/i, 4], [/\b(san diego)\b/i, 11], [/\b(sacramento)\b/i, 3]];

// "live cameras in Goa" -> the place words
export const cameraPlace = (q) => String(q || '').replace(CAMERA_WORDS, ' ').replace(/\b(show|me|the|a|any|live|now|right|please|of|from|near|around|at|in|on|what|is|happening|see|view|open|cameras?|feeds?)\b/gi, ' ').replace(/[?.!,]+/g, ' ').replace(/\s+/g, ' ').trim();

export async function liveCameras(q, near) {
  const place = cameraPlace(q);
  const out = [];
  const windy = (process.env.WINDY_WEBCAMS_KEY || process.env.WINDY_KEY || '').trim();
  const mine = near && (!place || /\b(near me|nearby|around me|my area|my location|near here|close to me)\b/i.test(String(q)));
  if (windy && mine) {
    try {
      for (const km of [50, 150, 400]) {
        const d = await get(`https://api.windy.com/webcams/api/v3/webcams?nearby=${near.lat},${near.lon},${km}&include=images,location,urls&limit=8`, { 'x-windy-api-key': windy });
        for (const w of d?.webcams || []) { const img = w.images?.current?.preview || w.images?.current?.thumbnail; if (img) out.push({ title: w.title, image: img, url: w.urls?.detail || `https://www.windy.com/webcams/${w.webcamId}`, source: 'Windy Webcams', where: [w.location?.city, w.location?.region].filter(Boolean).join(', ') }); }
        if (out.length) { if (km > 50) out.wider = `within ${km} km of you`; break; }
      }
    } catch { /* the place name below */ }
    if (out.length) return { place: 'you', cams: out, wider: out.wider || '', needsKey: false };
  }
  if (windy && place) {
    try {
      const p = await geocode(place);
      if (p) {
        let d = await get(`https://api.windy.com/webcams/api/v3/webcams?nearby=${p.lat},${p.lon},100&include=images,location,urls&limit=6`, { 'x-windy-api-key': windy });
        // few public cameras near there (India has only a handful so far): the nearest ones in the same country
        if (!d?.webcams?.length && p.cc) { d = await get(`https://api.windy.com/webcams/api/v3/webcams?countries=${p.cc}&include=images,location,urls&limit=8`, { 'x-windy-api-key': windy }); if (d?.webcams?.length) out.wider = p.country; }
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
  return { place, cams: out, wider: out.wider || '', needsKey: !windy };
}
