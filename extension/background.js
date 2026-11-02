// CodeConClave AI - browser helper. Only the CodeConClave website can talk to it (externally_connectable), and every
// action on the user's real Chrome (open, read, click, type) first shows an Allow / Deny window that the website
// cannot press. It never types into password boxes.
const pending = new Map(); // confirm id -> resolve

function ask(message) {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    pending.set(id, resolve);
    chrome.windows.create({ url: `confirm.html?id=${id}&m=${encodeURIComponent(message)}`, type: 'popup', width: 440, height: 300, focused: true });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve(false); } }, 120000);   // no answer in 2 min = no
  });
}
chrome.runtime.onMessage.addListener((msg) => {   // from confirm.html (inside this extension only)
  if (msg?.confirmId && pending.has(msg.confirmId)) { pending.get(msg.confirmId)(Boolean(msg.ok)); pending.delete(msg.confirmId); }
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !/^https?:/.test(tab.url || '')) throw new Error('Open a normal web page first.');
  return tab;
}
const run = (tabId, func, args = []) => chrome.scripting.executeScript({ target: { tabId }, func, args }).then((r) => r[0]?.result);
const host = (u) => { try { return new URL(u).hostname; } catch { return u; } };
const waitLoad = (tabId) => new Promise((ok) => {
  const done = (id, info) => { if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(done); ok(); } };
  chrome.tabs.onUpdated.addListener(done); setTimeout(() => { chrome.tabs.onUpdated.removeListener(done); ok(); }, 15000);
});

async function handle(msg) {
  switch (msg?.op) {
    case 'ping': return { ok: true, version: chrome.runtime.getManifest().version };
    case 'open': case 'search': {
      const url = msg.op === 'search' ? `https://www.google.com/search?q=${encodeURIComponent(String(msg.q || '').slice(0, 300))}`
        : (/^https?:\/\//i.test(msg.url) ? msg.url : `https://${msg.url}`);
      if (!/^https?:\/\//.test(url)) throw new Error('Only web pages can be opened.');
      if (!(await ask(msg.op === 'search' ? `Search Google for:\n"${msg.q}"` : `Open this page in your Chrome?\n${url}`))) return { declined: true };
      const tab = await chrome.tabs.create({ url });
      await waitLoad(tab.id);
      const t = await chrome.tabs.get(tab.id);
      return { url: t.url, title: t.title };
    }
    case 'read': {
      const tab = await activeTab();
      if (!(await ask(`Let CodeConClave read this page?\n${host(tab.url)} - "${tab.title}"`))) return { declined: true };
      const text = await run(tab.id, () => (document.body ? document.body.innerText : ''));
      return { url: tab.url, title: tab.title, text: String(text || '').replace(/\n{3,}/g, '\n\n').slice(0, 20000) };
    }
    case 'click': {
      const tab = await activeTab(), label = String(msg.label || '').slice(0, 200);
      if (!(await ask(`Click "${label}"\non ${host(tab.url)}?`))) return { declined: true };
      const clicked = await run(tab.id, (want) => {
        want = want.toLowerCase();
        const words = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim().toLowerCase();
        const els = [...document.querySelectorAll('a,button,input[type=submit],input[type=button],[role=button],[role=link],[role=tab],[role=menuitem]')].filter((el) => el.offsetParent !== null);
        const el = els.find((x) => words(x) === want) || els.find((x) => words(x).includes(want));
        if (!el) return false;
        el.scrollIntoView({ block: 'center' }); el.click(); return true;
      }, [label]);
      return { clicked, url: tab.url };
    }
    case 'type': {
      const tab = await activeTab(), field = String(msg.field || '').slice(0, 200), text = String(msg.text || '').slice(0, 5000);
      if (!(await ask(`Type "${text}"\ninto "${field || 'the first text box'}"\non ${host(tab.url)}?`))) return { declined: true };
      const r = await run(tab.id, (want, value) => {
        want = want.toLowerCase();
        const boxes = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]),textarea,[contenteditable=true]')].filter((el) => el.offsetParent !== null);
        const label = (el) => [el.getAttribute('aria-label'), el.placeholder, el.name, el.id, el.labels && el.labels[0] && el.labels[0].innerText].filter(Boolean).join(' ').toLowerCase();
        const el = want ? boxes.find((x) => label(x).includes(want)) : boxes[0];
        if (!el) return 'missing';
        if (el.type === 'password') return 'password';
        el.focus();
        if (el.isContentEditable) el.textContent = value;
        else { const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; set.call(el, value); }
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
      }, [field, text]);
      if (r === 'password') throw new Error('I never type into password boxes - please type it yourself.');
      return { typed: r === 'ok', url: tab.url };
    }
    default: throw new Error('Unknown request.');
  }
}

chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  handle(msg).then(reply, (e) => reply({ error: String(e?.message || e) }));
  return true;   // answer later
});
