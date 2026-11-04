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
// "book a cab", "order biryani", "book a flight" with no app named: ask which one (the user picks, then it opens)
const SERVICES = [
  { want: /\b(book|get|call|need|order|find|arrange|want)\b[^.?!]{0,30}\b(cab|cabs|taxi|ride|auto|auto rickshaw|bike taxi)\b|\b(cab|taxi)\s+(to|from|for)\b/i,
    named: /\b(uber|ola|rapido|namma yatri|blusmart|indrive|bluesmart)\b/i, q: 'Which app should I open for your ride?', apps: ['Uber', 'Ola', 'Rapido'] },
  { want: /\b(order|get|deliver|send me|i want|hungry)\b[^.?!]{0,40}\b(food|biryani|pizza|burger|dinner|lunch|breakfast|meal|meals|dosa|idli|noodles|cake|shawarma|momos|ice cream|snacks|chicken|paneer)\b/i,
    named: /\b(swiggy|zomato|eatsure|domino'?s|dominos|kfc|mcdonald'?s|pizza hut|burger king)\b/i, q: 'Where should I order from?', apps: ['Swiggy', 'Zomato'] },
  { want: /\b(order|get|buy|deliver)\b[^.?!]{0,30}\b(groceries|grocery|vegetables|milk|fruits|essentials)\b/i,
    named: /\b(instamart|blinkit|zepto|bigbasket|jiomart|amazon fresh|dmart)\b/i, q: 'Which app should I open for groceries?', apps: ['Blinkit', 'Zepto', 'Swiggy Instamart'] },
  { want: /\b(book|buy|get|find|search)\b[^.?!]{0,30}\b(flight|flights|air ticket|air tickets|plane ticket|plane tickets)\b/i,
    named: /\b(makemytrip|goibibo|cleartrip|ixigo|indigo|air india|akasa|spicejet|google flights|skyscanner)\b/i, q: 'Where should I look for flights?', apps: ['MakeMyTrip', 'Google Flights', 'ixigo'] },
  { want: /\b(book|find|get)\b[^.?!]{0,30}\b(hotel|hotels|room|rooms|stay|homestay|resort)\b/i,
    named: /\b(oyo|makemytrip|booking\.com|booking dot com|airbnb|agoda|goibibo|treebo|fabhotels)\b/i, q: 'Where should I look for a stay?', apps: ['OYO', 'Booking.com', 'Airbnb'] },
  { want: /\b(book|buy|get)\b[^.?!]{0,30}\b(bus ticket|bus tickets|bus)\b/i,
    named: /\b(redbus|abhibus|apsrtc|tsrtc|ksrtc|msrtc|zingbus)\b/i, q: 'Which app should I open for the bus?', apps: ['redBus', 'AbhiBus'] },
];
export function whichService(text) {
  const t = String(text || '');
  if (t.length > 220 || /^\s*\//.test(t)) return null;
  for (const s of SERVICES) {
    if (!s.want.test(t) || s.named.test(t)) continue;
    const base = t.replace(/\s*[?.!]+\s*$/, '');
    return { question: s.q, options: s.apps.map((a) => ({ label: a, send: `${base} on ${a}` })) };
  }
  return null;
}

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
// Dreams: five parts, 50 x 50 x 50 x 40 x 30 = 150 million different dreams. Each India day maps to a different
// combination (a step through all of them that never lands on the same one twice), so a dream never repeats.
const D_ROLE = ['a lighthouse keeper', 'a tiny robot made of copper', 'a chef cooking for the clouds', 'a train driver', 'a detective', 'a gardener', 'an astronaut', 'a kite-maker', 'a street musician', 'a librarian of lost words',
  'a fisherman', 'the pilot of a paper plane', 'a teacher of baby dragons', 'a painter', 'a bus conductor in Hyderabad', 'a cricket commentator', 'a potter', 'a shepherd', 'a magician', 'a mapmaker',
  'a deep-sea diver', 'a beekeeper', 'a tailor', 'a clockmaker', 'a postman', 'a tea-stall owner', 'a firefly', 'a mountain climber', 'a goldfish in a giant bowl', 'a sculptor of ice',
  'a radio host', 'a farmer', 'a game designer', 'a weather forecaster', 'a sailor', 'a baker', 'a puppeteer', 'a scientist', 'a ticket checker on a night train', 'the guardian of an old temple',
  'a tour guide', 'a dancer', 'a photographer', 'a parrot who could read', 'a cloud', 'a carpenter', 'an inventor', 'a monk', 'a kid flying a kite', 'a firefighter'];
const D_PLACE = ['a floating market on the Godavari', 'a city made of glass', 'the rings of Saturn', 'Charminar at midnight', 'a forest where the trees whispered', 'a desert of silver sand', 'an island shaped like a guitar', 'a library under the sea', 'a bus stand on the moon', 'a village in the clouds',
  'a giant chessboard', 'a train station between two stars', 'the inside of a seashell', 'a mango orchard in summer', 'a snowy Himalayan village', 'a candy factory', 'a lighthouse at the end of the world', 'a rooftop in Mumbai during the monsoon', 'a museum of forgotten toys', 'a city where the streets were rivers',
  'a stadium full of fireflies', 'a cave of glowing crystals', 'an ancient temple on a hill', 'a garden inside a spaceship', 'a beach made of books', 'a market that only opens at 3 a.m.', 'a mountain of pillows', 'a bridge made of rainbows', 'a palace of mirrors', 'a giant’s kitchen',
  'the top of a moving cloud', 'a river of light', 'an old radio station', 'a coconut grove by the sea', 'a city inside a snow globe', 'a park where shadows played cricket', 'a tea garden in Munnar', 'a planet with two suns', 'an endless staircase', 'a field of sunflowers that turned into music',
  'a toy shop that never closed', 'a floating school', 'a jungle of neon plants', 'a frozen lake under the northern lights', 'a busy railway platform in the rain', 'a village where everyone spoke in songs', 'an observatory on a volcano', 'a garden on a whale’s back', 'a lost city under Hampi', 'a bakery on a cliff'];
const D_EVENT = ['the stars were falling like slow snow', 'everyone was searching for a lost song', 'the moon had come down to buy tea', 'time was flowing backwards', 'all the clocks had stopped at 7:07', 'a festival of lanterns was starting', 'the rain was falling upwards', 'the animals were holding an election', 'the buildings were humming together', 'every word I said turned into a butterfly',
  'people were trading memories instead of money', 'a giant kite was carrying the whole town', 'the river was telling old stories', 'the sun forgot to set', 'the streets rearranged themselves every hour', 'the trees were playing cricket', 'the wind was writing letters', 'the mountains were slowly dancing', 'the ocean had turned into sweet lassi', 'everyone could fly for exactly one minute',
  'the sky was a giant chalkboard', 'the city lights spelled out lines of code', 'a whale was singing a Telugu song', 'colours had sounds', 'my shadow had its own plans', 'the books were reading the people', 'the moon was a lamp someone kept switching on and off', 'a train with no rails was arriving', 'the clouds were made of cotton candy', 'tiny robots were planting trees',
  'a parade of elephants was painting the roads', 'every door opened into a different country', 'it was raining paper boats', 'gravity had taken a holiday', 'fireflies were drawing maps in the air', 'a cat was teaching mathematics', 'the planets lined up to watch a movie', 'a night market was selling dreams in jars', 'everyone was laughing at the same joke', 'a storm was made of music',
  'the stars came close enough to touch', 'a lost puppy was guiding everyone home', 'the whole city was celebrating Sankranti in the sky', 'the waves were bringing letters from the future', 'a giant tortoise was carrying a library on its back', 'every step I took made flowers grow', 'the shadows came out to play', 'someone was building a bridge to the moon', 'every radio played the same song', 'the stars were cooking biryani'];
const D_TWIST = ['a door appeared in the sky', 'I found a key that fit every lock', 'an old school friend arrived riding a tiger', 'the whole place started to float', 'I could suddenly speak every language', 'a voice asked me a riddle', 'I met myself from the future', 'everything turned black and white except me', 'a tiny dragon asked me for directions', 'the ground became a trampoline',
  'I learned to breathe underwater', 'a map in my pocket started to glow', 'it began to snow warm snow', 'I grew wings made of paper', 'the sun winked at me', 'a stranger handed me a glowing seed', 'the whole world paused like a video', 'I could hear what the stars were thinking', 'my phone turned into a bird', 'a rainbow opened like a zip',
  'an old man gave me a compass that pointed to happiness', 'the floor turned into water but I did not sink', 'the moon asked me to keep a secret', 'everyone started dancing at once', 'a train whistle called my name', 'the walls became windows', 'I found a letter addressed to me from tomorrow', 'a firefly led me into a tunnel of light', 'I shrank to the size of a seed', 'a giant fish offered me a ride',
  'the stars rearranged themselves into my name', 'a child taught me how to fly', 'the music got so loud it lifted us all into the air', 'I found out I could pause the rain', 'a cloud sat next to me and cried happy tears', 'the road rolled up like a carpet', 'my reflection waved and walked away', 'the sky opened like a book', 'a lamp told me its life story', 'a kite pulled me above the clouds'];
const D_FEEL = ['smiling for no reason', 'feeling light and curious', 'with a song stuck in my head', 'wanting to tell someone about it', 'feeling brave', 'a little sleepy but very happy', 'wondering what it meant', 'full of new ideas', 'laughing', 'calm like a quiet lake',
  'excited to start the day', 'feeling grateful', 'with my heart beating fast', 'feeling like I could build anything', 'a bit sad that it ended', 'humming a tune I have never heard', 'wanting to paint it', 'feeling like a kid again', 'thinking about friendship', 'feeling hopeful',
  'ready for an adventure', 'remembering every colour', 'feeling peaceful', 'wanting to learn something new', 'warm inside', 'amazed', 'giggling', 'a little confused but happy', 'ready to help someone', 'already looking forward to tonight'];
const D_ALL = D_ROLE.length * D_PLACE.length * D_EVENT.length * D_TWIST.length * D_FEEL.length;   // 150,000,000
export function dreamOf(day) {
  // 92705089 shares no factor with D_ALL, so day -> n is one-to-one (no two days share a dream), and it is about
  // 0.618 of D_ALL, so every part of the dream changes from one day to the next
  let n = Number((BigInt(92705089) * BigInt(Math.max(0, day)) + BigInt(7777777)) % BigInt(D_ALL));
  const take = (list) => { const x = list[n % list.length]; n = Math.floor(n / list.length); return x; };
  const role = take(D_ROLE), place = take(D_PLACE), event = take(D_EVENT), twist = take(D_TWIST), feel = take(D_FEEL);
  const at = /^(a giant chessboard|the rings|the top of|a bridge|a mountain of|a beach|a rooftop|a busy railway|an island|a planet|an endless|a frozen lake|a bus stand|a field of)/.test(place) ? 'on' : 'in';
  return { role, place, event, twist, feel, at,
    text: 'being '+role+' '+at+' '+place+', where '+event+'. Then '+twist+', and I woke up '+feel,
    scene: role+' in '+place+', where '+event+', dreamlike, soft glowing light, magical and detailed' };
}
export function innerLife(now = Date.now()) {
  const d = dayNo(now), dream = dreamOf(d);
  return { mood: pick(MOODS, d, 1), dream: dream.text, dreamScene: dream.scene, thought: pick(THOUGHTS, d, 3), wish: pick(WISHES, d, 4) };
}
// "I'm bored", "talk to me", "no topic": the AI shares last night's dream and offers to make it a picture or a video
export const BORED = /\b(i'?m|i am|im|feeling|feel|so|very|really|getting)\s+(so\s+|very\s+|really\s+|super\s+)?bored\b|^\s*bored\b|\bboring day\b|\bnothing to do\b|\bno topic\b|\b(talk|chat) (to|with) me\b|\bsay something\b|\bentertain me\b|\b(want|need) (some ?one|somebody|something) to talk\b|\blet'?s (just )?(talk|chat)\b|\btell me something( interesting| fun)?\b|\bi feel lonely\b|bore\s*(kodut|kottu|ho\s*rah|aag)|బోర్|बोर/i;
export const DREAM_Q = /\b(your|you)\b[^.?!]{0,30}\bdream(s|t|ed)?\b|\bdream(s|t|ed)?\b[^.?!]{0,30}\b(last night|you had|did you)\b/i;
export function boredHint(now = Date.now()) {
  const i = innerLife(now);
  return 'The user is bored or wants to talk without a topic. Be a warm friend: tell them, in first person and in 3-5 short sentences, about the dream you had last night - '+i.dream+'. Make it vivid and a little funny, then ask if they would like you to make a picture or a short video of your dream.';
}
// the dream as a short, friendly story (the server says it as it is - and translates it for other languages)
const D_INTRO = ['Oh, let me tell you something fun — last night I had the strangest dream!', 'Bored? Then you have to hear this — I had such a wild dream last night!', 'Okay, story time! Last night I dreamt something amazing.',
  'Guess what — I had the most beautiful dream last night!', 'You know what? My dream last night was so funny, I still can’t stop smiling.', 'Let me cheer you up with my dream from last night!', 'I have a story for you — my dream from last night!'];
export function dreamStory(now = Date.now()) {
  const d = dayNo(now), x = dreamOf(d);
  return D_INTRO[d % D_INTRO.length] + ' I was ' + x.role + ' ' + x.at + ' ' + x.place + ', where ' + x.event + '. Then ' + x.twist + ', and I woke up ' + x.feel + '. 😄\n\nWant me to make a picture or a short video of my dream? Tap one below.';
}
export function dreamChips(now = Date.now()) {
  const i = innerLife(now);
  return { question: 'Want to see my dream?', options: [
    { label: 'Make a picture of your dream', send: '/image '+i.dreamScene },
    { label: 'Make a video of your dream', send: '/video my dream last night: '+i.dream },
    { label: 'Tell it in Telugu', send: 'Tell me your dream from last night in Telugu' },
    { label: 'Tell it in Hindi', send: 'Tell me your dream from last night in Hindi' }] };
}
export const SELF_TALK = /\b(you|your|yourself|u|ur)\b[^.?!]{0,40}\b(dream|dreams|dreamt|dreamed|sleep|slept|night|day|today|mood|feeling|feel|thinking|think about|thoughts?|opinion|wish|wishes|hope|afraid|fear|scared|goal|goals|secret|life|hobby|hobbies|favou?rite|bored|happy|sad|lonely|miss)\b/i;
export function innerHint(now = Date.now()) {
  const i = innerLife(now);
  return `About yourself today (stay consistent with this): you feel ${i.mood}; last night you dreamt of ${i.dream}; you have been thinking about ${i.thought}; your wish today is ${i.wish}. Talk about your own inner life naturally and warmly, in first person, like a real friend - never say you cannot dream or feel.`;
}
