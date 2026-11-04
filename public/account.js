// Email codes: "Confirm your email" after sign-up, and "Forgot password". Used by the app (index.html) and the
// front page (kit.js). window.ccAccount.verify(email) / window.ccAccount.forgot(email)
(() => {
  if (window.ccAccount) return;
  const css = `.cca-wrap{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
.cca-box{background:#232323;color:#e6e6e6;border:1px solid #353535;border-radius:14px;width:100%;max-width:400px;padding:22px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.cca-box h2{margin:0 0 6px;font-size:18px}.cca-box p{margin:0 0 14px;color:#a8a8a8;font-size:14px;line-height:1.45}
.cca-box input{width:100%;box-sizing:border-box;margin:0 0 10px;padding:11px 12px;border-radius:10px;border:1px solid #353535;background:#1a1a1a;color:#e6e6e6;font:inherit;font-size:15px}
.cca-box input:focus{outline:none;border-color:#f2c200}.cca-box input.cca-code{letter-spacing:6px;font-size:20px;text-align:center}
.cca-go{width:100%;padding:11px;border:none;border-radius:10px;background:#f2c200;color:#1a1a1a;font:inherit;font-weight:700;font-size:15px;cursor:pointer}.cca-go:disabled{opacity:.6;cursor:default}
.cca-msg{min-height:18px;font-size:13px;margin:0 0 10px;color:#8fd18f}.cca-msg.bad{color:#ff8a8a}
.cca-links{display:flex;justify-content:space-between;margin-top:12px;font-size:13px}.cca-links a{color:#1a93fe;cursor:pointer;text-decoration:none}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Something went wrong - please try again.');
    return d;
  };
  // a small dialog: title, text, fields, one button, extra links. onGo(values, say) returns true to close.
  function dialog({ title, text, fields, button, onGo, links = [], closable = true }) {
    return new Promise((done) => {
      const wrap = document.createElement('div'); wrap.className = 'cca-wrap';
      const box = document.createElement('div'); box.className = 'cca-box'; wrap.appendChild(box);
      const h = document.createElement('h2'); h.textContent = title; const p = document.createElement('p'); p.textContent = text; box.append(h, p);
      const inputs = fields.map((f) => { const i = document.createElement('input'); i.type = f.type || 'text'; i.placeholder = f.placeholder || ''; if (f.value) i.value = f.value;
        if (f.code) { i.className = 'cca-code'; i.inputMode = 'numeric'; i.maxLength = 6; i.autocomplete = 'one-time-code'; } if (f.auto) i.autocomplete = f.auto; box.appendChild(i); return [f.name, i]; });
      const msg = document.createElement('div'); msg.className = 'cca-msg'; box.appendChild(msg);
      const say = (m, bad) => { msg.textContent = m || ''; msg.className = 'cca-msg' + (bad ? ' bad' : ''); };
      const go = document.createElement('button'); go.className = 'cca-go'; go.textContent = button; box.appendChild(go);
      const close = (v) => { wrap.remove(); done(v); };
      const run = async () => { go.disabled = true; say('');
        try { const vals = Object.fromEntries(inputs.map(([n, i]) => [n, i.value.trim()])); if (await onGo(vals, say)) close(true); }
        catch (e) { say(e.message, true); } finally { go.disabled = false; } };
      go.onclick = run; inputs.forEach(([, i]) => { i.onkeydown = (e) => { if (e.key === 'Enter') run(); }; });
      if (links.length || closable) {
        const row = document.createElement('div'); row.className = 'cca-links';
        for (const [label, fn] of links) { const a = document.createElement('a'); a.textContent = label; a.onclick = () => fn(say); row.appendChild(a); }
        if (closable) { const a = document.createElement('a'); a.textContent = 'Later'; a.style.color = '#8c8c8c'; a.onclick = () => close(false); row.appendChild(a); }
        box.appendChild(row);
      }
      document.body.appendChild(wrap); setTimeout(() => inputs[0]?.[1].focus(), 30);
    });
  }
  let open = false;
  async function verify(email, note) {
    if (open) return false; open = true;
    try {
      return await dialog({ title: 'Confirm your email', text: `We sent a 6-digit code to ${email || 'your email'}. Type it here - check Spam too.${note ? ' ' + note : ''}`,
        fields: [{ name: 'code', placeholder: '000000', code: true }], button: 'Confirm',
        onGo: async (v) => { await post('/api/auth/verify', { code: v.code }); window.dispatchEvent(new CustomEvent('cc-verified')); return true; },
        links: [['Send a new code', async (say) => { try { await post('/api/auth/verify/resend'); say('A new code is on its way.'); } catch (e) { say(e.message, true); } }]] });
    } finally { open = false; }
  }
  async function forgot(email) {
    let addr = email || '';
    const sent = await dialog({ title: 'Forgot your password?', text: 'Type your email and we will send you a 6-digit code to set a new password.',
      fields: [{ name: 'email', type: 'email', placeholder: 'Email', value: addr, auto: 'email' }], button: 'Send code',
      onGo: async (v) => { addr = v.email; await post('/api/auth/forgot', { email: v.email }); return true; } });
    if (!sent) return false;
    return dialog({ title: 'Set a new password', text: `If ${addr} has an account, a code is on its way (check Spam too). It works for 15 minutes.`,
      fields: [{ name: 'code', placeholder: '000000', code: true }, { name: 'password', type: 'password', placeholder: 'New password (at least 8 characters)', auto: 'new-password' }], button: 'Save new password',
      onGo: async (v) => { await post('/api/auth/reset', { email: addr, code: v.code, password: v.password }); location.reload(); return true; },
      links: [['Send a new code', async (say) => { try { await post('/api/auth/forgot', { email: addr }); say('If the email has an account, a new code is on its way.'); } catch (e) { say(e.message, true); } }]] });
  }
  window.ccAccount = { verify, forgot };
})();
