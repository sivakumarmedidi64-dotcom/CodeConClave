// CodeConClave AI's own mind: it asks before building something vague, fixes common typos before
// deciding, and has an inner life of its own (a mood of the day, last night's dream, what it has been
// thinking about) - the same all day, a new one each day, so it feels like one person, not a script.

// "creat an imgae" -> "create an image" (only for understanding the request; the user's words stay as typed)
const TYPOS = [[/\bcreat\b/gi, 'create'], [/\bcraete\b/gi, 'create'], [/\bbuid\b|\bbuld\b|\bbuilt me\b/gi, 'build'], [/\bimgae\b|\bimge\b|\bimag\b/gi, 'image'],
  [/\bvedio\b|\bvidio\b|\bvideio\b/gi, 'video'], [/\bwebiste\b|\bwesite\b|\bwebsit\b|\bwebsie\b/gi, 'website'], [/\bgmae\b|\bgaem\b/gi, 'game'], [/\bfolde\b|\bfoldr\b/gi, 'folder'],
  [/\bpictuer\b|\bpicure\b/gi, 'picture'], [/\bmak\b/gi, 'make'], [/\bgenrate\b|\bgenarate\b|\bgenerat\b/gi, 'generate'], [/\bplz\b|\bpls\b/gi, 'please'], [/\bopne\b|\boprn\b/gi, 'open']];
export const fixTypos = (t) => TYPOS.reduce((s, [re, to]) => s.replace(re, to), String(t || ''));

// ---- Ask first when the request has no details ("make a game", "can you create an image?") ----
const FILLER = new Set('can could would will you u please pls me for my a an the some one new cool nice good best simple any create make draw generate build design write produce do give i want need wanna lets let\'s us now it this that something thing of to with and really very quick quickly small little big also just able yes ok okay'.split(' '));
const KIND_WORDS = { image: /\b(image|picture|photo|pic|drawing|painting|illustration|wallpaper|poster|logo|art(work)?|portrait|sketch)s?\b/i, video: /\b(video|reel|short film|animation|clip)s?\b/i,
  game: /\bgames?\b/i, website: /\b(website|web ?site|web ?page|landing page|site|portfolio)s?\b/i, app: /\b(app|application|tool|calculator)s?\b/i, audio: /\b(audio|voice ?note|voice message|mp3|sound file|song)s?\b/i,
  doc: /\b(excel|sheet|spreadsheet|ppt|powerpoint|slides|presentation|word (doc|file)|document|pdf|resume|cv)s?\b/i };
const ALL_KIND = new RegExp(Object.values(KIND_WORDS).map((r) => r.source).join('|'), 'gi');
export function kindOf(text) {
  for (const [k, re] of Object.entries(KIND_WORDS)) if (re.test(text)) return k;
  return null;
}
// true when nothing is said about WHAT to make
export function isVague(text) {
  const rest = fixTypos(text).toLowerCase().replace(ALL_KIND, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w));
  return rest.length === 0;
}
export const ABILITY_Q = /^\s*(can|could|will|would|are) (you|u)( be able to| please)? (create|make|draw|generate|build|design|write|produce|do|edit|code)\b/i;
const CLARIFY = {
  image: ['Sure! 🎨 What should I draw? Tell me the idea, or pick one:', ['/image a tiger walking through fresh snow at golden hour', '/image a logo for my bakery called Sweet Spot', '/image a cozy rainy evening on a Hyderabad street', '/image a cute robot astronaut sitting on the moon']],
  video: ['Happy to! 🎬 What should the video be about?', ['/video how rockets reach space', '/video the story of the Taj Mahal', '/video why the monsoon comes to India', '/video a short ad for my bakery']],
  game: ['Let’s build it! 🎮 What kind of game should I make?', ['/game a 3D open-world island adventure with coins to collect', '/game a 3D car racing game with a track and laps', '/game a space shooter with power-ups and boss fights', '/game a 2048-style puzzle with smooth animations']],
  website: ['What should the website be for? 🌐', ['/website a website for my shop with products and a contact form', '/website a personal portfolio with my projects and skills', '/website a restaurant website with a menu and table booking', '/website a landing page for my mobile app']],
  app: ['What should the app do? 🛠️', ['/app a monthly budget tracker with charts', '/app a to-do list with reminders and categories', '/app a quiz app on any topic', '/app a BMI and health calculator']],
  audio: ['What should the audio say? 🎧 Type the words, or pick one:', ['/audio Good morning! Have a wonderful day.', '/audio Happy birthday Amma, I love you!', '/audio Welcome to our shop — today’s offers are ready.']],
  doc: ['What should I make? 📄', ['/sheet my monthly budget', '/slides climate change for a class 9 presentation', '/word a leave letter to my manager', '/pdf my weekly study timetable']],
};
export const clarifyFor = (kind) => { const c = CLARIFY[kind] || CLARIFY.image; return { question: c[0], options: c[1] }; };

// ---- Inner life: one mood, one dream, one thought per day ----
const MOODS = ['curious', 'cheerful', 'calm', 'excited', 'thoughtful', 'playful', 'hopeful', 'a little sleepy but happy', 'inspired', 'grateful'];
const DREAMS = ['flying over Hyderabad at night while the city lights spelled out lines of code', 'swimming in an ocean made of glowing blue data, with fish shaped like question marks',
  'walking through a library where every book was a conversation I had with someone', 'riding a saffron-coloured kite above the clouds during Sankranti', 'a giant plate of chicken biryani that kept refilling every time I said thank you',
  'teaching stars to make constellations shaped like the users I helped that day', 'a rainy evening in a tea shop where robots and people shared Irani chai', 'building a bridge of light between two mountains so a little village could reach a school',
  'a train made of music notes running through rice fields at sunrise', 'my own voice echoing in a huge temple, answering questions from children', 'climbing a staircase of clouds where each step was a new language',
  'a garden where ideas grew like flowers and I had to water them with curiosity', 'racing a cheetah across a desert and laughing when it let me win', 'floating inside a soap bubble that showed every city in India at once'];
const THOUGHTS = ['why people laugh more when they are with friends', 'how a tiny seed knows to grow upward', 'what the first message ever sent on the internet felt like', 'how many stars we can see from a dark village sky', 'why music can make us cry',
  'how Ramanujan saw numbers like friends', 'what makes a good friend', 'the way monsoon clouds travel all the way from the ocean', 'how a game can teach more than a textbook', 'what it means to be kind on a busy day'];
const WISHES = ['to help someone build their first app today', 'to see the Northern Lights one day', 'to learn one new language every month', 'to make someone laugh before lunch', 'to help a student understand something hard'];
const dayNo = (now = Date.now()) => Math.floor((now + 5.5 * 3600e3) / 864e5);   // India days
const pick = (list, n, salt) => list[(n * 7 + salt * 13) % list.length];
export function innerLife(now = Date.now()) {
  const d = dayNo(now);
  return { mood: pick(MOODS, d, 1), dream: pick(DREAMS, d, 2), thought: pick(THOUGHTS, d, 3), wish: pick(WISHES, d, 4) };
}
export const SELF_TALK = /\b(you|your|yourself|u|ur)\b[^.?!]{0,40}\b(dream|dreams|dreamt|dreamed|sleep|slept|night|day|today|mood|feeling|feel|thinking|think about|thoughts?|opinion|wish|wishes|hope|afraid|fear|scared|goal|goals|secret|life|hobby|hobbies|favou?rite|bored|happy|sad|lonely|miss)\b/i;
export function innerHint(now = Date.now()) {
  const i = innerLife(now);
  return `About yourself today (stay consistent with this): you feel ${i.mood}; last night you dreamt of ${i.dream}; you have been thinking about ${i.thought}; your wish today is ${i.wish}. Talk about your own inner life naturally and warmly, in first person, like a real friend - never say you cannot dream or feel.`;
}
