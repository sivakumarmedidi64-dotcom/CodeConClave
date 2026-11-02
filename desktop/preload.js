// What the CodeConClave page may ask the desktop app to do (main.js checks the page and asks the
// person in a system dialog before anything runs, clicks or types).
const { contextBridge, ipcRenderer } = require('electron');

const outputs = new Map(); // command id -> function that gets its output as it comes
ipcRenderer.on('desk:output', (_e, d) => { const f = outputs.get(d.id); if (f) f(d.chunk); });
let n = 0;

contextBridge.exposeInMainWorld('ccDesktop', {
  info: () => ipcRenderer.invoke('desk:info'),
  pickFolder: () => ipcRenderer.invoke('desk:folder'),
  // run(command, onOutput) -> { code, output } or { declined: true }; stop() ends the running command
  run(command, onOutput) {
    const id = `c${Date.now()}${n++}`;
    if (typeof onOutput === 'function') outputs.set(id, onOutput);
    const done = ipcRenderer.invoke('desk:run', { id, command: String(command) }).finally(() => outputs.delete(id));
    return { id, done, stop: () => ipcRenderer.invoke('desk:stop', id) };
  },
  browse: (url) => ipcRenderer.invoke('desk:browse', String(url)),
  read: () => ipcRenderer.invoke('desk:read'),
  screenshot: () => ipcRenderer.invoke('desk:shot'),
  back: () => ipcRenderer.invoke('desk:back'),
  click: (label) => ipcRenderer.invoke('desk:click', String(label)),
  type: (field, text) => ipcRenderer.invoke('desk:type', { field: String(field || ''), text: String(text || '') }),
  open: (target) => ipcRenderer.invoke('desk:open', String(target)),
});
