// Shared look + helpers for CodeConClave's own pages (front page, Customize, Team, Organization):
// colours, buttons, cards, a toast, a question box, sign-in / create-account, and small API helpers.
(function(){
  const css=`
  :root{--bg:#141414;--bg2:#1a1a1a;--side:#1c1c1c;--card:#222;--card2:#272727;--line:#2e2e2e;--line2:#3a3a3a;--fg:#ececec;--dim:#8f8f8f;--dim2:#666;--yel:#f2c200;--blue:#3d9bff;--green:#5fd38d;--red:#ff7a70;
    --sans:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#3a3a3a transparent}
  *::-webkit-scrollbar{width:8px;height:8px}*::-webkit-scrollbar-thumb{background:#3a3a3a;border-radius:8px}*::-webkit-scrollbar-button{display:none}
  html,body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:15px;-webkit-font-smoothing:antialiased}
  a{color:inherit}
  .k-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--line2);background:transparent;color:var(--fg);border-radius:12px;padding:10px 16px;font:inherit;font-size:14.5px;font-weight:500;cursor:pointer;text-decoration:none;transition:background .15s,border-color .15s,transform .05s}
  .k-btn:hover{background:#262626;border-color:#4a4a4a}.k-btn:active{transform:translateY(1px)}
  .k-btn.pri{background:var(--fg);color:#111;border-color:var(--fg)}.k-btn.pri:hover{background:#fff}
  .k-btn.yel{background:var(--yel);color:#111;border-color:var(--yel)}.k-btn.yel:hover{background:#ffd633}
  .k-btn.sm{padding:6px 11px;font-size:13px;border-radius:9px}
  .k-btn:disabled{opacity:.5;cursor:default}
  .k-in,.k-ta,.k-sel{width:100%;background:#181818;color:var(--fg);border:1px solid var(--line2);border-radius:11px;padding:11px 13px;font:inherit;font-size:14.5px;outline:none}
  .k-in:focus,.k-ta:focus,.k-sel:focus{border-color:#555}.k-ta{min-height:96px;resize:vertical;line-height:1.5}
  .k-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px}
  .k-muted{color:var(--dim)}.k-small{font-size:13px}
  .k-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);background:#f0f0f0;color:#111;padding:10px 16px;border-radius:12px;font-size:14px;opacity:0;pointer-events:none;transition:all .25s;z-index:100;max-width:90vw;text-align:center}
  .k-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  .k-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:90;padding:16px;backdrop-filter:blur(3px)}
  .k-box{width:100%;max-width:420px;background:#1f1f1f;border:1px solid var(--line2);border-radius:20px;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
  .k-box h2{margin:0 0 4px;font-size:22px}.k-box .k-muted{margin-bottom:16px;font-size:14px;line-height:1.5}
  .k-field{margin-bottom:10px}.k-err{color:var(--red);font-size:13.5px;min-height:18px;margin:6px 0}
  .k-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.k-grow{flex:1}
  .k-ico{width:18px;height:18px;flex:0 0 auto}
  .k-pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;border-radius:999px;padding:3px 10px;background:#2a2a2a;color:#cfcfcf}
  .k-logo{height:34px;display:block}`;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  const $=(id)=>document.getElementById(id);
  const el=(tag,cls,text)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; };
  const ico=(d,cls='k-ico')=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS={solo:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',team:'<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15 14.5a5 5 0 0 1 6.5 5"/>',
    org:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3"/><path d="M3 12h18"/><path d="M10 12v3h4v-3"/>',sliders:'<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="18" cy="18" r="2"/>',
    chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>',tasks:'<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',page:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7"/><path d="M9 17h5"/>',
    brain:'<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',rule:'<path d="M9 12l2 2 4-4"/><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>',meet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M21.5 20a6 6 0 0 0-4-5.6"/>',chart:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',policy:'<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>',check:'<path d="M20 6 9 17l-5-5"/>',
    log:'<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',data:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    spaces:'<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',plus:'<path d="M12 5v14"/><path d="M5 12h14"/>',arrow:'<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    spark:'<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>',out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',down:'<path d="m6 9 6 6 6-6"/>',menu:'<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'};
  let toastEl=null;
  const toast=(m)=>{ if(!toastEl){ toastEl=el('div','k-toast'); document.body.appendChild(toastEl); } toastEl.textContent=m; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove('show'),2800); };
  const api=async(url,opt={})=>{ const r=await fetch(url,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})},body:opt.body&&typeof opt.body!=='string'?JSON.stringify(opt.body):opt.body}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Something went wrong.'); return d; };
  const store=(k,v)=>{ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)||'null'); localStorage.setItem(k,JSON.stringify(v)); }catch{ return null; } };
  const ago=(t)=>{ const s=(Date.now()-t)/1000; return s<60?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':new Date(t).toLocaleDateString('en-IN',{day:'numeric',month:'short'}); };
  const btn=(label,fn,cls='')=>{ const b=el('button','k-btn '+cls); b.innerHTML=label; b.onclick=fn; return b; };
  function modal(build){ const m=el('div','k-modal'), b=el('div','k-box'); m.appendChild(b); const close=()=>m.remove(); m.onclick=(e)=>{ if(e.target===m) close(); }; document.addEventListener('keydown',function esc(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown',esc); } }); build(b,close); document.body.appendChild(m); return close; }
  function askText(title,ph='',init=''){ return new Promise(ok=>{ modal((b,close)=>{ b.appendChild(el('h2',null,title)); const i=el('input','k-in'); i.placeholder=ph; i.value=init; i.style.margin='12px 0';
    const done=(v)=>{ close(); ok(v); }; i.onkeydown=(e)=>{ if(e.key==='Enter') done(i.value.trim()||null); };
    const row=el('div','k-row'); row.style.justifyContent='flex-end'; row.append(btn('Cancel',()=>done(null)),btn('OK',()=>done(i.value.trim()||null),'pri')); b.append(i,row); setTimeout(()=>i.focus(),30); }); }); }
  let me=null;
  async function loadMe(){ try{ const d=await api('/api/auth/me'); me=d.user||null; window.ccMe=me; window.ccPlan=d.plan||null; return d; }catch{ me=null; return {}; } }
  // sign in or create an account (email + password; Google sign-in comes with the real domain)
  function signIn(startWith='signup',why=''){ return new Promise(ok=>{ modal((b,close)=>{
    let mode=startWith; const draw=()=>{ b.innerHTML='';
      b.appendChild(el('h2',null,mode==='signup'?'Create your account':'Welcome back'));
      b.appendChild(el('div','k-muted',why||(mode==='signup'?'Free while we are testing — no card needed.':'Sign in to open your space.')));
      const name=el('input','k-in k-field'); name.placeholder='Your name'; const email=el('input','k-in k-field'); email.type='email'; email.placeholder='Email'; const pass=el('input','k-in k-field'); pass.type='password'; pass.placeholder=mode==='signup'?'Password (8+ characters)':'Password';
      const err=el('div','k-err'); const go=btn(mode==='signup'?'Create account':'Sign in',async()=>{ err.textContent=''; go.disabled=true;
        try{ await api(mode==='signup'?'/api/auth/signup':'/api/auth/login',{method:'POST',body:mode==='signup'?{name:name.value.trim(),email:email.value.trim(),password:pass.value}:{email:email.value.trim(),password:pass.value}}); await loadMe(); close(); ok(me); }
        catch(e){ err.textContent=e.message; go.disabled=false; } },'pri'); go.style.width='100%';
      [name,email,pass].forEach(x=>x.onkeydown=(e)=>{ if(e.key==='Enter') go.click(); });
      if(mode==='signup') b.appendChild(name); b.append(email,pass,err,go);
      const sw=el('div','k-muted k-small'); sw.style.cssText='text-align:center;margin:14px 0 0'; const a=el('a',null,mode==='signup'?'I already have an account':'Create a new account'); a.href='#'; a.style.color='var(--blue)'; a.onclick=(e)=>{ e.preventDefault(); mode=mode==='signup'?'signin':'signup'; draw(); }; sw.appendChild(a); b.appendChild(sw);
      setTimeout(()=>(mode==='signup'?name:email).focus(),30); };
    draw(); }); }); }
  async function signOut(){ try{ await api('/api/auth/logout',{method:'POST'}); }catch{} location.href='/?home=1'; }
  const PLAN_PATH={solo:'/solo',team:'/team',org:'/org'};
  window.cc={$,el,ico,ICONS,toast,api,store,ago,btn,modal,askText,loadMe,signIn,signOut,PLAN_PATH,get me(){ return me; }};
})();
