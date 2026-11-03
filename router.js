// The router: before answering, CodeConClave AI decides WHICH of its tools a message needs -
// live data, web, pictures, audio, video, building a game/website, Office files, the user's
// browser or folder, automations, memory, mail. Without this the chat model alone answered
// "I can't create images / I don't have access to your browser" - the tools were there, but
// nothing picked them. A bigger open model (the engine) makes the choice as JSON; clear cases
// (slash commands, "draw a cat") skip it.

export const TOOLS = ['chat', 'live', 'web', 'research', 'image', 'audio', 'video', 'build', 'doc', 'browser', 'files', 'automation', 'remember', 'mail', 'plan', 'code'];

export const ROUTER_SYSTEM = `You are the planner inside CodeConClave AI, an assistant that really CAN do all of these through its tools:
- chat: talk, explain, answer from knowledge, write text/poems/emails-to-copy, maths, small code snippets, advice.
- live: real-time data. args {"kind":"weather|air|crypto|currency|earthquake|space|pincode|dictionary","query":"place / coin / 'USD INR' / word"}.
- web: look up anything current or factual on the internet (news, prices, sports scores, movies, releases, people, companies, "latest", "today", "2026"). args {"query":"search words"}.
- research: a deep, multi-source report when the user asks to research / compare / write a detailed report. args {"question":"..."}.
- image: create / draw / generate / design a picture, logo, poster, wallpaper, art. args {"prompt":"a detailed English description of the picture"}.
- audio: make an audio file / voice note / speak text aloud as a file. args {"text":"exactly what to say","voice":"male|female"}.
- video: make a video / short film / reel / animation about something. args {"topic":"..."}.
- build: make a game, website, web app, landing page, calculator, tool, animation in code (it runs live in a preview). Also changes to the thing just built. args {"kind":"game|website|app","request":"full description of what to build or change"}.
- doc: make an Excel sheet, PowerPoint slides, Word document or PDF. args {"kind":"sheet|slides|word|pdf","request":"..."}.
- browser: open a website or search on a site in the user's own browser (YouTube, Google, Amazon, maps...). args {"url":"https://... the exact page to open, with the search words in it"}.
- files: the user's local files/folder on their computer (list, read, summarise, edit, create a file). args {"action":"list|read|edit|create","target":"file name or empty","detail":"what to do"}.
- automation: do something later or repeatedly (remind me, every day at 8, every Monday, when X happens). args {"when":"...","what":"..."}.
- remember: the user tells a fact about themselves or something they like ("I love movies", "my name is Ravi", "remember that..."). args {"fact":"the fact, about 'the user'","interest":"one-word topic to watch for news, or empty"}.
- mail: their Gmail - check inbox, read, reply, write an email. args {"action":"check|find|reply|write","target":"person or email","detail":"what to say"}.
- plan: a big multi-step goal ("plan and do...", "help me launch..."). args {"goal":"..."}.
Pick exactly ONE tool. Use chat when no tool is needed. Questions ABOUT a topic ("what is an image?", "how do videos work?") are chat, not image/video.
Reply with JSON only: {"tool":"...","args":{...},"say":"one short friendly line TO the user about what you are doing"}`;

const EXAMPLES = [
  ['weather in ongole', { tool: 'live', args: { kind: 'weather', query: 'Ongole' }, say: 'Getting the live weather in Ongole.' }],
  ['create an image of a tiger in the snow', { tool: 'image', args: { prompt: 'a majestic tiger walking through fresh snow, soft morning light, detailed, realistic' }, say: 'Drawing a tiger in the snow for you.' }],
  ['open youtube and search arijit songs', { tool: 'browser', args: { url: 'https://www.youtube.com/results?search_query=arijit+songs' }, say: 'Opening YouTube with Arijit songs.' }],
  ['make a flappy bird type game', { tool: 'build', args: { kind: 'game', request: 'a flappy-bird style game: tap/space to flap, pipes, score, game over and restart, works on phones' }, say: 'Building the game - you can play it right here.' }],
  ['read my local files', { tool: 'files', args: { action: 'list', target: '', detail: 'show the files in the connected folder' }, say: 'Let me look at the files in your folder.' }],
  ['i love movies', { tool: 'remember', args: { fact: 'The user loves movies', interest: 'movies' }, say: 'Noted - I will tell you when new movies come out.' }],
  ['who won the last ipl final?', { tool: 'web', args: { query: 'IPL final winner latest' }, say: 'Checking the latest result.' }],
  ['what is recursion?', { tool: 'chat', args: {}, say: '' }],
];
export const ROUTER_EXAMPLES = EXAMPLES.flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: JSON.stringify(a) }]);

// Clear cases that need no thinking (fast, and the router's model is never asked).
const SLASH = { image: 'image', img: 'image', draw: 'image', audio: 'audio', voice: 'audio', video: 'video', game: 'build', website: 'build', site: 'build', app: 'build', build: 'build',
  web: 'web', search: 'web', research: 'research', sheet: 'doc', excel: 'doc', slides: 'doc', ppt: 'doc', word: 'doc', pdf: 'doc', open: 'browser', files: 'files', remember: 'remember', automate: 'automation', remind: 'automation', plan: 'plan', weather: 'live', code: 'code' };
const DOC_KIND = { sheet: 'sheet', excel: 'sheet', slides: 'slides', ppt: 'slides', word: 'word', pdf: 'pdf' };
export function slashRoute(text) {
  const m = String(text || '').trim().match(/^\/([a-z]+)\b\s*([\s\S]*)$/i);
  if (!m) return null;
  const cmd = m[1].toLowerCase(), rest = m[2].trim();
  const tool = SLASH[cmd];
  if (!tool) return null;
  const args = {
    image: { prompt: rest }, audio: { text: rest, voice: 'male' }, video: { topic: rest }, web: { query: rest }, research: { question: rest },
    build: { kind: cmd === 'game' ? 'game' : cmd === 'app' ? 'app' : 'website', request: rest }, doc: { kind: DOC_KIND[cmd] || 'word', request: rest },
    browser: { url: /^https?:\/\//.test(rest) ? rest : `https://www.google.com/search?q=${encodeURIComponent(rest)}` }, files: { action: 'list', target: rest, detail: rest },
    remember: { fact: rest, interest: '' }, automation: { when: rest, what: rest }, plan: { goal: rest }, live: { kind: 'weather', query: rest }, code: { goal: rest },
  }[tool];
  return rest || tool === 'files' ? { tool, args, say: '' } : null;
}

const DRAW = /\b(create|make|generate|draw|paint|design|show me|give me|render)\b[^.?!]{0,30}\b(an? )?(image|picture|photo|pic|drawing|painting|illustration|wallpaper|poster|logo|art(work)?|portrait|sketch)\b/i;
const GAME = /\b(create|make|build|code|generate|develop|write)\b[^.?!]{0,30}\b(game|website|web ?site|web ?page|landing page|web app|portfolio site|html page)\b/i;
const VIDEO = /\b(create|make|generate|produce)\b[^.?!]{0,30}\b(video|reel|short film|animation|clip)\b/i;
const AUDIO = /\b(create|make|generate|record|give me)\b[^.?!]{0,30}\b(audio|voice note|voice message|mp3|wav|sound file|speech file)\b/i;
const LOCAL = /\b(my|local|laptop|computer|pc)('s)?\s+(local\s+)?(files?|folders?|documents|downloads|desktop|drive)\b|\b(files?|folders?) (on|in|from) my (laptop|computer|pc|system|device)\b/i;
export function quickRoute(text) {
  const t = String(text || '');
  if (/^\s*(what|why|how|explain|define|is|are|does|do)\b[^.?!]{0,40}\b(image|video|game|website|audio)s?\b[^.?!]*\?\s*$/i.test(t) && !/\b(make|create|draw|build|generate)\b/i.test(t)) return null;
  if (DRAW.test(t)) return { tool: 'image', args: { prompt: t.replace(/^.*?\b(of|showing|with|about)\b\s*/i, '') || t }, say: '' };
  if (VIDEO.test(t)) return { tool: 'video', args: { topic: t.replace(/^.*?\b(about|of|on|showing)\b\s*/i, '') || t }, say: '' };
  if (AUDIO.test(t)) return null;   // what to say needs the router
  if (GAME.test(t)) return { tool: 'build', args: { kind: /\bgame\b/i.test(t) ? 'game' : 'website', request: t }, say: '' };
  if (LOCAL.test(t)) return { tool: 'files', args: { action: /\b(edit|change|fix|update)\b/i.test(t) ? 'edit' : /\b(create|make|new)\b/i.test(t) ? 'create' : /\b(read|open|summari[sz]e|explain)\b/i.test(t) ? 'read' : 'list', target: '', detail: t }, say: '' };
  return null;
}

// Messages that obviously need no tool: greetings, thanks, feelings, short chit-chat.
export function obviousChat(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return true;
  if (/^(hi|hii+|hello|hey|yo|hola|namaste|good (morning|afternoon|evening|night)|thanks?( you)?|thank u|ok(ay)?|cool|nice|great|bye|lol|haha+|hmm+|yes|no|sure)[!. ]*$/.test(t)) return true;
  return false;
}

// Pull the first JSON object out of the model's reply and keep it only if it is a real tool.
export function parseRoute(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  const whole = parseWhole(s, start);
  if (whole) return whole;
  // cut off before the end (ran out of tokens): the tool name alone is still a good answer
  const t = s.match(/"tool"\s*:\s*"([a-z]+)"/);
  if (!t || !TOOLS.includes(t[1])) return null;
  const args = {};
  for (const m of s.matchAll(/"(kind|query|prompt|text|voice|topic|request|url|action|target|detail|when|what|fact|interest|goal|question)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) args[m[1]] = m[2];
  return { tool: t[1], args, say: '' };
}
function parseWhole(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) {
      try {
        const o = JSON.parse(s.slice(start, i + 1));
        if (!TOOLS.includes(o?.tool)) return null;
        return { tool: o.tool, args: o.args && typeof o.args === 'object' ? o.args : {}, say: String(o.say || '').slice(0, 200) };
      } catch { return null; }
    }
  }
  return null;
}
