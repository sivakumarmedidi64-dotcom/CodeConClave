// CodeConClave AI's always-on brain: the founder's own tuned model, codeconclave-scout
// (a LoRA on Llama 3.2 3B), running on Cloudflare's GPUs - so the AI answers and scheduled
// tasks run even when the laptop is closed. It speaks the same OpenAI-style API as the
// laptop model (/v1/chat/completions, /v1/models), so the app can use either one.
// Locked with BRAIN_KEY (a Worker secret): nobody else can spend the account's AI allowance.
const BASE_MODEL = '@cf/meta/llama-3.2-3b-instruct';
// Seeing pictures: Llama 3.2 11B Vision (open weights; the founder accepted Meta's license on 2026-11-02).
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
// round 2 (2026-11-02): exam 28/30 vs 25 - identity 8/8, same code/facts; 'codeconclave-scout-1' stays uploaded for a quick rollback
const LORA = 'codeconclave-scout-2';
const NAME = 'codeconclave-scout';
// tuned brains the exam may compare (only the live one, LORA, is used by the app)
const TEST_LORAS = new Set(['codeconclave-scout-2', 'codeconclave-scout-r3']);
// Pictures (FLUX, open weights). "fast" = 4 steps, a few seconds; "best" = FLUX.2 klein, sharper.
const IMAGE_MODELS = {
  fast: { id: '@cf/black-forest-labs/flux-1-schnell', steps: 4 },
  best: { id: '@cf/black-forest-labs/flux-2-klein-4b', multipart: true },
};
// Bigger open models for building and agent work (users only ever see "CodeConClave AI").
const ENGINES = {
  builder: '@cf/google/gemma-4-26b-a4b-it',
  agent: '@cf/google/gemma-4-26b-a4b-it',
  lab1: '@cf/zai-org/glm-5.3-flash',
  lab2: '@cf/openai/gpt-oss-120b',
  lab3: '@cf/deepseek-ai/deepseek-v4.1-flash-1017',
  // candidate core-reasoning brain: open weights, the same price per word as the 3B scout (being tested, not used by the app yet)
  qwen3: '@cf/qwen/qwen3-30b-a3b-fp8',
};
// Different models answer in different shapes; pull the text out of any of them.
// reasoningIsAnswer: Qwen3 with thinking switched off puts its answer in reasoning_content (content is null)
function engineText(r, reasoningIsAnswer = false) {
  if (typeof r?.response === 'string') return r.response;
  const c = r?.choices?.[0];
  if (c) return String(c.message?.content ?? c.text ?? (reasoningIsAnswer ? c.message?.reasoning_content ?? c.message?.reasoning : '') ?? '');
  if (Array.isArray(r?.output)) return r.output.flatMap((o) => o?.content || []).map((p) => p?.text || '').join('');
  return r?.response ? JSON.stringify(r.response) : '';
}

const INDIC = { te: 'tel_Telu', hi: 'hin_Deva', ta: 'tam_Taml', kn: 'kan_Knda', ml: 'mal_Mlym', mr: 'mar_Deva', bn: 'ben_Beng', gu: 'guj_Gujr', pa: 'pan_Guru', ur: 'urd_Arab', or: 'ory_Orya', as: 'asm_Beng', ne: 'npi_Deva', sa: 'san_Deva' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

async function authOk(req, env) {
  const want = String(env.BRAIN_KEY || '');
  const got = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!want || got.length !== want.length) return false;
  const enc = new TextEncoder();
  return crypto.subtle.timingSafeEqual(enc.encode(got), enc.encode(want));
}

// The LoRA only works with a raw prompt, so we write the Llama 3 chat format ourselves
// (the same format the adapter was trained with).
function llamaPrompt(messages) {
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  let system = '';
  const rest = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user';
    const content = String(m.content ?? '').trim();
    if (role === 'system' && !rest.length) system += (system ? '\n\n' : '') + content;
    else rest.push({ role: role === 'system' ? 'user' : role, content });
  }
  let p = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nCutting Knowledge Date: December 2023\nToday Date: ${date}\n\n${system}<|eot_id|>`;
  for (const m of rest) p += `<|start_header_id|>${m.role}<|end_header_id|>\n\n${m.content}<|eot_id|>`;
  return `${p}<|start_header_id|>assistant<|end_header_id|>\n\n`;
}

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);

function aiInput(body) {
  const input = {
    prompt: llamaPrompt(Array.isArray(body.messages) ? body.messages.slice(-40) : []),
    raw: true,
    lora: TEST_LORAS.has(body.lora) ? body.lora : LORA,   // the exam can ask for a specific tuned brain
    stream: Boolean(body.stream),
    max_tokens: num(body.max_tokens, 1, 2048) ?? 1024,
    temperature: num(body.temperature, 0, 2) ?? 0.7,
  };
  for (const k of ['top_p', 'frequency_penalty', 'presence_penalty']) {
    const v = num(body[k], -2, 2);
    if (v !== undefined) input[k] = v;
  }
  // The app asks for JSON the llama.cpp way ({type:'json_object', schema}); Cloudflare calls it json_schema.
  const rf = body.response_format;
  if (rf?.schema) input.response_format = { type: 'json_schema', json_schema: rf.schema };
  else if (rf?.type === 'json_object') input.response_format = { type: 'json_object' };
  return input;
}

// Vision requests keep the chat format; only the newest picture is kept (the model sees one at a time).
function visionInput(body) {
  let seen = false;
  const messages = body.messages.slice(-12).reverse().map((m) => {
    if (!Array.isArray(m.content)) return { role: m.role, content: String(m.content ?? '') };
    const parts = m.content.filter((p) => p?.type === 'text' || (p?.type === 'image_url' && !seen && /^data:image\//.test(p.image_url?.url || '') && (seen = true)));
    return { role: m.role, content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts };
  }).reverse();
  return { messages, stream: Boolean(body.stream), max_tokens: num(body.max_tokens, 1, 2048) ?? 1024, temperature: num(body.temperature, 0, 2) ?? 0.5 };
}

// The tuned model sometimes writes training markers like "<|endoftext|>" as plain text; drop them.
const MARKERS = ['<|endoftext|>', '<|eot_id|>', '<|im_end|>', '<|end_of_text|>', '<|im_start|>', '<think>', '</think>'];
const stripMarkers = (s) => MARKERS.reduce((t, m) => t.split(m).join(''), s);
// How many characters at the end of `s` could be the start of a marker (keep those until the next token).
const heldTail = (s) => {
  for (let n = Math.min(s.length, 16); n > 0; n--) if (MARKERS.some((m) => m.startsWith(s.slice(-n)))) return n;
  return 0;
};

// Cloudflare streams {"response":"..."} lines; turn them into OpenAI-style deltas.
function toOpenAIStream(stream, reasoningIsAnswer = false) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = '', pending = '';
  const out = (obj) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
  const emit = (ctl, text) => { if (text) ctl.enqueue(out({ model: NAME, choices: [{ index: 0, delta: { content: text } }] })); };
  return stream.pipeThrough(new TransformStream({
    transform(chunk, ctl) {
      buf += dec.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const d = JSON.parse(payload);
          // Use the exact token text: in "response", tokens like " false" or "2" arrive as JSON
          // booleans/numbers, which loses the space in front ("returnfalse").
          const t = d.choices?.[0]?.text ?? d.choices?.[0]?.delta?.content ?? (reasoningIsAnswer ? d.choices?.[0]?.delta?.reasoning_content ?? d.choices?.[0]?.delta?.reasoning : undefined);   // .delta = the bigger engines' OpenAI-style chunks
          const text = typeof t === 'string' ? t
            : d.response === null || d.response === undefined || typeof d.response === 'object' ? '' : String(d.response);
          if (text) {
            pending = stripMarkers(pending + text);
            const keep = heldTail(pending);
            emit(ctl, pending.slice(0, pending.length - keep));
            pending = pending.slice(pending.length - keep);
          }
        } catch { /* partial or keep-alive line */ }
      }
    },
    flush(ctl) {
      emit(ctl, stripMarkers(pending));
      ctl.enqueue(out({ model: NAME, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
      ctl.enqueue(enc.encode('data: [DONE]\n\n'));
    },
  }));
}

function aiError(e) {
  const msg = String(e?.message || e);
  // 4006 = the account's free AI allowance for today is used up (the app then falls back to the laptop).
  const status = /4006|allocation|quota|limit/i.test(msg) ? 429 : 502;
  // Only callers holding BRAIN_KEY get this far, so the detail is safe to return (the app never shows it).
  return json({ error: { message: status === 429 ? 'The always-on brain has used today\'s allowance.' : 'The always-on brain could not answer.', detail: msg.slice(0, 300) } }, status);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    if (path === '' || path === '/healthz') return json({ ok: true, name: 'CodeConClave AI brain' });
    if (!(await authOk(req, env))) return json({ error: { message: 'Not allowed.' } }, 401);

    // Voice: speech -> text in ~99 languages (Whisper large v3 turbo, open weights)
    if (req.method === 'POST' && path === '/v1/audio/transcriptions') {
      let body;
      try { body = await req.json(); } catch { return json({ error: { message: 'Bad JSON.' } }, 400); }
      const audio = String(body?.audio || '');
      if (!audio || audio.length > 14_000_000 || !/^[A-Za-z0-9+/=]+$/.test(audio.slice(0, 200))) return json({ error: { message: 'Send the audio as base64.' } }, 400);
      // the hint teaches Whisper our names (without it: "Code Conclave", "Sahar Shmadidi")
      const input = { audio, task: 'transcribe', vad_filter: true, initial_prompt: 'CodeConClave AI, Saharsh Medidi.' };
      if (/^[a-z]{2,3}$/.test(body.language || '')) input.language = body.language;
      try {
        const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', input);
        return json({ text: String(r?.text || '').trim(), language: r?.transcription_info?.language || null, seconds: r?.transcription_info?.duration || null });
      } catch (e) { return aiError(e); }
    }
    // Voice: text -> speech (MeloTTS, open weights) for the languages it speaks; others use the device's voices
    if (req.method === 'POST' && path === '/v1/audio/speech') {
      let body;
      try { body = await req.json(); } catch { return json({ error: { message: 'Bad JSON.' } }, 400); }
      const lang = { en: 'en', es: 'es', fr: 'fr', zh: 'zh', ja: 'jp', ko: 'kr' }[String(body?.lang || 'en').slice(0, 2)];
      const text = String(body?.text || '').replace(/```[\s\S]*?```/g, ' (code) ').replace(/[*#_`>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
      if (!lang) return json({ error: { message: 'This language uses the device voice.' } }, 415);
      if (!text) return json({ error: { message: 'Nothing to say.' } }, 400);
      try {
        const r = await env.AI.run('@cf/myshell-ai/melotts', { prompt: text, lang });
        return json({ audio: r?.audio || null, format: 'mp3' });
      } catch (e) { return aiError(e); }
    }

    // Translation: IndicTrans2 (AI4Bharat, 22 Indian languages) for Indian languages, M2M100 for the rest.
    // Used to answer in the user's language: the small brain's own Telugu changed facts.
    if (req.method === 'POST' && path === '/v1/translate') {
      let body;
      try { body = await req.json(); } catch { return json({ error: { message: 'Bad JSON.' } }, 400); }
      const target = String(body?.target || '').slice(0, 3);
      const texts = (Array.isArray(body?.texts) ? body.texts : []).map((t) => String(t || '').slice(0, 1500)).slice(0, 60);
      if (!texts.length || !target) return json({ error: { message: 'Need texts and a target language.' } }, 400);
      try {
        if (INDIC[target]) {
          const r = await env.AI.run('@cf/ai4bharat/indictrans2-en-indic-1B', { text: texts, target_language: INDIC[target] });
          return json({ translations: r?.translations || [] });
        }
        const out = [];
        for (const t of texts) out.push((await env.AI.run('@cf/meta/m2m100-1.2b', { text: t, source_lang: 'en', target_lang: target }))?.translated_text || t);
        return json({ translations: out });
      } catch (e) { return aiError(e); }
    }

    // Pictures: text -> image (FLUX, open weights). Returns base64 JPEG/PNG.
    if (req.method === 'POST' && path === '/v1/images/generations') {
      let body;
      try { body = await req.json(); } catch { return json({ error: { message: 'Bad JSON.' } }, 400); }
      const prompt = String(body?.prompt || '').trim().slice(0, 2000);
      if (!prompt) return json({ error: { message: 'Say what to draw.' } }, 400);
      const model = IMAGE_MODELS[body?.quality] || IMAGE_MODELS.fast;
      const size = (v) => Math.min(1280, Math.max(256, Math.round((Number(v) || 1024) / 64) * 64));
      try {
        const input = model.multipart ? null : { prompt, steps: model.steps };
        let r;
        if (model.multipart) {
          const form = new FormData();
          form.append('prompt', prompt);
          form.append('width', String(size(body?.width)));
          form.append('height', String(size(body?.height)));
          const fr = new Response(form);
          r = await env.AI.run(model.id, { multipart: { body: fr.body, contentType: fr.headers.get('content-type') } });
        } else r = await env.AI.run(model.id, input);
        const b64 = typeof r?.image === 'string' ? r.image : null;
        if (!b64) return json({ error: { message: 'No picture came back.' } }, 502);
        return json({ data: [{ b64_json: b64 }] });
      } catch (e) { return aiError(e); }
    }

    // The engine: a bigger open model for jobs the small brain can't do well - building whole games/
    // websites, multi-step agent work (choosing tools), long code. Only allow-listed models.
    if (req.method === 'POST' && path === '/v1/engine/chat/completions') {
      let body;
      try { body = await req.json(); } catch { return json({ error: { message: 'Bad JSON.' } }, 400); }
      if (!Array.isArray(body?.messages) || !body.messages.length) return json({ error: { message: 'No messages.' } }, 400);
      const model = ENGINES[body.engine] || ENGINES.builder;
      const input = {
        messages: body.messages.slice(-60).map((m) => ({ role: ['system', 'assistant', 'user'].includes(m.role) ? m.role : 'user', content: String(m.content ?? '') })),
        stream: Boolean(body.stream),
        max_tokens: num(body.max_tokens, 1, 16000) ?? 4000,
        temperature: num(body.temperature, 0, 2) ?? 0.4,
      };
      // quick jobs (choosing a tool) don't need long thinking
      if (['low', 'medium', 'high'].includes(body.reasoning)) input.reasoning = { effort: body.reasoning };
      if (body.think === false) input.chat_template_kwargs = { enable_thinking: false };
      try {
        const result = await env.AI.run(model, input);
        if (body.debug === true) return json({ raw: result });   // exam/debugging: see exactly what the model returned
        const reasoningIsAnswer = body.think === false && model.includes('qwen3');
        if (input.stream) return new Response(toOpenAIStream(result, reasoningIsAnswer), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
        const content = stripMarkers(engineText(result, reasoningIsAnswer));
        return json({ object: 'chat.completion', model: NAME, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: result?.usage || undefined });
      } catch (e) { return aiError(e); }
    }

    if (req.method === 'GET' && path === '/v1/models') {
      return json({ object: 'list', data: [{ id: NAME, object: 'model', owned_by: 'codeconclave' }] });
    }
    if (req.method === 'POST' && path === '/v1/chat/completions') {
      let body;
      try { body = await req.json(); } catch { return json({ error: { message: 'Bad JSON.' } }, 400); }
      if (!Array.isArray(body?.messages) || !body.messages.length) return json({ error: { message: 'No messages.' } }, 400);
      // A message with a picture goes to the vision model (it sees one picture per request).
      const picture = body.messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p?.type === 'image_url'));
      const input = picture ? visionInput(body) : aiInput(body);
      try {
        const result = await env.AI.run(picture ? VISION_MODEL : BASE_MODEL, input);
        if (input.stream) {
          return new Response(toOpenAIStream(result), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
        }
        const r = result?.response;
        const content = stripMarkers(typeof r === 'string' ? r : r ? JSON.stringify(r) : '');
        return json({
          object: 'chat.completion', model: NAME,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: result?.usage || undefined,
        });
      } catch (e) {
        return aiError(e);
      }
    }
    return json({ error: { message: 'Not found.' } }, 404);
  },
};
