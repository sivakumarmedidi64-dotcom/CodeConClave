// The Allow / Deny window: only the person can press these (the website cannot reach this page).
const q = new URLSearchParams(location.search);
document.getElementById('msg').textContent = q.get('m') || '';
const answer = (ok) => { chrome.runtime.sendMessage({ confirmId: q.get('id'), ok }); window.close(); };
document.getElementById('ok').onclick = () => answer(true);
document.getElementById('no').onclick = () => answer(false);
window.addEventListener('beforeunload', () => chrome.runtime.sendMessage({ confirmId: q.get('id'), ok: false }));
