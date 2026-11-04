import crypto from 'crypto';
// The studio: things CodeConClave AI MAKES - pictures, games/websites/apps (code that runs live in a
// preview), and the plan for a video (the browser turns the plan + pictures + voice into the video file).
// All of it runs on the always-on brain (Cloudflare): FLUX for pictures, the bigger open "builder"
// engine for code. Users only ever see "CodeConClave AI".

const BUILD_SYSTEM = `You are the builder inside CodeConClave AI. You write complete, working, beautiful single-file web apps, games and websites.
Rules:
- Reply with ONE complete HTML file (CSS and JavaScript inside) in a \`\`\`html code block, then ONE short line saying what you built and how to use it.
- It runs offline in a sandboxed preview: no API keys, no fetch to outside services. Pictures = inline SVG, CSS, emoji or canvas drawing. System fonts.
- Works on phones and computers: responsive layout; games get touch buttons/gestures AND keyboard controls.
- Polished, modern design (dark theme unless asked otherwise), smooth animation, clear text.
- Games: start screen, score, levels or rising difficulty when it fits, game over + restart, high score saved in localStorage (wrapped in try/catch).
- Finish everything: no "TODO", no placeholder functions, no lorem ipsum unless asked.
- 3D games and 3D scenes (and any "open world", racing, flying, shooter, adventure): use three.js, loaded with
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
  and <script type="module">import * as THREE from 'three';</script>. Make it look real: sky (gradient or Sky addon), fog, sun + ambient light, soft shadows,
  procedural terrain (noise hills), trees/rocks/buildings built from shapes, a player you move (WASD/arrows + mouse look, and a touch joystick on phones),
  a following camera, moving things (cars, animals, enemies, clouds), collectibles, a HUD (score, health, mini-map or objective), and a start + game-over screen.
  Ask for mouse capture (pointer lock) only on a real click, inside try/catch, and keep the game playable without it (drag to look).
  Keep 60 fps: reuse geometries/materials, limit shadows to the sun, size the renderer to the window and handle resize.`;

const VIDEO_SYSTEM = `You plan short narrated videos for CodeConClave AI. Reply with JSON only:
{"title":"...","scenes":[{"caption":"max 8 words shown on screen","narration":"1-2 short spoken sentences (max 28 words)","image":"a detailed English description of the picture for this scene, same visual style in every scene"}]}
Make 5 scenes that tell the topic from start to end, with real, correct facts. The image descriptions never contain text or letters.`;

function firstJson(s) {
  const t = String(s || ''), a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

// A video counts as ONE message: its plan hands out a ticket that covers the scene pictures.
const tickets = new Map();   // ticket -> { left, until }
// a short-lived ticket so the pictures of one deck or video count as one request (not one per picture)
export function imageTicket(n) { const t = crypto.randomUUID(); tickets.set(t, { left: Math.max(0, Math.min(8, n)), until: Date.now() + 15 * 60000 }); return t; }

export function registerStudio(app, { cloud, headers, wrap, overLimit }) {
  const brain = () => cloud();
  const post = (path, body, ms) => {
    const b = brain();
    if (!b) throw Object.assign(new Error('My always-on brain is not connected, so I can\'t make that right now.'), { status: 503 });
    return fetch(`${b.base}${path}`, { method: 'POST', headers: headers(b), body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  };

  // A picture from a description. quality: "best" (sharper, default) or "fast".
  app.post('/api/image', wrap(async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim().slice(0, 1500);
    if (!prompt) return res.status(400).json({ error: 'Say what to draw.' });
    const t = tickets.get(String(req.body?.ticket || ''));
    if (t && t.left > 0 && t.until > Date.now()) t.left--;
    else if (await overLimit(req, res)) return;
    const size = { square: [1024, 1024], wide: [1280, 720], tall: [720, 1280] }[req.body?.shape] || [1024, 1024];
    let r, d = {}, b64 = null;
    // the sharp model first; if Cloudflare is busy ("capacity") or it fails, the fast model tries once more
    for (const quality of req.body?.quality === 'fast' ? ['fast', 'fast'] : ['best', 'fast']) {
      try {
        r = await post('/images/generations', { prompt, quality, width: size[0], height: size[1] }, 90000);
      } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); continue; }
      d = await r.json().catch(() => ({}));
      b64 = d?.data?.[0]?.b64_json;
      if (b64 || r.status === 429) break;
    }
    if (!r) return res.status(504).json({ error: 'Drawing took too long - please try again.' });
    if (!r.ok || !b64) return res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? 'I have made all the pictures I can for today - try again tomorrow.' : 'I couldn\'t draw that one - try saying it a little differently.' });
    const type = b64.startsWith('iVBOR') ? 'png' : 'jpeg';
    res.json({ image: `data:image/${type};base64,${b64}` });
  }));

  // Build (or change) a game / website / app. Streams the code as it is written (SSE "delta"),
  // so the preview panel can show the code growing, then run it.
  app.post('/api/build', (req, res, next) => (async () => {
    const request = String(req.body?.request || '').trim().slice(0, 4000);
    if (!request) return res.status(400).json({ error: 'Say what to build.' });
    if (await overLimit(req, res)) return;
    const current = String(req.body?.current || '').slice(0, 60000);
    const kind = ['game', 'website', 'app'].includes(req.body?.kind) ? req.body.kind : 'app';
    const myRules = String(req.body?.rules || '').slice(0, 3000).trim();
    const messages = [{ role: 'system', content: myRules ? `${BUILD_SYSTEM}\nThe user's own rules - follow them:\n${myRules}` : BUILD_SYSTEM }];
    if (current) {
      messages.push({ role: 'user', content: `Here is the current version:\n\`\`\`html\n${current}\n\`\`\`` });
      messages.push({ role: 'user', content: `Change it: ${request}\nReply with the WHOLE updated file in one \`\`\`html block (keep everything that already works), then one short line about what changed.` });
    } else messages.push({ role: 'user', content: `Build this ${kind}: ${request}` });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();
    const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    try {
      const r = await post('/engine/chat/completions', { engine: 'builder', messages, stream: true, max_tokens: 16000, temperature: 0.4, think: false }, 300000);
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = '', any = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          try {
            const d = JSON.parse(line.slice(5).trim())?.choices?.[0]?.delta?.content;
            if (d) { any = true; send({ delta: d }); }
          } catch { /* keep-alive */ }
        }
      }
      if (!any) send({ error: 'The builder sent nothing back - please try again.' });
    } catch (e) {
      send({ error: e.status ? e.message : 'Building stopped halfway - please try again.' });
    }
    send({ done: true });
    res.end();
  })().catch(next));

  // The coding agent: works in the user's project folder step by step (read -> change -> check), like a
  // developer. The browser holds the files, so each step goes: browser -> here (choose the next action)
  // -> browser does it -> here again. Every change is shown with an Undo.
  app.post('/api/agent/step', wrap(async (req, res) => {
    const goal = String(req.body?.goal || '').trim().slice(0, 3000);
    const files = (Array.isArray(req.body?.files) ? req.body.files : []).filter((p) => typeof p === 'string' && p.length < 300).slice(0, 500);
    const history = (Array.isArray(req.body?.history) ? req.body.history : []).slice(-40)
      .map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: String(m?.content || '').slice(0, 16000) }));
    if (!goal) return res.status(400).json({ error: 'Say what to do in the project.' });
    if (!history.length && await overLimit(req, res)) return;   // one task = one message, however many steps
    const run = req.body?.desktop ? '\n{"tool":"run","command":"a terminal command, e.g. npm test"}  (the user approves each command)' : '';
    const system = `You are the coding agent inside CodeConClave AI, working in the user's project folder "${String(req.body?.folder || 'project').slice(0, 60)}".
Do the task step by step. Reply with exactly ONE JSON action per message, nothing else:
{"tool":"read","path":"file path from the list"}   (you get the file with line numbers like "12| text")
{"tool":"insert","path":"...","after":12,"text":"new lines to add after line 12 (after 0 = at the top)"}
{"tool":"replace","path":"...","from":12,"to":14,"text":"new lines that take the place of lines 12 to 14"}
{"tool":"write","path":"...","content":"the COMPLETE file"}   (new files, or rewriting a small file)${run}
{"tool":"done","summary":"2-4 short lines: what you changed and how to try it"}
Rules: read a file before you change it; use the line numbers from your LAST read of that file (after a change you get the new numbered file); never put line numbers inside "text"; keep changes small and working; never delete files; at most 10 changes; when the task is finished (or impossible) use done.
Files in the folder:\n${files.join('\n') || '(empty folder)'}${String(req.body?.rules || '').trim() ? `\nThe user's own rules - follow them:\n${String(req.body.rules).slice(0, 3000)}` : ''}`;
    let action = null;
    for (let i = 0; i < 2 && !action; i++) {
      try {
        const r = await post('/engine/chat/completions', { engine: 'builder', messages: [{ role: 'system', content: system }, { role: 'user', content: `Task: ${goal}` }, ...history], max_tokens: 9000, temperature: 0.2, think: false }, 180000);
        const d = await r.json();
        const a = firstJson(d?.choices?.[0]?.message?.content);
        if (a && ['read', 'insert', 'replace', 'edit', 'write', 'run', 'done'].includes(a.tool)) action = a;
      } catch { /* try once more */ }
    }
    if (!action) return res.status(502).json({ error: 'The coding agent got stuck - please try again.' });
    res.json({ action });
  }));

  // The plan of a short video: scenes with on-screen text, narration and a picture description each.
  app.post('/api/video/plan', wrap(async (req, res) => {
    const topic = String(req.body?.topic || '').trim().slice(0, 600);
    if (!topic) return res.status(400).json({ error: 'Say what the video is about.' });
    if (await overLimit(req, res)) return;
    let plan = null;
    for (let i = 0; i < 2 && !plan; i++) {
      try {
        const r = await post('/engine/chat/completions', { engine: 'agent', messages: [{ role: 'system', content: VIDEO_SYSTEM }, { role: 'user', content: `Video about: ${topic}` }], max_tokens: 1500, temperature: 0.5, think: false }, 60000);
        const d = await r.json();
        const p = firstJson(d?.choices?.[0]?.message?.content);
        const scenes = (Array.isArray(p?.scenes) ? p.scenes : []).map((s) => ({
          caption: String(s?.caption || '').slice(0, 80), narration: String(s?.narration || '').slice(0, 260), image: String(s?.image || '').slice(0, 600),
        })).filter((s) => s.image && (s.caption || s.narration)).slice(0, 6);
        if (scenes.length >= 2) plan = { title: String(p.title || topic).slice(0, 90), scenes };
      } catch { /* try again */ }
    }
    if (!plan) return res.status(502).json({ error: 'I couldn\'t plan that video - please try again.' });
    // another language (Telugu, Hindi...): the pictures stay as planned, the title, captions and narration are translated
    const lang = /^[a-z]{2}$/.test(String(req.body?.lang || '')) ? String(req.body.lang) : 'en';
    if (lang !== 'en') {
      try {
        const texts = [plan.title, ...plan.scenes.flatMap((s) => [s.caption || '.', s.narration || '.'])];
        const r = await post('/translate', { target: lang, texts }, 60000); const d = await r.json().catch(() => ({})); const tr = d?.translations;
        if (Array.isArray(tr) && tr.length === texts.length) {
          plan.title = String(tr[0] || plan.title).slice(0, 120);
          plan.scenes.forEach((s, i) => { s.caption = String(tr[1 + i * 2] || s.caption).slice(0, 120); s.narration = String(tr[2 + i * 2] || s.narration).slice(0, 400); });
          plan.lang = lang;
        }
      } catch { /* the English plan, then */ }
    }
    const ticket = crypto.randomUUID();
    tickets.set(ticket, { left: plan.scenes.length, until: Date.now() + 15 * 60000 });
    for (const [k, v] of tickets) if (v.until < Date.now()) tickets.delete(k);
    res.json({ ...plan, ticket });
  }));
}
