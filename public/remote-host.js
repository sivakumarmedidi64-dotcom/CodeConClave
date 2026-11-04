// Remote - the laptop side (Solo). Turn it on, scan the QR code with your phone, and your phone can use this
// laptop's CodeConClave from anywhere: what you type or say there runs here (your folder, the coding agent,
// apps through the desktop app) and the answer goes back to the phone. Nothing runs while Remote is off.
(function(){
  const A=window.ccApp; if(!A) return;
  if(/^\/(team|org|organization)(\/|$)/.test(location.pathname)) return;   // Remote is a Solo feature
  const $=(id)=>document.getElementById(id);
  const el=(tag,cls,text)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; };
  const SV=(d)=>'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
  const I={phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',laptop:'<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',back:'<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    folder:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',bolt:'<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',apps:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    refresh:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',check:'<path d="M20 6 9 17l-5-5"/>',power:'<path d="M12 3v9"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/>'};
  const store=(k,v)=>{ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)||'null'); localStorage.setItem(k,JSON.stringify(v)); }catch{ return null; } };
  const ago=(t)=>{ if(!t) return 'never'; const s=(Date.now()-t)/1000; return s<60?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':new Date(t).toLocaleDateString('en-IN',{day:'numeric',month:'short'}); };
  const api=async(url,opt={})=>{ const r=await fetch(url,{...opt,headers:{'Content-Type':'application/json'},body:opt.body&&typeof opt.body!=='string'?JSON.stringify(opt.body):opt.body}); const d=await r.json().catch(()=>({})); if(!r.ok) throw Object.assign(new Error(d.error||'Something went wrong.'),{status:r.status}); return d; };
  const css=`
  .rm-badge{margin-left:auto;font-size:11px;font-weight:600;border-radius:999px;padding:1px 8px;background:#2c2c2c;color:#cfcfcf}
  .rm-wrap{max-width:860px;margin:0 auto}
  .rm-hero{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:24px;align-items:center;background:#1f1f1f;border:1px solid #2a2a2a;border-radius:18px;padding:22px}
  .rm-hero h2{margin:0 0 8px;font-size:24px;letter-spacing:-.01em}.rm-hero p{margin:0;color:var(--dim);line-height:1.6}
  .rm-pic{display:flex;align-items:center;justify-content:center;gap:14px;color:#cfcfcf}.rm-pic .ico{width:46px;height:46px;stroke-width:1.4}.rm-pic .dots{display:flex;gap:5px}.rm-pic .dots i{width:6px;height:6px;border-radius:50%;background:#555;animation:rmd 1.4s infinite}
  .rm-pic .dots i:nth-child(2){animation-delay:.2s}.rm-pic .dots i:nth-child(3){animation-delay:.4s}@keyframes rmd{0%,100%{background:#444}50%{background:#e6e6e6}}
  .rm-row{display:flex;align-items:center;gap:12px;background:#1f1f1f;border:1px solid #2a2a2a;border-radius:14px;padding:14px 16px;margin-top:12px;flex-wrap:wrap}.rm-row .grow{flex:1;min-width:180px}
  .rm-row b{display:block;font-weight:600}.rm-row .sub{color:var(--dim);font-size:13px;margin-top:2px;line-height:1.5}.rm-row>.ico{width:20px;height:20px;color:var(--dim)}
  .rm-qr{display:grid;grid-template-columns:auto minmax(0,1fr);gap:22px;align-items:center;background:#1f1f1f;border:1px solid #2a2a2a;border-radius:18px;padding:20px;margin-top:12px}
  .rm-qrbox{width:220px;height:220px;background:#fff;border-radius:14px;padding:12px;display:flex;align-items:center;justify-content:center}.rm-qrbox img,.rm-qrbox canvas{width:196px!important;height:196px!important}
  .rm-qr ol{margin:8px 0 12px;padding-left:20px;line-height:1.8;color:#d6d6d6}.rm-qr .tm{color:var(--dim);font-size:13px}
  .rm-link{display:flex;gap:8px;margin-top:10px}.rm-link input{flex:1;min-width:0;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:9px 11px;font:inherit;font-size:13px}
  .rm-sec{margin:26px 0 8px;font-size:12.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
  .rm-log{font-size:13.5px;color:#cfcfcf}.rm-log div{padding:8px 2px;border-bottom:1px solid #262626;display:flex;gap:10px}.rm-log span{color:var(--dim);white-space:nowrap}
  .rm-name{background:transparent;border:1px solid transparent;color:var(--fg);font:inherit;font-weight:600;border-radius:8px;padding:2px 6px;margin-left:-6px;width:100%;max-width:280px}.rm-name:hover,.rm-name:focus{border-color:#3a3a3a;outline:none}
  .rm-btn .ico{width:15px;height:15px;vertical-align:-2px}
  @media(max-width:720px){ .rm-hero,.rm-qr{grid-template-columns:1fr} .rm-pic{order:-1} .rm-qrbox{margin:0 auto} }`;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

  // this laptop's id (random, kept in this browser) and name
  let hostId=store('cc_remote_host'); if(!/^[a-z0-9]{16}$/.test(hostId||'')){ hostId=Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>b.toString(16).padStart(2,'0')).join(''); store('cc_remote_host',hostId); }
  const guess=()=>A.desk?'My laptop (desktop app)':/Windows/i.test(navigator.userAgent)?'My Windows laptop':/Mac/i.test(navigator.userAgent)?'My Mac':/Linux/i.test(navigator.userAgent)?'My Linux computer':'My computer';
  const hostName=()=>String(store('cc_remote_name')||guess()).slice(0,60);
  let on=store('cc_remote_on')===true, running=false, code=null, codeAt=0, devices=[], log=store('cc_remote_log')||[], wake=null;
  const addLog=(t)=>{ log.unshift({t:String(t).slice(0,160),at:Date.now()}); log=log.slice(0,12); store('cc_remote_log',log); if(pg.classList.contains('open')) drawLog(); };

  // the sidebar link (after Skills)
  const link=el('button','sidelink'); link.id='remoteBtn'; link.innerHTML=SV(I.phone); link.append(' Remote'); const badge=el('span','rm-badge','On'); link.appendChild(badge);
  const after=$('skillBtn'); if(after) after.after(link);
  link.onclick=()=>open();
  const paintLink=()=>{ badge.hidden=!on; };
  // the page (opens in the main area like Library or Automations)
  const pg=el('div','page'); pg.id='remotePage';
  const head=el('div','pagehead'), bk=el('button','railbtn pback'); bk.title='Back'; bk.innerHTML=SV(I.back); bk.onclick=()=>A.closePages();
  head.append(bk,el('h1',null,'Remote')); const body=el('div','pagebody'); pg.append(head,body); document.body.appendChild(pg);
  function open(turnOn){ A.closePages(); pg.classList.add('open'); pg.scrollTop=0; link.classList.add('on'); A.closeRail(); if(turnOn && A.me && !on) setOn(true); else draw(); }
  window.ccRemote={open};

  async function draw(){
    body.innerHTML=''; const w=el('div','rm-wrap'); body.appendChild(w);
    const hero=el('div','rm-hero'), t=el('div'); t.appendChild(el('h2',null,'Use this laptop from your phone'));
    t.appendChild(el('p',null,'Scan the code with your phone’s camera. Then whatever you type or say on your phone, this laptop does — your folders, code, websites and apps — and the answer comes back to your phone. It works from anywhere: home, college, a bus.'));
    const pic=el('div','rm-pic'); pic.innerHTML=SV(I.phone)+'<div class="dots"><i></i><i></i><i></i></div>'+SV(I.laptop); hero.append(t,pic); w.appendChild(hero);
    if(!A.me){ const r=el('div','rm-row'); r.innerHTML=SV(I.power); const g=el('div','grow'); g.appendChild(el('b',null,'Sign in first')); g.appendChild(el('div','sub','Remote links your phone to your account, so only you can use your laptop.')); r.appendChild(g);
      const b=el('button','msend','Sign in'); b.onclick=()=>A.signIn(false); r.appendChild(b); w.appendChild(r); return; }
    // on / off
    const r=el('div','rm-row'); r.innerHTML=SV(I.power); const g=el('div','grow'); g.appendChild(el('b',null,on?'Remote is on':'Remote is off'));
    g.appendChild(el('div','sub',on?'Keep this laptop on, plugged in and this window open. Your phone can reach it from anywhere.':'Turn it on to link your phone. Nothing from a phone runs while it is off.')); r.appendChild(g);
    const tb=el('button',on?'mskip':'msend',on?'Turn off':'Turn on'); tb.onclick=()=>setOn(!on); r.appendChild(tb); w.appendChild(r);
    // this laptop's name
    const nr=el('div','rm-row'); nr.innerHTML=SV(I.laptop); const ng=el('div','grow'); const ni=el('input','rm-name'); ni.value=hostName(); ni.maxLength=60; ni.title='Rename this laptop';
    ni.onchange=()=>{ store('cc_remote_name',ni.value.trim()||guess()); A.toast('Saved'); }; ng.appendChild(ni); ng.appendChild(el('div','sub','The name your phone shows. Click to change it.')); nr.appendChild(ng); w.appendChild(nr);
    if(on){
      const q=el('div','rm-qr'), box=el('div','rm-qrbox'); box.appendChild(el('div','tm','Making the code…')); const info=el('div');
      info.appendChild(el('b',null,'Scan this with your phone'));
      const ol=el('ol'); ['Open your phone’s camera (or Google Lens) and point it at the code.','Tap the link that appears — it opens CodeConClave Remote.','Done! Type or speak on your phone. This laptop does it.'].forEach(x=>ol.appendChild(el('li',null,x))); info.appendChild(ol);
      const tm=el('div','tm','The code works for 10 minutes, once.'); info.appendChild(tm);
      const lk=el('div','rm-link'), li=el('input'); li.readOnly=true; li.onclick=()=>li.select(); const cp=el('button','mskip rm-btn'); cp.innerHTML=SV(I.copy)+' Copy link'; cp.onclick=async()=>{ try{ await navigator.clipboard.writeText(li.value); A.toast('Link copied — open it on your phone'); }catch{ li.select(); } };
      const nb=el('button','mskip rm-btn'); nb.innerHTML=SV(I.refresh)+' New code'; nb.onclick=()=>{ code=null; draw(); }; lk.append(li,cp,nb); info.appendChild(lk); q.append(box,info); w.appendChild(q);
      makeCode().then((url)=>{ li.value=url; drawQR(box,url); }).catch((e)=>{ box.innerHTML=''; box.appendChild(el('div','tm',e.message)); });
    }
    // before you leave
    w.appendChild(el('div','rm-sec','Before you leave the laptop'));
    const f=A.folder(), fr=el('div','rm-row'); fr.innerHTML=SV(I.folder); const fg=el('div','grow'); fg.appendChild(el('b',null,f&&f.ready?'Folder connected: '+f.name:'Connect the folder you work in'));
    fg.appendChild(el('div','sub',f&&f.ready?'Your phone can read, change and create files in it.':'So your phone can work on your files and projects. (Browsers ask for this on the laptop itself.)')); fr.appendChild(fg);
    if(!(f&&f.ready)){ const b=el('button','mskip',f?'Allow folder':'Connect folder'); b.onclick=async()=>{ await A.openFolder(); setTimeout(draw,600); }; fr.appendChild(b); } w.appendChild(fr);
    const sr=el('div','rm-row'); sr.innerHTML=SV(I.bolt); const sg=el('div','grow'); sg.appendChild(el('b',null,'Stop the laptop from sleeping')); sg.appendChild(el('div','sub','Keep it plugged in. Windows: Settings → System → Power → Screen and sleep → “Never” when plugged in. While Remote is on, this window also keeps the screen awake.')); sr.appendChild(sg); w.appendChild(sr);
    const ar=el('div','rm-row'); ar.innerHTML=SV(I.apps); const ag=el('div','grow'); ag.appendChild(el('b',null,A.desk?'Desktop app: apps can be opened from your phone':'Want to open apps on this laptop from your phone?'));
    ag.appendChild(el('div','sub',A.desk?'You are in the CodeConClave desktop app, so your phone can open and close apps here too.':'Use the CodeConClave desktop app on this laptop — then your phone can open and close apps too. In the browser, your phone can still use folders, code, websites and everything else.')); ar.appendChild(ag); w.appendChild(ar);
    // linked phones
    w.appendChild(el('div','rm-sec','Linked phones')); const dl=el('div'); w.appendChild(dl);
    try{ devices=(await api('/api/remote/devices')).devices.filter(d=>d.hostId===hostId); }catch{ devices=[]; }
    if(!devices.length) dl.appendChild(el('div','sub','No phone linked yet.'));
    devices.forEach(d=>{ const row=el('div','rm-row'); row.innerHTML=SV(I.phone); const g2=el('div','grow'); g2.appendChild(el('b',null,d.name)); g2.appendChild(el('div','sub','linked '+ago(d.created)+' · last used '+ago(d.seen))); row.appendChild(g2);
      const u=el('button','mskip','Unlink'); u.onclick=async()=>{ try{ await api('/api/remote/devices/'+d.id,{method:'DELETE'}); A.toast('Unlinked — that phone can’t reach this laptop any more.'); draw(); }catch(e){ A.toast(e.message); } }; row.appendChild(u); dl.appendChild(row); });
    w.appendChild(el('div','rm-sec','What your phone asked')); const lg=el('div','rm-log'); lg.id='rmLog'; w.appendChild(lg); drawLog();
  }
  function drawLog(){ const lg=$('rmLog'); if(!lg) return; lg.innerHTML=''; if(!log.length) lg.appendChild(el('div',null,'Nothing yet.')); log.forEach(x=>{ const d=el('div'); d.appendChild(el('span',null,ago(x.at))); d.append(x.t); lg.appendChild(d); }); }
  async function makeCode(){
    if(code && Date.now()-codeAt<9*60000) return code;
    const d=await api('/api/remote/pair',{method:'POST',body:{hostId,hostName:hostName()}}); codeAt=Date.now();
    code=location.origin+'/remote#'+d.code; return code; }
  let qrLib=null;
  function drawQR(box,url){
    const paint=()=>{ box.innerHTML=''; try{ new window.QRCode(box,{text:url,width:196,height:196,colorDark:'#111111',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M}); }catch{ box.appendChild(el('div','tm','Could not draw the code — use Copy link instead.')); } };
    if(window.QRCode) return paint();
    qrLib=qrLib||new Promise((ok,bad)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload=ok; s.onerror=bad; document.head.appendChild(s); });
    qrLib.then(paint).catch(()=>{ box.innerHTML=''; box.appendChild(el('div','tm','Could not load the code picture — use Copy link and open it on your phone.')); });
  }
  function setOn(v){ on=v; store('cc_remote_on',v); paintLink(); if(v){ addLog('Remote turned on'); loop(); keepAwake(); } else { addLog('Remote turned off'); wake?.release?.().catch(()=>{}); wake=null; } if(pg.classList.contains('open')) draw(); }
  async function keepAwake(){ try{ if(on && document.visibilityState==='visible' && navigator.wakeLock && !wake){ wake=await navigator.wakeLock.request('screen'); wake.addEventListener('release',()=>{ wake=null; }); } }catch{} }
  document.addEventListener('visibilitychange',keepAwake);

  // the work loop: wait for the phone, do it here, send the answer back
  async function loop(){
    if(running) return; running=true;
    let fails=0;
    while(on && A.me){
      try{
        const r=await fetch('/api/remote/host/wait?hostId='+hostId+'&name='+encodeURIComponent(hostName()));
        if(r.status===401) break;
        if(!r.ok) throw new Error('server '+r.status);
        const d=await r.json(); fails=0;
        for(const job of d.jobs||[]) await handle(job);
      }catch{ fails++; await new Promise(ok=>setTimeout(ok,Math.min(30000,2000*fails))); }
    }
    running=false;
  }
  const reply=(job,body)=>api('/api/remote/host/reply',{method:'POST',body:{deviceId:job.device.id,job:job.id,...body}}).catch(()=>{});
  async function handle(job){
    if(job.kind==='paired'){ addLog('Phone linked: '+job.device.name); A.toast('Your phone is linked — '+job.device.name); code=null; if(pg.classList.contains('open')) draw(); return; }
    if(job.kind!=='ask') return;
    addLog(job.device.name+': '+job.text);
    await reply(job,{status:'Your laptop is working on it…'});
    let msgs=[]; try{ msgs=await A.run(job.text); }catch(e){ await reply(job,{done:true,text:'Your laptop had a problem: '+(e.message||'unknown')}); return; }
    const parts=[], links=[], images=[];
    for(const m of msgs){
      let t=String(m.content||'').replace(/\s*📊\s*Source:[^\n]*/g,'').trim();
      if(m.media?.thumb && images.length<2 && /^data:image\//.test(m.media.thumb)) images.push(m.media.thumb);
      if(m.media && !t) t='Done — I made a '+(m.media.kind||'file')+'. It’s saved on your laptop.';
      if(m.linkCard?.url) links.push({url:m.linkCard.url,title:m.linkCard.title||m.linkCard.url});
      if(m.folderAsk && !m.folderAsk.done) t+=(t?'\n\n':'')+'(This needs a click on the laptop — connect or allow the folder there before you leave, then ask again.)';
      if(t) parts.push(t);
    }
    await reply(job,{done:true,text:parts.join('\n\n')||'Done.',links,images});
  }
  paintLink();
  // after a reload: if Remote was on, carry on (once we know who is signed in)
  const resume=()=>{ if(on && A.me) { loop(); keepAwake(); } };
  window.addEventListener('cc-me',resume); if(A.loaded) resume();
})();
