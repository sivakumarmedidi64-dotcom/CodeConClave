// CodeConClave Team (/team): the whole CodeConClave AI app - chat, voice and Live, pictures, videos, games, Automations,
// Plugins, Skills, Library, Creations - plus the team's own things in the same sidebar: a team chat with @CodeConClave,
// tasks, pages, the team brain, standards, meetings, shared AI chats, members (up to 20) and share-space links.
// Your own AI chats here follow the team's standards and know its brain (the server adds them, for members only).
(function(){
  if(!/^\/team(\/|$)/.test(location.pathname)) return;
  const A=window.ccApp; if(!A) return;
  document.title='CodeConClave Team';
  const $=(id)=>document.getElementById(id);
  const el=(tag,cls,text)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; };
  const SV=(d)=>'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
  const I={
    team:'<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15 14.5a5 5 0 0 1 6.5 5"/>',
    chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>',
    tasks:'<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
    page:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7"/><path d="M9 17h5"/>',
    brain:'<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
    rule:'<path d="M9 12l2 2 4-4"/><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>',
    meet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M21.5 20a6 6 0 0 0-4-5.6"/>',
    share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/>',
    invite:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6"/><path d="M16 11h6"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
    lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    down:'<path d="m6 9 6 6 6-6"/>', plus:'<path d="M12 5v14"/><path d="M5 12h14"/>', check:'<path d="M20 6 9 17l-5-5"/>',
    arrow:'<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', send:'<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    org:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3"/><path d="M3 12h18"/><path d="M10 12v3h4v-3"/>',
    back:'<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    spark:'<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>'
  };
  const toast=(m)=>A.toast(m);
  const api=async(url,opt={})=>{ const r=await fetch(url,{...opt,headers:{'Content-Type':'application/json'},body:opt.body&&typeof opt.body!=='string'?JSON.stringify(opt.body):opt.body});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Something went wrong — please try again.'); return d; };
  const store=(k,v)=>{ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)||'null'); localStorage.setItem(k,JSON.stringify(v)); }catch{ return null; } };
  const ago=(t)=>{ const s=(Date.now()-t)/1000; return s<60?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':new Date(t).toLocaleDateString('en-IN',{day:'numeric',month:'short'}); };
  const nid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
  const initials=(s)=>String(s||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
  const hue=(s)=>{ let h=0; for(const c of String(s)) h=(h*31+c.charCodeAt(0))%360; return h; };
  const avatar=(name,round)=>{ const a=el('div','tm-av'+(round?' round':''),initials(name)); a.style.background='hsl('+hue(name)+' 62% 64%)'; return a; };
  const btn=(label,fn,cls='mskip')=>{ const b=el('button',cls); b.innerHTML=label; b.onclick=fn; return b; };

  const css=`
  .tm-side .raillbl{padding-top:16px}
  .tm-switch{display:flex;align-items:center;gap:10px;margin:2px 8px 6px;width:calc(100% - 16px);padding:8px 10px;background:#232323;border:1px solid #2e2e2e;border-radius:12px;color:var(--fg);font:inherit;text-align:left;cursor:pointer}
  .tm-switch:hover{background:#282828}.tm-switch .nm{flex:1;min-width:0}
  .tm-switch b{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tm-switch .nm span{color:var(--dim);font-size:12px}
  .tm-av{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#141414;flex:0 0 auto}
  .tm-av.round{border-radius:50%}
  .tm-badge{margin-left:auto;background:var(--gold);color:#1a1a1a;font-size:11.5px;font-weight:700;border-radius:999px;padding:1px 7px}
  .tm-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid #333;background:#222;color:var(--fg);border-radius:999px;padding:3px 11px 3px 3px;font:inherit;font-size:13px;cursor:pointer;max-width:220px;min-width:0}
  .tm-pill:hover{background:#2a2a2a}.tm-pill .tm-av{width:22px;height:22px;font-size:9.5px}.tm-pill span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tm-topshare{width:auto!important;padding:0 11px!important;gap:6px;font:inherit;font-size:13.5px;border:1px solid #333!important;height:32px!important;margin-left:auto}
  .tm-pill[hidden],.tm-topshare[hidden],.tm-badge[hidden],.tm-page [hidden],.tm-modal [hidden]{display:none!important}
  .tm-menu{position:fixed;z-index:60;background:#262626;border:1px solid #3a3a3a;border-radius:14px;padding:6px;width:260px;box-shadow:0 18px 50px rgba(0,0,0,.5)}
  .tm-menu button{display:flex;align-items:center;gap:10px;width:100%;border:none;background:none;color:var(--fg);font:inherit;font-size:14px;padding:8px 10px;border-radius:9px;cursor:pointer;text-align:left}
  .tm-menu button:hover{background:#303030}.tm-menu .grow{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tm-menu hr{border:none;border-top:1px solid #333;margin:5px 0}
  .tm-menu .tm-av{width:26px;height:26px;font-size:11px}
  .tm-h1sub{display:block;font-size:13px;font-weight:400;color:var(--dim);margin-top:2px}
  .tm-acts{display:flex;gap:8px;flex-wrap:wrap}
  .tm-tabs{margin:4px 0 18px}.tm-tabs button{display:inline-flex;align-items:center;gap:7px}
  .tm-in,.tm-ta,.tm-sel{width:100%;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit;font-size:14.5px;outline:none}
  .tm-in:focus,.tm-ta:focus,.tm-sel:focus{border-color:#4a4a4a}.tm-ta{min-height:110px;resize:vertical;line-height:1.55}
  .tm-card{background:#1f1f1f;border:1px solid #2a2a2a;border-radius:14px;padding:16px}
  .tm-click{cursor:pointer;transition:border-color .15s}.tm-click:hover{border-color:#3d3d3d}
  .tm-muted{color:var(--dim);line-height:1.55}.tm-small{font-size:13px}
  .tm-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0}.tm-bar .tm-in{flex:1;width:auto;min-width:180px}
  .tm-right{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}
  .tm-sec{margin:24px 0 10px;font-size:12.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
  .tm-row{display:flex;align-items:center;gap:12px;background:#1f1f1f;border:1px solid #2a2a2a;border-radius:12px;padding:11px 13px;margin-bottom:8px;flex-wrap:wrap}
  .tm-row .grow{flex:1;min-width:150px}.tm-row b{display:block;font-weight:500;overflow-wrap:anywhere}.tm-row .ico{color:var(--dim)}
  .tm-role{font-size:12px;background:#2c2c2c;border-radius:999px;padding:3px 10px;color:#cfcfcf;text-transform:capitalize}
  .tm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
  .tm-kan{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .tm-col{background:#1c1c1c;border:1px solid #262626;border-radius:14px;padding:12px;min-height:220px}
  .tm-col h4{margin:2px 4px 12px;font-size:13px;color:var(--dim);display:flex;justify-content:space-between;font-weight:600}
  .tm-task{background:#232323;border:1px solid #2e2e2e;border-radius:12px;padding:11px 12px;margin-bottom:10px}
  .tm-task .t{font-size:14.5px;line-height:1.4;overflow-wrap:anywhere}.tm-task .m{color:var(--dim);font-size:12.5px;margin-top:6px}
  .tm-task ul{margin:8px 0 0;padding-left:18px;font-size:13px;color:#cfcfcf}.tm-task .acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
  .tm-task select{background:#2a2a2a;color:var(--fg);border:1px solid #3a3a3a;border-radius:8px;font-size:12px;padding:4px;max-width:130px}
  .tm-sm{padding:5px 10px!important;font-size:13px!important}
  .tm-chat{display:flex;flex-direction:column;height:calc(100vh - 220px);min-height:340px}
  .tm-log{flex:1;overflow-y:auto;padding:2px 2px 12px}
  .tm-msg{display:flex;gap:12px;padding:8px 6px;border-radius:12px}.tm-msg:hover{background:#1e1e1e}.tm-msg .grow{min-width:0;flex:1}
  .tm-msg .who{font-weight:600;font-size:14px}.tm-msg .who span{color:#6f6f6f;font-weight:400;font-size:12px;margin-left:8px}
  .tm-msg .txt{white-space:pre-wrap;line-height:1.55;font-size:14.5px;margin-top:2px;overflow-wrap:anywhere}
  .tm-msg.ai .who{color:var(--gold)}.tm-aiav{width:30px;height:30px;border-radius:50%;flex:0 0 auto}
  .tm-comp{display:flex;gap:10px;align-items:flex-end;background:var(--field);border:1px solid var(--edge);border-radius:16px;padding:10px 10px 10px 14px}
  .tm-comp textarea{flex:1;background:none;border:none;color:var(--fg);font:inherit;font-size:15px;resize:none;outline:none;max-height:160px;min-height:24px;line-height:1.5}
  .tm-send{width:34px;height:34px;border-radius:50%;border:none;background:var(--fg);color:#1a1a1a;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}
  .tm-send .ico{width:18px;height:18px}
  .tm-pages{display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px}
  .tm-plist button{display:block;width:100%;text-align:left;background:#1f1f1f;border:1px solid #2a2a2a;color:var(--fg);border-radius:10px;padding:9px 12px;margin-bottom:6px;font:inherit;font-size:14px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tm-plist button.on{border-color:#5a5a5a;background:#262626}
  .tm-ptitle{width:100%;background:none;border:none;color:var(--fg);font:inherit;font-size:24px;font-weight:700;outline:none;margin-bottom:10px}
  .tm-empty{text-align:center;color:var(--dim);padding:44px 16px;line-height:1.7;white-space:pre-line}
  .tm-src{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.tm-src span{font-size:12px;background:#2a2a2a;border-radius:8px;padding:3px 9px;color:#cfcfcf}
  .tm-seg{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 4px}
  .tm-seg button{flex:1;min-width:190px;display:flex;align-items:flex-start;gap:10px;text-align:left;border:1px solid #2e2e2e;background:#1f1f1f;color:var(--fg);font:inherit;border-radius:12px;padding:11px 12px;cursor:pointer}
  .tm-seg button.on{border-color:var(--fg);background:#262626}.tm-seg button b{display:block;font-size:14px;font-weight:600}.tm-seg button span{color:var(--dim);font-size:12.5px;line-height:1.4}
  .tm-seg .ico{width:18px;height:18px;margin-top:1px}
  .tm-vis{display:inline-flex;align-items:center;gap:5px;font-size:12px;border-radius:999px;padding:3px 9px;white-space:nowrap}
  .tm-vis.pub{background:rgba(26,147,254,.14);color:#6cb8ff}.tm-vis.pri{background:#2c2c2c;color:#cfcfcf}.tm-vis .ico{width:13px;height:13px}
  .tm-link{background:#1b1b1b;border:1px solid #2c2c2c;border-radius:12px;padding:12px;margin-top:12px}
  .tm-welcome{max-width:560px;margin:34px auto 0;text-align:center}.tm-welcome img{height:54px;margin-bottom:16px}
  .tm-welcome h2{font-size:28px;margin:0 0 10px;letter-spacing:-.01em}.tm-welcome .tm-card{text-align:left;margin-top:14px}
  .tm-welcome .tm-right{justify-content:center}
  .tm-feat{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:20px 0 4px;text-align:left}
  .tm-feat div{display:flex;gap:8px;align-items:center;font-size:13.5px;color:#cfcfcf;background:#1f1f1f;border:1px solid #2a2a2a;border-radius:10px;padding:9px 10px}
  .tm-modal{max-width:520px}.tm-modal.wide{max-width:760px}.tm-mt{font-size:18px;font-weight:700;margin-bottom:6px}
  .tm-modal .tm-log{max-height:56vh;border:1px solid #2a2a2a;border-radius:12px;padding:8px;margin-top:12px}
  .tm-opt{display:flex;gap:10px;align-items:flex-start;padding:9px 2px;cursor:pointer;font-size:14.5px}.tm-opt input{margin-top:3px;accent-color:#e6e6e6}
  .tm-clip{color:#bdbdbd;font-size:13px;margin-top:8px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  @media(max-width:720px){ .tm-kan,.tm-pages,.tm-feat{grid-template-columns:1fr} .tm-topshare span{display:none} .tm-topshare{padding:0 8px!important}
    .tm-pill span{max-width:84px} .tm-chat{height:calc(100vh - 250px)} .tm-seg button{min-width:0}
    .tm-page .pagehead{flex-wrap:wrap}.tm-page .pagehead h1{min-width:0;font-size:19px}.tm-page .tm-acts{width:100%;order:3}.tm-h1sub{display:inline;margin-left:6px}
    .tm-col{min-height:0}.tm-tabs{gap:4px}.tm-tabs button{padding:6px 10px;font-size:14px} }
  @media(max-width:420px){ .tm-pill span{display:none} .tm-pill{padding:3px} }`;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

  // ---------- state ----------
  let me=null, space=null, data=null, list=[], poll=null, unreadT=null, mode=null, lastMe, booted=false;
  let tab=store('cc_team_tab')||'Chat', joinTok=new URLSearchParams(location.search).get('join');
  const isAdmin=()=>['owner','admin'].includes(data?.myRole);
  const canWrite=()=>Boolean(data)&&data.myRole!=='guest';
  const myName=()=>me?.name||me?.email||'';
  const items=async(kind,since)=>(await api('/api/spaces/'+space.id+'/items/'+kind+(since?'?since='+since:''))).items;
  const putItem=(kind,id,d)=>api('/api/spaces/'+space.id+'/items/'+kind+'/'+encodeURIComponent(id),{method:'PUT',body:{data:d}});
  const delItem=(kind,id)=>api('/api/spaces/'+space.id+'/items/'+kind+'/'+encodeURIComponent(id),{method:'DELETE'});
  // every AI chat you send from /team carries the team id: the server adds the team's standards + brain (members only)
  window.ccChatExtra=()=>me&&space?{space:space.id}:{};

  // ---------- small boxes: a question, a yes/no ----------
  function modal(build,wide){ const m=el('div','modal open'), b=el('div','modalbox tm-modal'+(wide?' wide':'')); m.appendChild(b);
    const esc=(e)=>{ if(e.key==='Escape') close(); }; const close=()=>{ m.remove(); document.removeEventListener('keydown',esc); };
    m.onclick=(e)=>{ if(e.target===m) close(); }; document.addEventListener('keydown',esc); build(b,close); document.body.appendChild(m); return close; }
  function askText(title,ph='',init=''){ return new Promise(ok=>{ modal((b,close)=>{ let done=false; const fin=(v)=>{ if(done) return; done=true; close(); ok(v); };
    b.appendChild(el('div','tm-mt',title)); const i=el('input','tm-in'); i.placeholder=ph; i.value=init; i.style.marginTop='10px'; i.onkeydown=(e)=>{ if(e.key==='Enter') fin(i.value.trim()||null); };
    const r=el('div','tm-right'); r.append(btn('Cancel',()=>fin(null)),btn('OK',()=>fin(i.value.trim()||null),'msend')); b.append(i,r); setTimeout(()=>i.focus(),30); }); }); }
  function askYes(text,yes='Yes'){ return new Promise(ok=>{ modal((b,close)=>{ b.appendChild(el('div','tm-mt',text)); const r=el('div','tm-right');
    r.append(btn('Cancel',()=>{ close(); ok(false); }),btn(yes,()=>{ close(); ok(true); },'msend')); b.appendChild(r); }); }); }

  // ---------- the sidebar: a "Team" section above your chats ----------
  const side=el('div','tm-side'); const above=$('convos')?.previousElementSibling; if(above) above.parentNode.insertBefore(side,above);
  function link(label,ic,fn,id,badge){ const b=el('button','sidelink'); if(id) b.id=id; b.innerHTML=SV(ic); b.append(' '+label);
    if(badge){ const s=el('span','tm-badge'); s.id='tmBadge'; s.hidden=true; b.appendChild(s); } b.onclick=fn; side.appendChild(b); return b; }
  const seatsText=()=>{ const n=data?.members?.length||0; return data?.seats?n+' of '+data.seats+' people':n+' member'+(n===1?'':'s'); };
  function drawSide(){
    side.innerHTML=''; side.appendChild(el('div','raillbl','Team'));
    if(!me){ link('Sign in to use Team',I.team,welcome,'tmHub'); return; }
    if(!space){ link('Create or join a team',I.plus,firstRun,'tmHub'); return; }
    const sw=el('button','tm-switch'); sw.title='Switch team'; sw.appendChild(avatar(space.name)); const nm=el('div','nm'); nm.appendChild(el('b',null,space.name)); nm.appendChild(el('span',null,seatsText()+' · '+(data?.myRole||'member'))); sw.appendChild(nm); sw.insertAdjacentHTML('beforeend',SV(I.down));
    sw.onclick=(e)=>{ e.stopPropagation(); switcher(sw); }; side.appendChild(sw);
    link('Team space',I.team,()=>hub(),'tmHub',true);
    link('Share space',I.share,shares,'tmShare');
    if(isAdmin()) link('Invite people',I.invite,invite,'tmInvite');
  }
  // the top bar: which team you are in + Share (this chat -> the team)
  const titleEl=document.querySelector('.top__title'), panelBtn=$('panelBtn');
  const pill=el('button','tm-pill'); pill.title='Open your team space'; pill.hidden=true; pill.onclick=()=>hub(); if(titleEl) titleEl.after(pill);
  const shareTop=el('button','railbtn tm-topshare'); shareTop.title='Share this chat with your team'; shareTop.innerHTML=SV(I.share)+'<span>Share</span>'; shareTop.hidden=true; shareTop.onclick=()=>shareChat();
  if(panelBtn) panelBtn.before(shareTop);
  function drawTop(){ const on=Boolean(me&&space); pill.hidden=!on; shareTop.hidden=!on; if(panelBtn) panelBtn.style.marginLeft=on?'4px':'';
    if(on){ pill.innerHTML=''; pill.appendChild(avatar(space.name,true)); pill.appendChild(el('span',null,space.name)); } }

  // ---------- one page for everything Team (opens in the main area, like Library or Automations) ----------
  const pg=el('div','page tm-page'); pg.id='teamPage';
  const head=el('div','pagehead'), back=el('button','railbtn pback'); back.title='Back'; back.innerHTML=SV(I.back); back.onclick=()=>A.closePages();
  const h1=el('h1'), acts=el('div','tm-acts'); head.append(back,h1,acts);
  const body=el('div','pagebody'); pg.append(head,body); document.body.appendChild(pg);
  function open(title,linkId,m){ A.closePages(); clearInterval(poll); mode=m||null; h1.textContent=title; acts.innerHTML=''; body.innerHTML=''; pg.classList.add('open'); pg.scrollTop=0;
    if(linkId&&$(linkId)) $(linkId).classList.add('on'); A.closeRail(); return body; }

  // ---------- start: signed out -> welcome; no team -> create / join; else the team ----------
  async function boot(){
    me=A.me||null;
    if(!me){ space=null; data=null; list=[]; clearInterval(unreadT); drawSide(); drawTop(); welcome(); return; }
    let show=mode==='welcome'?'Chat':null;
    if(joinTok){ const t=joinTok; joinTok=null; history.replaceState(null,'','/team');
      try{ const d=await api('/api/join',{method:'POST',body:{token:t}}); if(d.space.kind==='org') return location.replace('/org?space='+encodeURIComponent(d.space.id));
        store('cc_team_cur',d.space.id); toast('Welcome to '+d.space.name+' 🎉'); show='Chat'; }catch(e){ toast(e.message); } }
    const q=new URLSearchParams(location.search); if(q.get('space')){ store('cc_team_cur',q.get('space')); history.replaceState(null,'','/team'); show=show||'Chat'; }
    await openSpace(store('cc_team_cur'),show);
  }
  async function openSpace(id,show){
    try{ list=(await api('/api/spaces')).spaces.filter(s=>s.kind==='team'||s.kind==='teamspace'); }catch(e){ toast(e.message); list=[]; }
    if(!list.length){ space=null; data=null; clearInterval(unreadT); drawSide(); drawTop(); if(show||mode) firstRun(); return; }
    space=list.find(s=>s.id===id)||list[0]; store('cc_team_cur',space.id);
    try{ data=await api('/api/spaces/'+space.id); space=data.space; }catch(e){ toast(e.message); data={space,myRole:'guest',members:[],seats:null}; }
    drawSide(); drawTop(); startUnread(); if(show) hub(show); else if(mode==='firstRun') hub('Members');
  }
  const onMe=()=>{ const id=A.me?A.me.id:null; if(booted&&same(id,lastMe)) return; if(booted&&id==null&&lastMe==null) return; booted=true; lastMe=id; boot(); };
  window.addEventListener('cc-me',onMe); if(A.loaded) onMe();

  function welcome(){
    const b=open('CodeConClave Team','tmHub','welcome'), w=el('div','tm-welcome');
    w.innerHTML='<img src="/logo.png" alt="CodeConClave">'; w.appendChild(el('h2',null,joinTok?'You’re invited to a team':'CodeConClave Team'));
    w.appendChild(el('div','tm-muted',joinTok?'Create your free account or sign in — you’ll join the team right away.':'Everything in CodeConClave AI, together. Your AI works for the whole team, and your team works in one place.'));
    const f=el('div','tm-feat'); [[I.spark,'The whole AI — chat, voice and Live'],[I.share,'Pictures, videos, games and websites'],[I.tasks,'Automations, Plugins and Skills'],[I.chat,'Team chat with @CodeConClave'],[I.page,'Tasks, pages and meeting notes'],[I.brain,'Team brain + standards the AI follows'],[I.people,'Up to 20 people, invite by link'],[I.link,'Share space: private or public links']]
      .forEach(([ic,t])=>{ const d=el('div'); d.innerHTML=SV(ic); d.append(t); f.appendChild(d); }); w.appendChild(f);
    const r=el('div','tm-right'); r.append(btn('Create free account',()=>A.signIn(true),'msend'),btn('Sign in',()=>A.signIn(false))); w.appendChild(r);
    const bk=el('div','tm-muted tm-small'); bk.style.marginTop='20px'; bk.innerHTML='<a href="/?home=1" style="color:inherit">← All plans</a>'; w.appendChild(bk); b.appendChild(w);
  }
  function firstRun(){
    const b=open('Your team','tmHub','firstRun'), w=el('div','tm-welcome');
    w.innerHTML='<img src="/logo.png" alt="CodeConClave">'; w.appendChild(el('h2',null,'Create your team'));
    w.appendChild(el('div','tm-muted','Give it a name, then invite up to 20 people with a link. Everything in CodeConClave AI works here too.'));
    const c=el('div','tm-card'), inp=el('input','tm-in'); inp.placeholder='Team name, e.g. Product team'; inp.maxLength=80;
    const go=btn('Create team',async()=>{ const n=inp.value.trim(); if(!n) return toast('Type a name first.'); go.disabled=true;
      try{ const d=await api('/api/spaces',{method:'POST',body:{kind:'team',name:n}}); await api('/api/me/plan',{method:'POST',body:{plan:'team'}}).catch(()=>{}); await openSpace(d.space.id,'Members'); toast(n+' is ready — invite your team 🎉'); }catch(e){ toast(e.message); go.disabled=false; } },'msend');
    go.style.cssText='width:100%;margin-top:10px'; inp.onkeydown=(e)=>{ if(e.key==='Enter') go.click(); }; c.append(inp,go); w.appendChild(c);
    const j=el('div','tm-card'); j.appendChild(el('div','tm-muted tm-small','Got an invite link?')); const ji=el('input','tm-in'); ji.placeholder='Paste the invite link'; ji.style.marginTop='8px';
    const jb=btn('Join',()=>joinWith(ji.value)); jb.style.marginTop='8px'; j.append(ji,jb); w.appendChild(j); b.appendChild(w); setTimeout(()=>inp.focus(),50);
  }
  function joinWith(v){ const tok=(String(v||'').match(/join=([\w-]+)/)||[])[1]||String(v||'').trim(); if(!tok) return toast('Paste the invite link first.'); joinTok=tok; boot(); }

  // ---------- switch team / new team / join ----------
  function closeMenus(){ document.querySelectorAll('.tm-menu').forEach(m=>m.remove()); }
  document.addEventListener('click',closeMenus);
  function switcher(anchor){
    closeMenus(); const m=el('div','tm-menu'); const r=anchor.getBoundingClientRect(); m.style.left=Math.max(8,Math.min(r.left,innerWidth-268))+'px'; m.style.top=(r.bottom+6)+'px';
    const item=(ic,label,fn)=>{ const b=el('button'); b.innerHTML=SV(ic); b.appendChild(el('span','grow',label)); b.onclick=fn; m.appendChild(b); };
    list.forEach(s=>{ const b=el('button'); b.appendChild(avatar(s.name)); b.appendChild(el('span','grow',s.name+(s.kind==='teamspace'?' · teamspace':''))); if(s.id===space.id) b.insertAdjacentHTML('beforeend',SV(I.check)); b.onclick=()=>openSpace(s.id,'Chat'); m.appendChild(b); });
    m.appendChild(el('hr'));
    item(I.plus,'New team',async()=>{ const n=await askText('Name the new team','e.g. Design team'); if(!n) return; try{ const d=await api('/api/spaces',{method:'POST',body:{kind:'team',name:n}}); openSpace(d.space.id,'Members'); }catch(e){ toast(e.message); } });
    item(I.link,'Join with an invite link',async()=>{ const v=await askText('Paste the invite link','https://…/team?join=…'); if(v) joinWith(v); });
    if(space.kind==='teamspace') item(I.org,'Organization console',()=>{ location.href='/org'; });
    item(I.arrow,'All plans',()=>{ location.href='/?home=1'; });
    document.body.appendChild(m);
  }

  // ---------- unread team-chat messages (a small number on "Team space") ----------
  const seenKey=()=>'cc_team_seen_'+space.id;
  const markSeen=(v)=>{ if(!space) return; store(seenKey(),Math.max(store(seenKey())||0,v||0)); const bd=$('tmBadge'); if(bd) bd.hidden=true; };
  function startUnread(){ clearInterval(unreadT); const tick=async()=>{ if(!space||!me||document.hidden||(mode==='hub'&&tab==='Chat')) return;
      try{ const got=await items('message',store(seenKey())||0); const n=got.filter(m=>!same(m.data.by,me.id)).length; const bd=$('tmBadge'); if(bd){ bd.hidden=!n; bd.textContent=n>99?'99+':String(n); } }catch{} };
    tick(); unreadT=setInterval(tick,30000); }

  // ---------- Team space: chat, tasks, pages, brain, standards, meetings, shared chats, members ----------
  const TABS=[['Chat',I.chat],['Tasks',I.tasks],['Pages',I.page],['Team brain',I.brain],['Standards',I.rule],['Meetings',I.meet],['Shared chats',I.share],['Members',I.people]];
  function hub(t){
    if(!me) return welcome(); if(!space) return firstRun();
    if(t) tab=t; if(!TABS.some(x=>x[0]===tab)) tab='Chat'; store('cc_team_tab',tab);
    const b=open(space.name,'tmHub','hub'); h1.appendChild(el('span','tm-h1sub','Team space · '+seatsText()));
    const tabs=el('div','tabs tm-tabs'); TABS.forEach(([n,ic])=>{ const x=el('button',n===tab?'on':null); x.innerHTML=SV(ic); x.append(' '+n); x.onclick=()=>hub(n); tabs.appendChild(x); }); b.appendChild(tabs);
    const box=el('div'); b.appendChild(box);
    const R={Chat:pChat,Tasks:pTasks,Pages:pPages,'Team brain':pBrain,Standards:pRules,Meetings:pMeetings,'Shared chats':pShared,Members:pMembers}[tab];
    Promise.resolve(R(box)).catch(e=>{ box.appendChild(el('div','tm-empty',e.message||'Could not load this.')); });
  }
  async function pChat(box){
    const c=el('div','tm-chat'), log=el('div','tm-log'); c.appendChild(log); box.appendChild(c);
    let last=0; const seen=new Set();
    const add=(m)=>{ const d=m.data, row=el('div','tm-msg'+(d.ai?' ai':''));
      if(d.ai){ const a=el('img','tm-aiav'); a.src='/icon-192.png'; a.alt=''; row.appendChild(a); } else row.appendChild(avatar(d.byName,true));
      const t=el('div','grow'), w=el('div','who',d.ai?'CodeConClave AI':(d.byName||'')); w.appendChild(el('span',null,ago(d.at||m.updated))); t.append(w,el('div','txt',d.text)); row.appendChild(t); log.appendChild(row); };
    const pull=async()=>{ try{ const got=(await items('message',last)).reverse(); for(const m of got){ last=Math.max(last,m.updated); if(seen.has(m.id)) continue; seen.add(m.id); log.querySelector('.tm-empty')?.remove(); add(m); }
      if(got.length){ log.scrollTop=log.scrollHeight; markSeen(last); } }catch{} };
    log.appendChild(el('div','tm-empty','This is the start of '+space.name+'’s chat.\nType @CodeConClave to ask the AI — it knows your team brain and standards.'));
    await pull(); markSeen(last);
    const comp=el('div','tm-comp'), ta=document.createElement('textarea'); ta.rows=1; ta.placeholder='Message '+space.name+' — type @CodeConClave to ask the AI';
    ta.oninput=()=>{ ta.style.height='auto'; ta.style.height=Math.min(160,ta.scrollHeight)+'px'; };
    const send=async()=>{ const text=ta.value.trim(); if(!text) return; ta.value=''; ta.oninput(); if(/@(codeconclave|cc|ai)\b/i.test(text)) toast('CodeConClave is thinking…');
      try{ await api('/api/spaces/'+space.id+'/channel',{method:'POST',body:{text}}); await pull(); }catch(e){ toast(e.message); ta.value=text; } };
    ta.onkeydown=(e)=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } };
    const sb=el('button','tm-send'); sb.title='Send'; sb.innerHTML=SV(I.send); sb.onclick=send; comp.append(ta,sb); c.appendChild(comp);
    if(!canWrite()){ ta.disabled=true; ta.placeholder='Guests can read the chat'; }
    poll=setInterval(()=>{ if(!document.body.contains(log)||!pg.classList.contains('open')) return clearInterval(poll); pull(); },4000);
    setTimeout(()=>ta.focus(),50);
  }
  function aiCard(title,text){ const c=el('div','tm-card'); c.style.marginBottom='14px'; c.appendChild(el('b',null,title)); const t=el('div',null,text); t.style.cssText='white-space:pre-wrap;margin-top:8px;line-height:1.6'; c.appendChild(t); return c; }
  async function pTasks(box){
    const out=el('div');
    const job=(label,path,title)=>btn(label,async()=>{ out.innerHTML=''; out.appendChild(el('div','tm-muted','Writing the '+title.toLowerCase()+'…')); try{ const d=await api('/api/spaces/'+space.id+'/ai/'+path,{method:'POST',body:{}}); out.innerHTML=''; out.appendChild(aiCard(title,d.text)); }catch(e){ out.textContent=e.message; } },'mskip tm-sm');
    acts.append(job('📋 Standup','standup','Standup'),job('🚀 Release notes','release-notes','Release notes'));
    const COLS=[['todo','To do'],['doing','Doing'],['done','Done']], kan=el('div','tm-kan');
    if(canWrite()){ const bar=el('div','tm-bar'), inp=el('input','tm-in'); inp.placeholder='Add a task and press Enter'; inp.maxLength=300;
      const add=async()=>{ const title=inp.value.trim(); if(!title) return; inp.value=''; try{ await putItem('task',nid(),{title,status:'todo'}); draw(); }catch(e){ toast(e.message); } };
      inp.onkeydown=(e)=>{ if(e.key==='Enter') add(); }; bar.append(inp,btn(SV(I.plus)+' Add',add,'msend')); box.appendChild(bar); }
    box.append(out,kan); out.style.marginBottom='12px';
    async function draw(){ const all=await items('task'); kan.innerHTML='';
      COLS.forEach(([k,name],ci)=>{ const mine=all.filter(x=>(x.data.status||'todo')===k), col=el('div','tm-col'), h=el('h4'); h.append(el('span',null,name),el('span',null,String(mine.length))); col.appendChild(h);
        if(!mine.length) col.appendChild(el('div','tm-muted tm-small',ci===0?'Nothing to do yet.':ci===1?'Nothing in progress.':'Nothing finished yet.'));
        mine.forEach(x=>{ const d=x.data, c=el('div','tm-task'); c.appendChild(el('div','t',d.title));
          const meta=[d.assigneeName?'👤 '+d.assigneeName:'',d.estimate?'⏱ '+d.estimate:'',d.risk?'risk '+d.risk:''].filter(Boolean).join(' · '); c.appendChild(el('div','m',meta||'added by '+(d.byName||'')+' · '+ago(d.at||x.updated)));
          if(d.steps?.length){ const ul=el('ul'); d.steps.forEach(s=>ul.appendChild(el('li',null,s))); c.appendChild(ul); }
          if(canWrite()){ const a=el('div','acts');
            if(ci>0) a.appendChild(btn('←',async()=>{ await putItem('task',x.id,{...d,status:COLS[ci-1][0]}); draw(); },'mskip tm-sm'));
            if(ci<2) a.appendChild(btn('→',async()=>{ await putItem('task',x.id,{...d,status:COLS[ci+1][0]}); draw(); },'mskip tm-sm'));
            const who=document.createElement('select'); who.appendChild(new Option('Assign…','')); (data.members||[]).forEach(m=>who.appendChild(new Option(m.name||m.email,m.name||m.email))); who.value=d.assigneeName||'';
            who.onchange=async()=>{ await putItem('task',x.id,{...d,assigneeName:who.value}); draw(); }; a.appendChild(who);
            const pb=btn('✨ Plan',async()=>{ pb.textContent='Planning…'; try{ const p=await api('/api/spaces/'+space.id+'/ai/plan-task',{method:'POST',body:{title:d.title,detail:d.detail||''}}); await putItem('task',x.id,{...d,steps:p.steps,acceptance:p.acceptance,risk:p.risk,estimate:p.estimate}); draw(); }catch(e){ toast(e.message); pb.textContent='✨ Plan'; } },'mskip tm-sm'); a.appendChild(pb);
            a.appendChild(btn('✕',async()=>{ try{ await delItem('task',x.id); draw(); }catch(e){ toast(e.message); } },'mskip tm-sm')); c.appendChild(a); }
          col.appendChild(c); });
        kan.appendChild(col); }); }
    await draw();
  }
  async function pPages(box){
    const wrap=el('div','tm-pages'), left=el('div','tm-plist'), right=el('div'); wrap.append(left,right); box.appendChild(wrap); let cur=null;
    if(canWrite()) acts.appendChild(btn(SV(I.plus)+' New page',()=>openPage({id:nid(),data:{title:'Untitled',body:'',comments:[]}},true),'msend tm-sm'));
    async function drawList(){ left.innerHTML=''; const all=await items('page'); if(!all.length) left.appendChild(el('div','tm-muted tm-small','No pages yet.'+(canWrite()?' Press “New page”.':'')));
      all.forEach(p=>{ const b=el('button',cur&&cur.id===p.id?'on':null,'📄 '+(p.data.title||'Untitled')); b.onclick=()=>openPage(p); left.appendChild(b); }); if(!cur&&all[0]) openPage(all[0]); }
    function openPage(p,fresh){ cur=p; right.innerHTML=''; const d={comments:[],...p.data}; let saved=!fresh;
      const title=el('input','tm-ptitle'); title.value=d.title||''; title.maxLength=200; const ed=el('textarea','tm-ta'); ed.value=d.body||''; ed.style.minHeight='340px'; ed.placeholder='Write in Markdown — # headings, - lists…';
      if(!canWrite()){ title.readOnly=true; ed.readOnly=true; }
      const bar=el('div','tm-bar'), hist=el('div');
      const save=async()=>{ try{ await putItem('page',p.id,{...d,title:title.value.trim()||'Untitled',body:ed.value}); toast('Saved ✅'); saved=true; cur={...p,data:{...d,title:title.value,body:ed.value}}; drawList(); }catch(e){ toast(e.message); } };
      const wb=btn('✨ Write with AI',async()=>{ const what=await askText('What should the page be about?','e.g. How we onboard a new developer',title.value==='Untitled'?'':title.value); if(!what) return; wb.textContent='Writing…';
        try{ const r=await api('/api/spaces/'+space.id+'/ai/write-page',{method:'POST',body:{prompt:what}}); ed.value=r.body; if(!title.value||title.value==='Untitled') title.value=what.slice(0,80); toast('Written — press Save to keep it.'); }catch(e){ toast(e.message); } wb.textContent='✨ Write with AI'; });
      if(canWrite()) bar.append(btn('Save',save,'msend'),wb);
      bar.append(btn('History ('+(d.history||[]).length+')',()=>{ hist.innerHTML=''; (d.history||[]).forEach(v=>{ const r=el('div','tm-row'), g=el('div','grow'); g.appendChild(el('b',null,v.title)); g.appendChild(el('div','tm-muted tm-small',ago(v.at)+' · '+(v.byName||''))); r.appendChild(g);
        if(canWrite()) r.appendChild(btn('Restore',()=>{ title.value=v.title; ed.value=v.body; toast('Restored — press Save to keep it.'); },'mskip tm-sm')); hist.appendChild(r); }); if(!(d.history||[]).length) toast('No earlier versions yet.'); }),
        btn(SV(I.link)+' Share link',()=>{ if(!saved) return toast('Save the page first.'); shareModal('page',p.id,title.value||'Untitled'); }));
      if(canWrite()) bar.appendChild(btn('Delete',async()=>{ if(!(await askYes('Delete “'+(title.value||'Untitled')+'”?','Delete'))) return; try{ await delItem('page',p.id); cur=null; right.innerHTML=''; drawList(); }catch(e){ toast(e.message); } }));
      const com=el('div','tm-card'); com.style.marginTop='14px'; com.appendChild(el('b',null,'Comments'));
      (d.comments||[]).forEach(c=>{ const r=el('div'); r.style.margin='10px 0'; r.appendChild(el('div','tm-muted tm-small',c.byName+' · '+ago(c.at))); r.appendChild(el('div',null,c.text)); com.appendChild(r); });
      if(canWrite()){ const ci=el('input','tm-in'); ci.placeholder='Add a comment and press Enter'; ci.style.marginTop='10px';
        ci.onkeydown=async(e)=>{ if(e.key!=='Enter'||!ci.value.trim()) return; d.comments=[...(d.comments||[]),{byName:myName(),text:ci.value.trim().slice(0,1000),at:Date.now()}]; ci.value='';
          try{ await putItem('page',p.id,{...d,title:title.value,body:ed.value}); openPage({...p,data:{...d,editedAt:Date.now()}}); }catch(err){ toast(err.message); } }; com.appendChild(ci); }
      right.append(title,ed,bar,hist,com); if(fresh) title.select(); }
    await drawList();
  }
  async function pBrain(box){
    box.appendChild(el('div','tm-muted','The team brain — notes, docs and files everyone shares. Ask anything and CodeConClave answers from them, with sources. Your own AI chats on this page use it too.'));
    const bar=el('div','tm-bar'), ask=el('input','tm-in'); ask.placeholder='Ask the team brain… e.g. How do we deploy?'; const ans=el('div');
    const go=async()=>{ const q=ask.value.trim(); if(!q) return; ans.innerHTML=''; ans.appendChild(el('div','tm-muted','Looking through your knowledge…'));
      try{ const d=await api('/api/spaces/'+space.id+'/ask',{method:'POST',body:{question:q}}); ans.innerHTML=''; const c=aiCard('Answer',d.answer); if(d.sources?.length){ const s=el('div','tm-src'); d.sources.forEach(x=>s.appendChild(el('span',null,'['+x.n+'] '+x.title))); c.appendChild(s); } ans.appendChild(c); }catch(e){ ans.textContent=e.message; } };
    ask.onkeydown=(e)=>{ if(e.key==='Enter') go(); }; bar.append(ask,btn('Ask',go,'msend')); box.append(bar,ans);
    if(canWrite()){ box.appendChild(el('div','tm-sec','Add knowledge'));
      const card=el('div','tm-card'), ti=el('input','tm-in'); ti.placeholder='Title, e.g. How we deploy'; ti.maxLength=200; const tx=el('textarea','tm-ta'); tx.placeholder='Paste the text, or pick a file'; tx.style.marginTop='10px';
      const file=document.createElement('input'); file.type='file'; file.accept='.txt,.md,.csv,.json,.html,.js,.ts,.py'; file.style.maxWidth='240px';
      file.onchange=async()=>{ const f=file.files[0]; if(!f) return; try{ tx.value=(await f.text()).slice(0,100000); if(!ti.value) ti.value=f.name; }catch{ toast('Could not read that file.'); } };
      const r=el('div','tm-bar'); r.style.marginBottom='0'; r.append(file,btn('Save to the brain',async()=>{ if(!ti.value.trim()||!tx.value.trim()) return toast('Add a title and some text.');
        try{ await putItem('knowledge',nid(),{title:ti.value.trim(),body:tx.value}); ti.value=''; tx.value=''; file.value=''; drawK(); toast('Added — everyone can ask about it now.'); }catch(e){ toast(e.message); } },'msend'));
      card.append(ti,tx,r); box.appendChild(card); }
    box.appendChild(el('div','tm-sec','In the brain')); const kl=el('div','tm-grid'); box.appendChild(kl);
    async function drawK(){ kl.innerHTML=''; const all=await items('knowledge'); if(!all.length) kl.appendChild(el('div','tm-muted','Nothing yet.'));
      all.forEach(k=>{ const c=el('div','tm-card'); c.appendChild(el('b',null,k.data.title)); c.appendChild(el('div','tm-clip',(k.data.body||'').slice(0,200))); c.appendChild(el('div','tm-muted tm-small','by '+(k.data.byName||'')+' · '+ago(k.updated))).style.marginTop='8px';
        if(isAdmin()||same(k.authorId,me.id)) c.appendChild(btn('Delete',async()=>{ try{ await delItem('knowledge',k.id); drawK(); }catch(e){ toast(e.message); } },'mskip tm-sm')).style.marginTop='10px'; kl.appendChild(c); }); }
    await drawK();
  }
  async function pRules(box){
    box.appendChild(el('div','tm-muted','Team standards — naming, libraries, testing, what to avoid, how to review. CodeConClave follows them for everyone in the team: in the team chat and in each person’s own AI chats here. Only admins can change them.'));
    if(isAdmin()){ const bar=el('div','tm-bar'), inp=el('input','tm-in'); inp.placeholder='e.g. Every API change needs a test and a docs update'; inp.maxLength=300;
      const add=async()=>{ if(!inp.value.trim()) return; try{ await putItem('rule',nid(),{text:inp.value.trim()}); inp.value=''; draw(); }catch(e){ toast(e.message); } };
      inp.onkeydown=(e)=>{ if(e.key==='Enter') add(); }; bar.append(inp,btn(SV(I.plus)+' Add rule',add,'msend')); box.appendChild(bar); }
    const lst=el('div'); lst.style.marginTop='12px'; box.appendChild(lst);
    async function draw(){ lst.innerHTML=''; const rules=await items('rule'); if(!rules.length) lst.appendChild(el('div','tm-empty','No standards yet.'));
      rules.forEach(r=>{ const row=el('div','tm-row'); row.insertAdjacentHTML('beforeend',SV(I.rule)); row.appendChild(el('div','grow',r.data.text)); if(isAdmin()) row.appendChild(btn('Delete',async()=>{ await delItem('rule',r.id); draw(); },'mskip tm-sm')); lst.appendChild(row); }); }
    await draw();
  }
  async function pMeetings(box){
    box.appendChild(el('div','tm-muted','Paste the meeting notes or transcript. CodeConClave writes the summary, the decisions and the action items — and every action item becomes a task on the board.'));
    const out=el('div');
    if(canWrite()){ const ta=el('textarea','tm-ta'); ta.style.marginTop='14px'; ta.placeholder='Paste the meeting notes or transcript…'; const bar=el('div','tm-bar');
      const go=btn('✨ Summarize + make tasks',async()=>{ if(ta.value.trim().length<40) return toast('Paste the notes first.'); go.textContent='Working…'; go.disabled=true;
        try{ await api('/api/spaces/'+space.id+'/ai/meeting',{method:'POST',body:{transcript:ta.value}}); ta.value=''; toast('Done — the action items are on the Tasks board.'); draw(); }catch(e){ toast(e.message); } go.textContent='✨ Summarize + make tasks'; go.disabled=false; },'msend');
      bar.appendChild(go); box.append(ta,bar); }
    box.appendChild(out);
    async function draw(){ out.innerHTML=''; const all=await items('meeting'); if(all.length) out.appendChild(el('div','tm-sec','Meetings'));
      all.forEach(m=>{ const c=aiCard(m.data.title||'Meeting',m.data.summary||''); c.insertBefore(el('div','tm-muted tm-small',ago(m.updated)+' · '+(m.data.byName||'')),c.children[1]);
        if(m.data.decisions?.length){ c.appendChild(el('div','tm-sec','Decisions')); const ul=el('ul'); m.data.decisions.forEach(x=>ul.appendChild(el('li',null,x))); c.appendChild(ul); }
        if(m.data.actions?.length){ c.appendChild(el('div','tm-sec','Action items')); const ul=el('ul'); m.data.actions.forEach(x=>ul.appendChild(el('li',null,x))); c.appendChild(ul); }
        out.appendChild(c); }); }
    await draw();
  }
  // AI chats teammates shared with the team (press Share at the top of any chat)
  async function pShared(box){
    box.appendChild(el('div','tm-muted','AI chats your teammates shared with the team. Open one to read it, carry it on in your own chats, or make a link. To share yours, press Share at the top of a chat.'));
    const g=el('div','tm-grid'); g.style.marginTop='16px'; box.appendChild(g);
    const all=await items('aichat'); if(!all.length) g.appendChild(el('div','tm-empty','Nothing shared yet.'));
    all.forEach(c=>{ const d=c.data, k=el('div','tm-card tm-click'); k.appendChild(el('b',null,d.title||'AI chat')); k.appendChild(el('div','tm-muted tm-small',(d.messages?.length||0)+' messages · '+(d.byName||'')+' · '+ago(c.updated))).style.marginTop='4px';
      const first=(d.messages||[]).find(m=>m.role==='user'); if(first) k.appendChild(el('div','tm-clip',String(first.content).slice(0,200))); k.onclick=()=>viewChat(c,()=>hub('Shared chats')); g.appendChild(k); });
  }
  function viewChat(c,after){ const d=c.data; modal((b,close)=>{
    b.appendChild(el('div','tm-mt',d.title||'AI chat')); b.appendChild(el('div','tm-muted tm-small','Shared by '+(d.byName||'a teammate')+' · '+ago(c.updated)));
    const log=el('div','tm-log'); (d.messages||[]).forEach(m=>{ const row=el('div','tm-msg'+(m.role==='user'?'':' ai'));
      if(m.role==='user') row.appendChild(avatar(d.byName,true)); else { const a=el('img','tm-aiav'); a.src='/icon-192.png'; a.alt=''; row.appendChild(a); }
      const t=el('div','grow'); t.append(el('div','who',m.role==='user'?(d.byName||'Teammate'):'CodeConClave AI'),el('div','txt',m.content)); row.appendChild(t); log.appendChild(row); }); b.appendChild(log);
    const r=el('div','tm-right');
    if(isAdmin()||same(c.authorId,me.id)) r.appendChild(btn('Remove',async()=>{ if(!(await askYes('Remove this chat from the team? Its links stop working.','Remove'))) return; try{ await delItem('aichat',c.id); close(); after&&after(); }catch(e){ toast(e.message); } }));
    if(canWrite()) r.appendChild(btn(SV(I.link)+' Get link',()=>{ close(); shareModal('chat',c.id,d.title||'AI chat'); }));
    r.appendChild(btn('Continue in my chats',()=>{ close(); A.openChat(d.title,(d.messages||[]).map(m=>({role:m.role==='user'?'user':'assistant',content:m.content}))); toast('Copied into your chats — carry on.'); },'msend'));
    b.appendChild(r); },true); }
  async function pMembers(box){
    if(isAdmin()) box.appendChild(inviteCard());
    box.appendChild(el('div','tm-sec',seatsText()));
    (data.members||[]).forEach(m=>{ const row=el('div','tm-row'); row.appendChild(avatar(m.name||m.email,true)); const g=el('div','grow'); g.appendChild(el('b',null,(m.name||m.email)+(same(m.id,me.id)?' (you)':''))); g.appendChild(el('div','tm-muted tm-small',(m.email||'')+(m.joined?' · joined '+ago(m.joined):''))); row.appendChild(g);
      if(isAdmin()&&m.role!=='owner'&&!same(m.id,me.id)){ const sel=el('select','tm-sel'); sel.style.width='auto'; ['admin','member','guest'].forEach(r=>sel.appendChild(new Option(r[0].toUpperCase()+r.slice(1),r))); sel.value=m.role;
        sel.onchange=async()=>{ try{ await api('/api/spaces/'+space.id+'/members/'+m.id,{method:'PATCH',body:{role:sel.value}}); toast('Role changed'); }catch(e){ toast(e.message); } }; row.appendChild(sel);
        row.appendChild(btn('Remove',async()=>{ if(!(await askYes('Remove '+(m.name||m.email)+' from '+space.name+'?','Remove'))) return; try{ await api('/api/spaces/'+space.id+'/members/'+m.id,{method:'DELETE'}); openSpace(space.id,'Members'); }catch(e){ toast(e.message); } },'mskip tm-sm')); }
      else row.appendChild(el('span','tm-role',m.role));
      if(same(m.id,me.id)&&m.role!=='owner') row.appendChild(btn('Leave',async()=>{ if(!(await askYes('Leave '+space.name+'?','Leave'))) return; try{ await api('/api/spaces/'+space.id+'/members/'+m.id,{method:'DELETE'}); store('cc_team_cur',null); openSpace(null,'Chat'); }catch(e){ toast(e.message); } },'mskip tm-sm'));
      box.appendChild(row); });
    if(space.kind==='team'&&data.myRole==='owner'){ box.appendChild(el('div','tm-sec','Danger zone')); const r=el('div','tm-row'); const g=el('div','grow'); g.appendChild(el('b',null,'Delete this team')); g.appendChild(el('div','tm-muted tm-small','Removes its chat, tasks, pages, brain, shared chats and every share link. This cannot be undone.')); r.appendChild(g);
      r.appendChild(btn('Delete team',async()=>{ const n=await askText('Type the team name to delete it',space.name); if(n!==space.name){ if(n) toast('The name did not match — nothing was deleted.'); return; } try{ await api('/api/spaces/'+space.id,{method:'DELETE'}); store('cc_team_cur',null); toast('Team deleted.'); openSpace(null,'Chat'); }catch(e){ toast(e.message); } },'mskip tm-sm')); box.appendChild(r); }
  }
  function inviteCard(){
    const c=el('div','tm-card'); c.appendChild(el('b',null,'Invite people')); c.appendChild(el('div','tm-muted tm-small','Make a link and send it to them — it works for 14 days.'+(data.seats?' A team holds up to '+data.seats+' people ('+(data.members||[]).length+' now).':''))).style.margin='4px 0 10px';
    const r=el('div','tm-bar'); r.style.margin='0'; const role=el('select','tm-sel'); role.style.width='auto'; [['member','Member'],['admin','Admin'],['guest','Guest (read only)']].forEach(([v,n])=>role.appendChild(new Option(n,v)));
    const lk=el('input','tm-in'); lk.readOnly=true; lk.placeholder='Press “Make invite link”'; lk.onclick=()=>lk.select();
    r.append(role,btn('Make invite link',async()=>{ try{ const d=await api('/api/spaces/'+space.id+'/invites',{method:'POST',body:{role:role.value}}); lk.value=location.origin+'/team?join='+d.token; lk.select(); try{ await navigator.clipboard.writeText(lk.value); toast('Invite link copied'); }catch{} }catch(e){ toast(e.message); } },'msend'),lk);
    c.appendChild(r); return c; }
  function invite(){ if(!space) return firstRun(); modal((b,close)=>{ b.appendChild(el('div','tm-mt','Invite people to '+space.name)); b.appendChild(inviteCard()); const r=el('div','tm-right'); r.appendChild(btn('Done',close,'msend')); b.appendChild(r); },true); }

  // ---------- share space: private or public links to the team's work ----------
  function visSeg(init){ let v=init; const s=el('div','tm-seg');
    const opt=(val,ic,t,sub)=>{ const b=el('button',val===v?'on':null); b.type='button'; b.innerHTML=SV(ic); const x=el('div'); x.append(el('b',null,t),el('span',null,sub)); b.appendChild(x); b.onclick=()=>{ v=val; s.querySelectorAll('button').forEach(y=>y.classList.toggle('on',y===b)); }; s.appendChild(b); };
    opt('private',I.lock,'Private','Only members of '+space.name+' can open it'); opt('public',I.globe,'Public','Anyone with the link can view it — read only');
    return {el:s,value:()=>v}; }
  function showLink(out,d){ out.innerHTML=''; const url=location.origin+d.url, bx=el('div','tm-link');
    const t=el('div','tm-small'); t.innerHTML=SV(d.visibility==='public'?I.globe:I.lock); t.append(' '+(d.visibility==='public'?'Public link — anyone with it can view (read only)':'Private link — only members of '+space.name+' can open it')); bx.appendChild(t);
    const r=el('div','tm-bar'); r.style.margin='8px 0 0'; const i=el('input','tm-in'); i.readOnly=true; i.value=url; i.onclick=()=>i.select();
    r.append(i,btn('Copy',async()=>{ try{ await navigator.clipboard.writeText(url); toast('Link copied'); }catch{ i.select(); toast('Press Ctrl+C to copy'); } },'msend'),btn('Open',()=>window.open(url,'_blank','noopener')));
    bx.appendChild(r); out.appendChild(bx); navigator.clipboard?.writeText(url).then(()=>toast('Link copied'),()=>{}); }
  function shareModal(what,ref,title){ if(!canWrite()) return toast('Guests can view the team but cannot make links.');
    modal((b,close)=>{ b.appendChild(el('div','tm-mt','Share “'+title+'”')); b.appendChild(el('div','tm-muted tm-small','Make a link to it. You can turn it off any time under Share space.'));
      const seg=visSeg('private'), out=el('div'); b.append(seg.el,out); const r=el('div','tm-right');
      const go=btn('Make link',async()=>{ go.disabled=true; try{ const d=await api('/api/spaces/'+space.id+'/shares',{method:'POST',body:{what,ref,title,visibility:seg.value()}}); showLink(out,d); go.remove(); seg.el.remove(); }catch(e){ toast(e.message); go.disabled=false; } },'msend');
      r.append(btn('Close',close),go); b.appendChild(r); }); }
  const WHAT={space:'Whole team space',tasks:'Tasks board',page:'Page',chat:'AI chat'};
  async function shares(){
    if(!me) return welcome(); if(!space) return firstRun();
    const b=open('Share space','tmShare','shares'); h1.appendChild(el('span','tm-h1sub',space.name));
    b.appendChild(el('div','tm-muted','Share your team’s work with a link. Private links open only for members of '+space.name+'. Public links let anyone with the link view the work — read only, no account needed. A link shows pages, the tasks board and shared AI chats — never the team chat, the brain, the standards or the member list.'));
    if(canWrite()){ const card=el('div','tm-card'); card.style.marginTop='16px'; card.appendChild(el('b',null,'Make a link'));
      const what=el('select','tm-sel'); what.style.marginTop='10px'; [['space','The whole team space — pages, tasks and shared chats'],['tasks','The tasks board'],['page','One page…'],['chat','One shared AI chat…']].forEach(([v,n])=>what.appendChild(new Option(n,v)));
      const ref=el('select','tm-sel'); ref.style.marginTop='8px'; ref.hidden=true;
      what.onchange=async()=>{ ref.innerHTML=''; ref.hidden=!['page','chat'].includes(what.value); if(ref.hidden) return;
        try{ const got=await items(what.value==='page'?'page':'aichat'); if(!got.length) ref.appendChild(new Option(what.value==='page'?'No pages yet — make one in Team space → Pages':'No shared chats yet — press Share at the top of a chat',''));
          got.forEach(x=>ref.appendChild(new Option(x.data.title||'Untitled',x.id))); }catch(e){ toast(e.message); } };
      const seg=visSeg('private'), out=el('div'), r=el('div','tm-right');
      const go=btn(SV(I.link)+' Make link',async()=>{ if(!ref.hidden&&!ref.value) return toast('Pick one first.'); go.disabled=true;
        try{ const d=await api('/api/spaces/'+space.id+'/shares',{method:'POST',body:{what:what.value,ref:ref.hidden?'':ref.value,title:ref.hidden?'':(ref.options[ref.selectedIndex]?.text||''),visibility:seg.value()}}); showLink(out,d); drawList(); }catch(e){ toast(e.message); } go.disabled=false; },'msend');
      r.appendChild(go); card.append(what,ref,seg.el,r,out); b.appendChild(card); }
    b.appendChild(el('div','tm-sec','Links')); const lst=el('div'); b.appendChild(lst);
    async function drawList(){ lst.innerHTML=''; let all=[]; try{ all=await items('share'); }catch(e){ lst.textContent=e.message; return; }
      if(!all.length) lst.appendChild(el('div','tm-empty','No links yet.'));
      all.forEach(x=>{ const d=x.data, row=el('div','tm-row'); row.insertAdjacentHTML('beforeend',SV(d.visibility==='public'?I.globe:I.lock));
        const g=el('div','grow'); g.appendChild(el('b',null,d.title||WHAT[d.what])); g.appendChild(el('div','tm-muted tm-small',WHAT[d.what]+' · by '+(d.byName||'')+' · '+ago(d.at||x.updated)+(d.visibility==='public'?' · '+(Number(d.views)||0)+' view'+(Number(d.views)===1?'':'s'):''))); row.appendChild(g);
        const vis=el('span','tm-vis '+(d.visibility==='public'?'pub':'pri')); vis.innerHTML=SV(d.visibility==='public'?I.globe:I.lock); vis.append(d.visibility==='public'?'Public':'Private'); row.appendChild(vis);
        const url=location.origin+'/s/'+d.token;
        row.appendChild(btn('Copy',async()=>{ try{ await navigator.clipboard.writeText(url); toast('Link copied'); }catch{ toast(url); } },'mskip tm-sm'));
        row.appendChild(btn('Open',()=>window.open(url,'_blank','noopener'),'mskip tm-sm'));
        if(isAdmin()||same(x.authorId,me.id)){
          row.appendChild(btn(d.visibility==='public'?'Make private':'Make public',async()=>{ try{ await api('/api/spaces/'+space.id+'/shares/'+x.id,{method:'PATCH',body:{visibility:d.visibility==='public'?'private':'public'}}); toast('Changed'); drawList(); }catch(e){ toast(e.message); } },'mskip tm-sm'));
          row.appendChild(btn('Turn off',async()=>{ if(!(await askYes('Turn this link off? Anyone who has it will not be able to open it any more.','Turn off'))) return; try{ await delItem('share',x.id); toast('Link turned off'); drawList(); }catch(e){ toast(e.message); } },'mskip tm-sm')); }
        lst.appendChild(row); }); }
    await drawList();
  }
  // Share (top bar): this AI chat -> the team's Shared chats, and a link if you want one
  const slim=(ms)=>{ let out=(ms||[]).map(m=>{ let t=String(m.content??'').replace(/^🎙 /,'').slice(0,20000);
      if(!t.trim()&&Object.keys(m).some(k=>/image|media|build|video|audio|file|art/i.test(k))) t='[a creation — pictures, videos and builds stay in the original chat]';
      return {role:m.role==='user'?'user':'ai',content:t}; }).filter(m=>m.content.trim());
    while(out.length>1&&JSON.stringify(out).length>180000) out=out.slice(1); return out; };
  function shareChat(){
    if(!me||!space) return hub(); if(!canWrite()) return toast('Guests can read the team but cannot share into it.');
    const c=A.chat(); if(!c) return toast('Start a chat first — then share it with your team.');
    const msgs=slim(c.messages); if(!msgs.length) return toast('There is nothing to share in this chat yet.');
    modal((b,close)=>{ b.appendChild(el('div','tm-mt','Share this chat with '+space.name)); b.appendChild(el('div','tm-muted tm-small','“'+(c.title||'Chat')+'” goes to Team space → Shared chats. Your teammates can read it and carry it on in their own chats.'));
      let choice='team'; const opts=el('div'); opts.style.marginTop='10px';
      [['team','Share with the team only'],['private','Share + make a private link (team members only)'],['public','Share + make a public link (anyone with the link can view)']].forEach(([v,t],i)=>{ const l=el('label','tm-opt'), r=document.createElement('input'); r.type='radio'; r.name='tmShareOpt'; r.checked=i===0; r.onchange=()=>{ choice=v; }; l.append(r,el('span',null,t)); opts.appendChild(l); });
      const out=el('div'); b.append(opts,out); const row=el('div','tm-right');
      const go=btn('Share',async()=>{ go.disabled=true; const id=(c.id+'_'+me.id).slice(0,80);
        try{ await putItem('aichat',id,{title:String(c.title||'AI chat').slice(0,120),messages:msgs}); toast('Shared with '+space.name+' ✅');
          if(choice==='team'){ close(); return; } const d=await api('/api/spaces/'+space.id+'/shares',{method:'POST',body:{what:'chat',ref:id,visibility:choice}}); showLink(out,d); opts.remove(); go.remove(); }
        catch(e){ toast(e.message); go.disabled=false; } },'msend');
      row.append(btn('Close',close),go); b.appendChild(row); }); }
})();
