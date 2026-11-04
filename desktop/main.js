// CodeConClave AI for the desktop: the web app in its own window, plus what only a desktop app can
// do - run terminal commands, drive a browser window, click and type on pages - each one only after
// the person says yes in a system dialog that the web page itself cannot click or skip.
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const os = require('os');

const APP_URL = process.env.CC_URL || 'https://codeconclave-ww5x.onrender.com/solo';
const APP_ORIGIN = new URL(APP_URL).origin;
const ICON = path.join(__dirname, 'icon.png');
const isApp = (url) => { try { return new URL(url).origin === APP_ORIGIN; } catch { return false; } };
const isWeb = (url) => /^https?:\/\//i.test(String(url || ''));
const clip = (s, n) => String(s ?? '').slice(0, n);

let win = null;    // the CodeConClave window
let agent = null;  // the browser window the AI drives
let workDir = os.homedir();
const jobs = new Map(); // running commands, by id

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 520, backgroundColor: '#1a1a1a',
    title: 'CodeConClave AI', icon: ICON, autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
  // The splash stays on screen until the site answers (the free server can take ~50 s to wake up).
  win.loadFile(path.join(__dirname, 'splash.html')).then(() => win.loadURL(APP_URL)).catch(() => {});
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && isApp(url) && code !== -3) win.loadFile(path.join(__dirname, 'splash.html'), { query: { offline: '1' } });
  });
  // Other sites open in the normal browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => { if (isWeb(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (isApp(url) || url.startsWith('file:')) return;
    e.preventDefault();
    if (isWeb(url)) shell.openExternal(url);
  });
}

// Only the CodeConClave site may use the camera/mic, notifications, clipboard and the folder picker.
function permissions() {
  const ok = ['clipboard-sanitized-write', 'clipboard-read', 'notifications', 'fileSystem', 'media', 'fullscreen'];
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(isApp(details.requestingUrl || wc.getURL()) && ok.includes(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => (origin === APP_ORIGIN || isApp(wc?.getURL?.() || '')) && ok.includes(perm));
}

async function ask(message, detail, okLabel) {
  const r = await dialog.showMessageBox(win, { type: 'question', buttons: [okLabel, 'Cancel'], defaultId: 1, cancelId: 1, noLink: true, title: 'CodeConClave AI', message, detail });
  return r.response === 0;
}

// Every power below checks that the request comes from the CodeConClave page itself.
function handle(name, fn) {
  ipcMain.handle(name, async (e, ...args) => {
    if (!isApp(e.senderFrame?.url || '')) throw new Error('Not allowed.');
    return fn(e, ...args);
  });
}

// ---- terminal ----
function killTree(child) {
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  else child.kill('SIGTERM');
}
handle('desk:info', () => ({ platform: process.platform, folder: workDir, shell: process.platform === 'win32' ? 'PowerShell' : 'bash', version: app.getVersion() }));
handle('desk:folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Folder for terminal commands', defaultPath: workDir, properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  workDir = r.filePaths[0];
  return workDir;
});
handle('desk:run', async (e, { id, command }) => {
  command = clip(command, 4000).trim();
  if (!command) throw new Error('There is no command to run.');
  if (!(await ask('Run this command on your computer?', `${command}\n\nIn folder: ${workDir}`, 'Run'))) return { declined: true };
  return new Promise((resolve) => {
    const child = process.platform === 'win32'
      ? spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${command}`], { cwd: workDir, windowsHide: true })
      : spawn(process.env.SHELL || '/bin/bash', ['-lc', command], { cwd: workDir });
    jobs.set(id, child);
    let out = '';
    const send = (chunk) => {
      const s = chunk.toString();
      out = (out + s).slice(-200000);
      if (!e.sender.isDestroyed()) e.sender.send('desk:output', { id, chunk: s });
    };
    child.stdout.on('data', send);
    child.stderr.on('data', send);
    const timer = setTimeout(() => killTree(child), 10 * 60 * 1000); // 10 minutes at most
    const done = (code) => { clearTimeout(timer); jobs.delete(id); resolve({ code, output: out.slice(-20000) }); };
    child.on('close', (code) => done(code));
    child.on('error', (err) => { out += String(err.message); done(-1); });
  });
});
handle('desk:stop', (_e, id) => { const c = jobs.get(id); if (!c) return false; killTree(c); return true; });

// ---- the browser the AI drives (its own window and its own cookies, separate from the app) ----
function agentWindow() {
  if (agent && !agent.isDestroyed()) return agent;
  agent = new BrowserWindow({
    width: 1100, height: 780, title: 'CodeConClave browser', icon: ICON, autoHideMenuBar: true,
    webPreferences: { partition: 'persist:agent', contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  agent.webContents.setWindowOpenHandler(({ url }) => { if (isWeb(url)) agent.loadURL(url); return { action: 'deny' }; });
  agent.on('closed', () => { agent = null; });
  return agent;
}
const openPage = () => { if (!agent || agent.isDestroyed()) throw new Error('No page is open - ask me to open one first.'); return agent; };
const pageInfo = () => ({ url: agent.webContents.getURL(), title: agent.webContents.getTitle() });
const settle = () => new Promise((r) => setTimeout(r, 1200));
handle('desk:browse', async (_e, url) => {
  url = clip(url, 2000).trim();
  if (!isWeb(url)) url = `https://${url}`;
  let u;
  try { u = new URL(url); } catch { throw new Error('That is not a web address.'); }
  const w = agentWindow();
  w.show();
  await w.loadURL(u.href).catch(() => {});
  return pageInfo();
});
handle('desk:read', async () => {
  const w = openPage();
  const text = await w.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true);
  return { ...pageInfo(), text: String(text).replace(/\n{3,}/g, '\n\n').slice(0, 20000) };
});
handle('desk:shot', async () => {
  const w = openPage();
  const img = await w.webContents.capturePage();
  const size = img.getSize();
  return { ...pageInfo(), image: (size.width > 1000 ? img.resize({ width: 1000 }) : img).toDataURL() };
});
handle('desk:back', async () => { const w = openPage(); if (w.webContents.navigationHistory.canGoBack()) w.webContents.navigationHistory.goBack(); await settle(); return pageInfo(); });
// Click a link or button by its words.
handle('desk:click', async (_e, label) => {
  const w = openPage();
  label = clip(label, 200).trim();
  if (!label) throw new Error('Say what to click.');
  if (!(await ask('Click on this page?', `Click "${label}"\non ${w.webContents.getURL()}`, 'Click'))) return { declined: true };
  const clicked = await w.webContents.executeJavaScript(`(() => {
    const want = ${JSON.stringify(label.toLowerCase())};
    const words = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim().toLowerCase();
    const els = [...document.querySelectorAll('a,button,input[type=submit],input[type=button],[role=button],[role=link],[role=tab],[role=menuitem]')].filter((el) => el.offsetParent !== null);
    const el = els.find((x) => words(x) === want) || els.find((x) => words(x).includes(want));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`, true);
  await settle();
  return { clicked, ...pageInfo() };
});
// Type into a box found by its label, placeholder or name. Never into password boxes.
handle('desk:type', async (_e, { field, text }) => {
  const w = openPage();
  field = clip(field, 200).trim(); text = clip(text, 5000);
  if (!(await ask('Type on this page?', `Type "${text}"\ninto "${field || 'the first text box'}"\non ${w.webContents.getURL()}`, 'Type'))) return { declined: true };
  const r = await w.webContents.executeJavaScript(`(() => {
    const want = ${JSON.stringify(field.toLowerCase())};
    const boxes = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]),textarea,[contenteditable=true]')].filter((el) => el.offsetParent !== null);
    const label = (el) => [el.getAttribute('aria-label'), el.placeholder, el.name, el.id, el.labels && el.labels[0] && el.labels[0].innerText].filter(Boolean).join(' ').toLowerCase();
    const el = want ? boxes.find((x) => label(x).includes(want)) : boxes[0];
    if (!el) return 'missing';
    if (el.type === 'password') return 'password';
    el.focus();
    if (el.isContentEditable) el.textContent = ${JSON.stringify(text)};
    else { const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; set.call(el, ${JSON.stringify(text)}); }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`, true);
  if (r === 'password') throw new Error('I never type into password boxes - please type it yourself.');
  return { typed: r === 'ok', ...pageInfo() };
});
// Open a web page in the normal browser, or a file/app on this computer.
handle('desk:open', async (_e, target) => {
  target = clip(target, 1000).trim();
  if (!target) throw new Error('Say what to open.');
  if (!(await ask('Open this on your computer?', target, 'Open'))) return { declined: true };
  if (isWeb(target)) { await shell.openExternal(target); return { opened: true }; }
  const err = await shell.openPath(path.resolve(workDir, target));
  if (err) throw new Error(err);
  return { opened: true };
});

app.whenReady().then(() => {
  permissions();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { for (const c of jobs.values()) killTree(c); if (process.platform !== 'darwin') app.quit(); });
