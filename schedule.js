// Automation schedules, in India time (IST, UTC+5:30). Plain words in, a small schedule object out:
//   { type: 'daily', time: '08:00' }   { type: 'weekdays', time }   { type: 'weekly', day: 1, time }
//   { type: 'interval', minutes: 120 } { type: 'once', at: <ms> }
const IST = 330 * 60000;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// "8", "8 am", "8:30 pm", "20:30", "morning" -> "HH:MM"
function parseTime(t) {
  const m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=\s|$|[.,!?])/i);
  if (m && (m[2] || m[3] || /\b(at|by|around)\s+\d/.test(t))) {
    let h = Number(m[1]); const mi = Number(m[2] || 0); const ap = (m[3] || '').toLowerCase().replace(/\./g, '');
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!ap && h < 12 && /\b(evening|night|tonight)\b/.test(t)) h += 12;
    if (h > 23 || mi > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }
  if (/\bmorning\b/.test(t)) return '08:00';
  if (/\bafternoon\b/.test(t)) return '14:00';
  if (/\bevening\b/.test(t)) return '18:00';
  if (/\b(night|tonight)\b/.test(t)) return '21:00';
  return null;
}

// The moment it is HH:MM in India, `dayOffset` days after the India date of `from`.
function istAt(time, dayOffset, from = Date.now()) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(from + IST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, h, m) - IST;
}

export function parseSchedule(text, now = Date.now()) {
  const t = String(text || '').toLowerCase();
  let m;
  if ((m = t.match(/\bevery\s+(\d{1,3})\s*(hours?|hrs?|minutes?|mins?)\b/))) {
    const minutes = Number(m[1]) * (/^h/.test(m[2]) ? 60 : 1);
    return minutes >= 15 && minutes <= 7 * 24 * 60 ? { type: 'interval', minutes } : null; // not more often than every 15 min
  }
  if (/\bevery\s+hour\b|\bhourly\b/.test(t)) return { type: 'interval', minutes: 60 };
  if ((m = t.match(/\bin\s+(\d{1,3})\s*(minutes?|mins?|hours?|hrs?)\b/))) {
    return { type: 'once', at: now + Number(m[1]) * (/^h/.test(m[2]) ? 3600000 : 60000) };
  }
  const time = parseTime(t);
  if (!time) return null;
  if (/\b(weekdays?|every working day|monday to friday|mon-fri)\b/.test(t)) return { type: 'weekdays', time };
  const day = DAYS.findIndex((d) => new RegExp(`\\b${d}s?\\b`).test(t));
  // "every friday" / "fridays" repeat; "on friday" is once (below).
  if (day >= 0 && (/\b(every|each)\b/.test(t) || new RegExp(`\\b${DAYS[day]}s\\b`).test(t))) return { type: 'weekly', day, time };
  if (/\b(every|each|daily|everyday)\b/.test(t)) return { type: 'daily', time };
  if (/\btomorrow\b/.test(t)) return { type: 'once', at: istAt(time, 1, now) };
  if (day >= 0) { // "on friday at 6" = the next friday
    for (let d = 0; d <= 7; d++) { const at = istAt(time, d, now); if (at > now && new Date(at + IST).getUTCDay() === day) return { type: 'once', at }; }
  }
  const today = istAt(time, 0, now);
  return { type: 'once', at: today > now ? today : istAt(time, 1, now) };
}

// "remind me to drink water in 1 minute" -> "remind me to drink water" (the "when" is kept in the schedule).
export function stripWhen(task) {
  return String(task || '')
    .replace(/\b(every|each)\s+(\d+\s*(hours?|hrs?|minutes?|mins?)|day|morning|evening|night|week|weekday|hour|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi, '')
    .replace(/\bin\s+\d{1,3}\s*(minutes?|mins?|hours?|hrs?)\b/gi, '')
    .replace(/\b(at|by|around)\s+\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?(?=\s|$|[,.!?])/gi, '')
    .replace(/\b(tomorrow|tonight|today|daily|hourly|on weekdays|weekdays)\b/gi, '')
    .replace(/\b(in the\s+)?(morning|afternoon|evening|night)\b/gi, '')
    .replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/^[\s,]+|[\s,]+$/g, '').trim();
}

// Check a schedule that came back from the browser (it must be one we could have made).
export function cleanSchedule(s) {
  if (!s || typeof s !== 'object') return null;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time || '') ? s.time : null;
  if (s.type === 'daily' || s.type === 'weekdays') return time ? { type: s.type, time } : null;
  if (s.type === 'weekly') return time && Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 ? { type: 'weekly', day: s.day, time } : null;
  if (s.type === 'interval') return Number.isInteger(s.minutes) && s.minutes >= 15 && s.minutes <= 10080 ? { type: 'interval', minutes: s.minutes } : null;
  if (s.type === 'once') return Number.isFinite(s.at) ? { type: 'once', at: s.at } : null;
  return null;
}

// When it should run next after `from` (null = never again).
export function nextRun(s, from = Date.now()) {
  if (s.type === 'once') return s.at > from - 60000 ? Math.max(s.at, from) : null;
  if (s.type === 'interval') return from + s.minutes * 60000;
  for (let d = 0; d <= 8; d++) {
    const at = istAt(s.time, d, from);
    if (at <= from) continue;
    const dow = new Date(at + IST).getUTCDay();
    if (s.type === 'daily' || (s.type === 'weekdays' && dow >= 1 && dow <= 5) || (s.type === 'weekly' && dow === s.day)) return at;
  }
  return null;
}

const clock = (time) => {
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function describeSchedule(s) {
  if (s.type === 'daily') return `Every day at ${clock(s.time)}`;
  if (s.type === 'weekdays') return `Weekdays at ${clock(s.time)}`;
  if (s.type === 'weekly') return `Every ${cap(DAYS[s.day])} at ${clock(s.time)}`;
  if (s.type === 'interval') return s.minutes % 60 ? `Every ${s.minutes} minutes` : s.minutes === 60 ? 'Every hour' : `Every ${s.minutes / 60} hours`;
  return `Once, ${describeWhen(s.at)}`;
}
export function describeWhen(ms) {
  const d = new Date(ms + IST);
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day} at ${clock(`${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`)}`;
}
