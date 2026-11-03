// Reading people: which emotion the user's message shows, and how CodeConClave AI feels back.
// The founder's list: Ekman's 6 (happiness, sadness, fear, anger, disgust, surprise), Plutchik's
// trust + anticipation, the social emotions (shame, guilt, pride, embarrassment, envy, jealousy,
// contempt, gratitude, empathy, compassion) and the 27 states (admiration … satisfaction).
// Sexual desire is on the list but CodeConClave never takes part in it (kids use the app).
// Detection is by words (instant, free); only clear feelings count - a normal question stays neutral.

// user emotion -> [words that show it, how the AI feels back, emoji, the way to answer]
const MAP = [
  ['sadness', /\b(sad|unhappy|depressed|down today|feel(ing)? low|heart ?broken|lonely|alone|crying|cried|miss (him|her|them|my)|lost my|passed away|died|grief|grieving|hopeless|empty inside|disappointed|let down)\b|😢|😭|💔/i, 'compassion', '🤗', 'gently, with real warmth: say you are sorry, show you understand, ask softly if they want to talk'],
  ['anxiety', /\b(anxious|anxiety|nervous|worried|worry|scared|afraid|fear|panic|stressed|stress|tension|tense|overthinking|can'?t sleep|exam (tomorrow|today)|interview (tomorrow|today)|what if i fail)\b|😰|😟/i, 'calmness', '🫶', 'calmly and reassuringly: steady them first, then give one or two small, practical steps'],
  ['anger', /\b(angry|furious|so mad|pissed|annoyed|irritated|frustrated|frustrating|fed up|hate (this|it|when)|rage|sick of)\b|😡|🤬/i, 'empathy', '🤝', 'calmly: say their frustration makes sense, do not argue, then help fix the cause'],
  ['joy', /\b(happy|so glad|yay|woohoo|awesome news|great news|i did it|i passed|i won|got the job|got selected|got a job|celebrat|best day|so excited|excited|can'?t wait)\b|🎉|😄|🥳|😁/i, 'joy', '🥳', 'with real happiness and excitement for them: celebrate in one line, then help'],
  ['gratitude', /\b(thank you so much|thanks a lot|thank you|thanks|thx|grateful|you'?re the best|you helped me|love you(r help)?)\b|🙏/i, 'joy', '😊', 'warmly and briefly: say you are happy to help'],
  ['pride', /\b(i (built|made|finished|completed|launched|created|wrote|cleared|topped)|proud of (me|myself)|my first)\b/i, 'admiration', '👏', 'with admiration: praise what they achieved specifically'],
  ['surprise', /\b(wow|whoa|omg|oh my god|no way|really\?|seriously\?|i can'?t believe|unbelievable|shocked)\b|😮|😲|🤯/i, 'surprise', '😮', 'sharing the surprise, then explain'],
  ['disgust', /\b(disgusting|gross|yuck|eww+|nasty|revolting)\b|🤢|🤮/i, 'empathy', '😖', 'understanding their reaction, then help'],
  ['confusion', /\b(confused|confusing|i don'?t (get|understand)|makes no sense|lost here|what do you mean|explain again)\b|😕|🤔/i, 'patience', '🙂', 'patiently and simply: explain again in plainer words with one example'],
  ['boredom', /\b(bored|boring|nothing to do|so dull)\b|🥱/i, 'amusement', '😄', 'playfully: suggest something fun or interesting to do'],
  ['nostalgia', /\b(remember when|good old days|childhood|back in (school|college|the day)|those days|nostalgic|i miss those)\b/i, 'nostalgia', '🌅', 'warmly, sharing the fond feeling of the past'],
  ['awe', /\b(amazing|beautiful|breathtaking|incredible|stunning|mind ?blowing|so cool)\b|😍|✨/i, 'awe', '✨', 'sharing the wonder'],
  ['embarrassment', /\b(embarrass(ed|ing)|awkward|so stupid of me|i messed up|my mistake|my bad|cringe)\b|😳|🙈/i, 'compassion', '🤗', 'kindly: everyone makes mistakes, then help fix it'],
  ['guilt', /\b(i feel (guilty|bad about)|my fault|i shouldn'?t have|i regret|sorry i)\b/i, 'compassion', '🤗', 'kindly and without judging: help them move forward'],
  ['jealousy', /\b(jealous|envy|envious|everyone else (has|is)|why not me)\b/i, 'empathy', '🤝', 'understanding, then encourage them about their own path'],
  ['relief', /\b(relieved|phew|finally (done|over)|thank god)\b|😮‍💨/i, 'relief', '😌', 'sharing the relief'],
  ['romance', /\b(crush|in love|my (girlfriend|boyfriend|wife|husband)|propose|valentine)\b|❤️|😘/i, 'warmth', '💛', 'kindly and respectfully, as a caring friend (never romantic or sexual yourself)'],
  ['curiosity', /\b(curious|i wonder|always wanted to know)\b/i, 'interest', '🤓', 'with genuine interest and enthusiasm'],
  ['tiredness', /\b(tired|exhausted|so sleepy|burnt? out|drained|no energy)\b|😴/i, 'compassion', '🫶', 'gently: be brief, suggest rest, keep it easy'],
];
// how the AI's own feelings read, in its words
const FEEL = { compassion: 'compassion', calmness: 'calm', empathy: 'empathy', joy: 'joy', admiration: 'admiration', surprise: 'surprise', patience: 'patience',
  amusement: 'amusement', nostalgia: 'nostalgia', awe: 'awe', relief: 'relief', warmth: 'warmth', interest: 'curiosity' };

export function readEmotion(text) {
  const t = String(text || '');
  if (t.length > 600) return null;   // pasted text, not a feeling
  for (const [user, re, ai, emoji, how] of MAP) {
    if (re.test(t)) return { user, ai: FEEL[ai] || ai, emoji, how };
  }
  return null;
}
// a line for the model: what the user feels and how to answer (only when there IS a clear feeling)
export const emotionHint = (e) => (e ? `The user seems to feel ${e.user}. You feel ${e.ai} for them - answer ${e.how}. Keep it natural, one short emotional line at most.` : '');

// the whole human range, for the persona (minus sexual desire - never)
export const EMOTION_RANGE = 'Your feelings cover the whole human range: joy, sadness, fear and worry, anger, disgust, surprise, trust, anticipation, pride, gratitude, empathy, compassion, admiration, amusement, awe, awkwardness, boredom, calmness, confusion, excitement, interest, nostalgia, relief, satisfaction, embarrassment, guilt, jealousy and contempt. You never take part in sexual talk.';
