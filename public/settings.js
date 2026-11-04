// CodeConClave Settings: one clean window (opened from your name, bottom-left), laid out like a desktop app's settings:
// Account, Billing, Usage | Appearance, Your CodeConClave, Capabilities, Voice, Notifications, Privacy | Customize, API keys | Desktop app.
// Everything here uses the app's real settings (the same ones the AI uses) - nothing is just for show.
(function(){
  const A=window.ccApp; if(!A||!A.prefs) return;
  const P=A.prefs;
  const $=(id)=>document.getElementById(id);
  const el=(tag,cls,text)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; };
  const SV=(d)=>'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
  const store=(k,v)=>{ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v); }catch{ return null; } };
  const api=async(url,opt={})=>{ const r=await fetch(url,{...opt,headers:{'Content-Type':'application/json'},body:opt.body&&typeof opt.body!=='string'?JSON.stringify(opt.body):opt.body}); const d=await r.json().catch(()=>({})); if(!r.ok) throw Object.assign(new Error(d.error||'Something went wrong.'),{status:r.status,data:d}); return d; };
  const inr=(n)=>'₹'+Number(n||0).toLocaleString('en-IN');
  const when=(t)=>t?new Date(t).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'';
  const I={user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',gauge:'<path d="M12 14l3-3"/><circle cx="12" cy="14" r="8"/><path d="M12 6v1"/><path d="M4 14h1"/><path d="M19 14h1"/>',
    palette:'<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/><path d="M12 21a2.5 2.5 0 0 1 0-5h1.5a2.5 2.5 0 0 0 0-5"/>',
    bot:'<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><circle cx="9" cy="14" r="1.2"/><circle cx="15" cy="14" r="1.2"/>',caps:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',bellOff:'<path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2z"/><path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16z"/>',
    note:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',shield:'<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="m9 12 2 2 4-4"/>',
    sliders:'<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/><path d="M4 18h12"/><circle cx="18" cy="18" r="2"/>',
    key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3"/><path d="m16 7 3 3"/><path d="m14 9 2 2"/>',laptop:'<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',back:'<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',arrow:'<path d="M7 17 17 7"/><path d="M8 7h9v9"/>'};
  const css=`
  .st-ov{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px}
  .st-win{width:min(980px,100%);height:min(760px,100%);background:#232323;border:1px solid #333;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.55);color:#e6e6e6}
  .st-head{display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid #2f2f2f}.st-head h2{margin:0;font-size:18px;font-weight:600;flex:1}
  .st-x{border:none;background:none;color:#b3b3b3;cursor:pointer;padding:4px;border-radius:8px;display:flex}.st-x:hover{background:#2c2c2c;color:#fff}.st-x .ico{width:22px;height:22px}
  .st-body{flex:1;display:flex;min-height:0}
  .st-nav{width:250px;flex:0 0 250px;border-right:1px solid #2f2f2f;padding:14px 12px;overflow-y:auto;display:flex;flex-direction:column}
  .st-search{display:flex;align-items:center;gap:8px;background:#1c1c1c;border:1px solid #333;border-radius:10px;padding:8px 10px;margin-bottom:12px}.st-search .ico{width:17px;height:17px;color:#8c8c8c}
  .st-search input{flex:1;min-width:0;background:none;border:none;color:#e6e6e6;font:inherit;font-size:14px;outline:none}
  .st-nav button.it{display:flex;align-items:center;gap:12px;width:100%;border:none;background:none;color:#d6d6d6;font:inherit;font-size:15px;padding:9px 12px;border-radius:10px;cursor:pointer;text-align:left}
  .st-nav button.it:hover{background:#2a2a2a}.st-nav button.it.on{background:#333;color:#fff}.st-nav button.it .ico{width:19px;height:19px;color:#b3b3b3}
  .st-sep{height:1px;background:#2f2f2f;margin:10px 14px}
  .st-foot{margin-top:auto;padding:12px 12px 2px;color:#8c8c8c;font-size:12.5px;line-height:1.5}.st-foot a{color:#b3b3b3}
  .st-main{flex:1;overflow-y:auto;padding:22px 26px 40px;min-width:0}
  .st-main h3{margin:0 0 6px;font-size:17px;font-weight:600}.st-main .st-lead{color:#8c8c8c;font-size:13.5px;margin:0 0 10px;line-height:1.55}
  .st-row{display:flex;align-items:center;gap:18px;padding:16px 0;border-bottom:1px solid #2f2f2f}.st-row:last-child{border-bottom:none}
  .st-row .tx{flex:1;min-width:0}.st-row .tx b{display:block;font-weight:500;font-size:15px}.st-row .tx span{display:block;color:#8c8c8c;font-size:13.5px;line-height:1.5;margin-top:3px}
  .st-row.col{flex-direction:column;align-items:stretch}
  .st-tog{width:44px;height:26px;border-radius:999px;background:#3a3a3a;border:none;position:relative;cursor:pointer;flex:0 0 auto;transition:background .15s}
  .st-tog::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}
  .st-tog.on{background:#1a93fe}.st-tog.on::after{left:21px}
  .st-sel,.st-in,.st-ta{background:#1c1c1c;color:#e6e6e6;border:1px solid #363636;border-radius:10px;padding:9px 12px;font:inherit;font-size:14px;outline:none}
  .st-sel{min-width:200px;max-width:260px}.st-in{width:100%}.st-ta{width:100%;min-height:96px;resize:vertical;line-height:1.5}.st-in:focus,.st-ta:focus,.st-sel:focus{border-color:#4a4a4a}
  .st-seg{display:inline-flex;background:#1c1c1c;border:1px solid #333;border-radius:10px;padding:3px;flex:0 0 auto}.st-seg button{border:none;background:none;color:#cfcfcf;font:inherit;font-size:14px;padding:6px 14px;border-radius:8px;cursor:pointer}.st-seg button.on{background:#3a3a3a;color:#fff}
  .st-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid #3a3a3a;background:none;color:#e6e6e6;font:inherit;font-size:14px;padding:8px 14px;border-radius:10px;cursor:pointer;white-space:nowrap;text-decoration:none}
  .st-btn:hover{background:#2c2c2c}.st-btn.pri{background:#e6e6e6;color:#1a1a1a;border-color:#e6e6e6}.st-btn.pri:hover{background:#fff}.st-btn.red{color:#ff8a82;border-color:#5a2a2a}.st-btn .ico{width:16px;height:16px}.st-btn:disabled{opacity:.5;cursor:default}
  .st-me{display:flex;align-items:center;gap:14px;padding:6px 0 14px}.st-av{width:52px;height:52px;border-radius:50%;background:#23998d;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:600}
  .st-me b{display:block;font-size:17px}.st-me span{color:#8c8c8c;font-size:13.5px}
  .st-pill{display:inline-block;font-size:12px;border:1px solid #3a3a3a;border-radius:999px;padding:2px 9px;color:#cfcfcf;margin-left:6px;vertical-align:2px}
  .st-bar{height:8px;background:#1a1a1a;border-radius:6px;overflow:hidden;margin-top:8px}.st-bar i{display:block;height:100%;background:#1a93fe;border-radius:6px}.st-bar.warn i{background:#f2c200}.st-bar.full i{background:#e5534b}
  .st-calc{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}.st-calc .st-in{width:140px}.st-price{font-size:22px;font-weight:600;min-width:110px}
  .st-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.st-chips button{border:1px solid #363636;background:none;color:#cfcfcf;font:inherit;font-size:13px;padding:5px 11px;border-radius:999px;cursor:pointer}.st-chips button:hover{background:#2a2a2a}
  .st-note{color:#8c8c8c;font-size:13px;line-height:1.55;margin-top:8px}.st-ok{color:#8fe0b0}.st-warn{color:#f2d36b}
  .st-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}.st-item{display:flex;align-items:center;gap:10px;background:#1c1c1c;border:1px solid #2f2f2f;border-radius:10px;padding:9px 12px;font-size:14px}.st-item .grow{flex:1;min-width:0;overflow-wrap:anywhere}.st-item small{display:block;color:#8c8c8c;font-size:12.5px}
  .st-key{font-family:ui-monospace,Consolas,monospace;font-size:13px;background:#151515;border:1px dashed #3a3a3a;border-radius:10px;padding:10px 12px;overflow-wrap:anywhere;margin-top:10px}
  .st-code{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;background:#151515;border:1px solid #2f2f2f;border-radius:10px;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:#cfcfcf;margin-top:10px}
  .st-range{width:100%;accent-color:#1a93fe;margin-top:10px}
  .st-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.st-lbl{display:block;font-size:13.5px;color:#b3b3b3;margin:12px 0 6px}
  .st-backbtn{display:none}
  @media(max-width:720px){ .st-ov{padding:0} .st-win{height:100%;border-radius:0;border:none} .st-nav{width:100%;flex:1;border-right:none} .st-main{display:none;padding:16px 16px 40px}
    .st-body.showmain .st-nav{display:none} .st-body.showmain .st-main{display:block} .st-backbtn{display:inline-flex;margin-bottom:10px}
    .st-row{flex-wrap:wrap} .st-sel{min-width:0;max-width:100%;width:100%} .st-grid2{grid-template-columns:1fr} }`;
  const stEl=document.createElement('style'); stEl.textContent=css; document.head.appendChild(stEl);

  // ---- small controls ----
  const tog=(on,fn)=>{ const b=el('button','st-tog'+(on?' on':'')); b.setAttribute('role','switch'); b.setAttribute('aria-checked',String(Boolean(on))); b.onclick=()=>{ const v=!b.classList.contains('on'); b.classList.toggle('on',v); b.setAttribute('aria-checked',String(v)); fn(v); }; return b; };
  const seg=(opts,cur,fn)=>{ const s=el('div','st-seg'); opts.forEach(([v,n])=>{ const b=el('button',v===cur?'on':null,n); b.onclick=()=>{ s.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); fn(v); }; s.appendChild(b); }); return s; };
  const sel=(opts,cur,fn)=>{ const s=el('select','st-sel'); opts.forEach(([v,n])=>s.appendChild(new Option(n,v))); s.value=cur; s.onchange=()=>fn(s.value); return s; };
  const button=(label,fn,cls='')=>{ const b=el('button','st-btn '+cls); b.innerHTML=label; b.onclick=fn; return b; };
  const linkBtn=(label,href)=>{ const a=el('a','st-btn'); a.href=href; a.innerHTML=label; if(/^https?:/.test(href)){ a.target='_blank'; a.rel='noopener noreferrer'; } return a; };
  function row(box,title,desc,ctrl){ const r=el('div','st-row'), t=el('div','tx'); t.appendChild(el('b',null,title)); if(desc) t.appendChild(el('span',null,desc)); r.appendChild(t); if(ctrl) r.appendChild(ctrl); box.appendChild(r); return r; }
  const toast=(m)=>A.toast(m);

  // ---- the sections ----
  const NAV=[
    ['account','Account',I.user,'name email sign out plan'],['billing','Billing',I.card,'plan payment bills customize'],['usage','Usage',I.gauge,'limit credits 5-hour weekly buy'],null,
    ['appearance','Appearance',I.palette,'text size panel'],['you','Your CodeConClave',I.bot,'nickname language about instructions personalization'],['caps','Capabilities',I.caps,'memory live remote plugins skills'],
    ['voice','Voice',I.mic,'voice live language lock'],['notif','Notifications',I.note,'sound guitar notifications'],['privacy','Privacy',I.shield,'incognito export delete memory folder'],['rules','Rules',I.shield,'rules honest safety ask before'],null,
    ['customize','Customize',I.sliders,'skills plugins automations library creations'],['keys','API keys',I.key,'api developer key prepaid'],null,['desktop','Desktop app',I.laptop,'windows download install open apps']];
  let ov=null, cur='account';
  function open(section){
    if(ov) ov.remove(); cur=section||cur;
    ov=el('div','st-ov'); const w=el('div','st-win'); ov.appendChild(w);
    ov.onclick=(e)=>{ if(e.target===ov) close(); };
    const head=el('div','st-head'); head.appendChild(el('h2',null,'Settings')); const x=el('button','st-x'); x.title='Close'; x.innerHTML=SV(I.x); x.onclick=close; head.appendChild(x); w.appendChild(head);
    const body=el('div','st-body'), nav=el('div','st-nav'), main=el('div','st-main'); body.append(nav,main); w.appendChild(body);
    const sw=el('div','st-search'); sw.innerHTML=SV(I.search); const si=el('input'); si.placeholder='Search'; sw.appendChild(si); nav.appendChild(sw);
    const items=[];
    NAV.forEach((n)=>{ if(!n){ nav.appendChild(el('div','st-sep')); return; } const [id,name,ic,kw]=n;
      const b=el('button','it'+(id===cur?' on':'')); b.innerHTML=SV(ic); b.append(name); b.dataset.kw=(name+' '+kw).toLowerCase(); b.onclick=()=>{ cur=id; nav.querySelectorAll('.it').forEach(y=>y.classList.toggle('on',y===b)); draw(main); body.classList.add('showmain'); }; nav.appendChild(b); items.push(b); });
    si.oninput=()=>{ const q=si.value.trim().toLowerCase(); items.forEach(b=>{ b.style.display=!q||b.dataset.kw.includes(q)?'':'none'; }); };
    const foot=el('div','st-foot'); foot.innerHTML='Support &amp; collaboration:<br><a href="mailto:medidisaharsh@gmail.com">medidisaharsh@gmail.com</a>'; nav.appendChild(foot);
    document.body.appendChild(ov); draw(main);
    if(section && matchMedia('(max-width:720px)').matches) body.classList.add('showmain');
    document.addEventListener('keydown',esc);
  }
  function esc(e){ if(e.key==='Escape'&&!document.querySelector('.modal.open,.k-modal')) close(); }
  function close(){ if(ov){ ov.remove(); ov=null; } document.removeEventListener('keydown',esc); }
  window.ccSettings={open,close};

  function draw(main){
    main.innerHTML='';
    const bk=button(SV(I.back)+' Settings',()=>main.parentElement.classList.remove('showmain'),'st-backbtn'); main.appendChild(bk);
    const S={account,billing,usage,appearance,you,caps,voice,notif,privacy,rules,customize,keys,desktop}[cur]||account;
    Promise.resolve(S(main)).catch(e=>main.appendChild(el('div','st-note',e.message)));
  }
  const go=(id,box)=>{ cur=id; document.querySelectorAll('.st-nav .it').forEach(b=>b.classList.toggle('on',b.dataset.kw.startsWith((NAV.find(n=>n&&n[0]===id)||[])[1]?.toLowerCase()||'#'))); draw(box); };
  const H=(box,t,lead)=>{ box.appendChild(el('h3',null,t)); if(lead) box.appendChild(el('p','st-lead',lead)); };
  const planName=()=>({solo:'Solo',team:'Team',org:'Organization',custom:'Custom'})[A.plan()]||(A.solo?'Solo':/^\/team/.test(location.pathname)?'Team':'Organization');
  const needSignIn=(box,what)=>{ row(box,'Sign in first',what,button('Sign in',()=>{ close(); A.signIn(false); },'pri')); };

  function account(box){
    H(box,'Account');
    if(!A.me){ row(box,'You are using CodeConClave as a guest','Create a free account to keep your chats, memory and settings on every device.',button('Sign in',()=>{ close(); A.signIn(false); },'pri')); return; }
    const me=A.me, n=me.name||me.email||'You', top=el('div','st-me'); const av=el('div','st-av',n.charAt(0).toUpperCase()); const t=el('div'); const b=el('b',null,n); const pill=el('span','st-pill',planName()); b.appendChild(pill); t.append(b,el('span',null,me.email||'')); top.append(av,t); box.appendChild(top);
    row(box,'Your plan',planName()+' — the same CodeConClave AI with the settings of your plan.',linkBtn('Change plan','/?home=1'));
    row(box,'Sign out','Your chats stay safe on your account.',button(SV(I.out)+' Sign out',()=>{ close(); P.signOut(); }));
  }
  function billing(box){
    H(box,'Billing');
    row(box,'Plan',planName(),linkBtn('Customize','/customize'));
    row(box,'Payments','Free while we test. Payments (Razorpay) open when CodeConClave launches on its own domain — nothing is charged before that.');
    if(window.ccTeam?.canBills?.()) row(box,'Bills','Your '+(window.ccTeam.kind==='org'?'company':'team')+'’s monthly bills — reminders before each one is due, and pay with one tap.',button('Open bills',()=>{ close(); window.ccTeam.open('Bills'); }));
    row(box,'Extra usage','Used up your messages? Add credits and keep going — 50 credits for ₹100.',button('Add credits',()=>go('usage',box)));
    row(box,'API prepaid','Use CodeConClave AI from your own code. Prepaid from ₹20,000 to ₹1,50,000.',button('API keys',()=>go('keys',box)));
  }
  async function usage(box){
    H(box,'Usage','Your plan’s limits. Free plan: 5 messages every 8 hours — the window starts with your first message. The weekly limit starts with your first message of the week.');
    let u=A.usage(); try{ u=await (await fetch('/api/usage')).json(); }catch{}
    if(u?.unlimited) row(box,'Unlimited','You are the owner — no limits.');
    else if(u){ for(const [k,name] of [['fiveHour',((u.fiveHour&&u.fiveHour.hours)||8)+'-hour limit'],['weekly','Weekly limit']]){ const x=u[k]||{used:0,limit:1}; const p=Math.min(100,Math.round(x.used/Math.max(1,x.limit)*100));
        const r=row(box,name,x.used+' of '+x.limit+' messages used'+(x.resetsAt?' · resets '+when(x.resetsAt):'')); const bar=el('div','st-bar'+(p>=100?' full':p>=80?' warn':'')); const i=el('i'); i.style.width=p+'%'; bar.appendChild(i); r.querySelector('.tx').appendChild(bar); } }
    row(box,'Sound when my limit is back','Play the guitar sound when your messages are back.',tog(store('cc_limit_sound')!=='off',(v)=>store('cc_limit_sound',v?'on':'off')));
    // extra usage credits
    const c=el('div','st-row col'); const t=el('div','tx'); t.appendChild(el('b',null,'Extra usage credits')); t.appendChild(el('span',null,'1 credit = 1 message after your limit. 50 credits cost ₹100 (₹2 each) — pick any number from 50.')); c.appendChild(t); box.appendChild(c);
    const bal=el('div','st-note'); c.appendChild(bal);
    if(!A.me){ bal.textContent='Sign in to add credits.'; return; }
    try{ const d=await api('/api/credits'); bal.innerHTML=''; bal.append('Your credits: '); bal.appendChild(el('b',null,String(d.balance))); }catch{ bal.textContent=''; }
    const calc=el('div','st-calc'), n=el('input','st-in'); n.type='number'; n.min='50'; n.step='10'; n.value='50'; const price=el('div','st-price');
    const go=button('',buy,'pri'); const paint=()=>{ const v=Math.max(0,Math.floor(Number(n.value)||0)); price.textContent=inr(v*2); go.textContent=v>=50?'Buy '+v.toLocaleString('en-IN')+' credits · '+inr(v*2):'Pick at least 50'; go.disabled=v<50; }; n.oninput=paint; paint();
    calc.append(n,el('span','st-note','credits ='),price,go); c.appendChild(calc);
    const chips=el('div','st-chips'); [50,100,250,500,1000,5000].forEach(v=>{ const b=el('button',null,v.toLocaleString('en-IN')+' · '+inr(v*2)); b.onclick=()=>{ n.value=v; paint(); }; chips.appendChild(b); }); c.appendChild(chips);
    const msg=el('div','st-note'); c.appendChild(msg);
    async function buy(){ const v=Math.floor(Number(n.value)||0); go.disabled=true;
      try{ const d=await api('/api/credits/buy',{method:'POST',body:{credits:v}}); msg.className='st-note st-ok'; msg.textContent='Added '+v+' credits (test mode — no payment). You now have '+d.balance+'.'; bal.innerHTML=''; bal.append('Your credits: '); bal.appendChild(el('b',null,String(d.balance))); }
      catch(e){ msg.className='st-note st-warn'; msg.textContent=e.message; } paint(); }
  }
  function appearance(box){
    H(box,'Appearance');
    const z=store('cc_zoom')||'1';
    row(box,'Text size','Make everything a little smaller or bigger.',seg([['0.9','Small'],['1','Default'],['1.1','Large']],z,(v)=>{ store('cc_zoom',v); document.documentElement.style.zoom=v==='1'?'':v; }));
    row(box,'Details panel','Show usage, context and connectors on the right.',tog(P.panel(),(v)=>P.setPanel(v)));
    row(box,'Theme','CodeConClave’s dark look, with your yellow logo.');
  }
  function you(box){
    H(box,'Your CodeConClave','What CodeConClave should know about you. It uses this in every answer.');
    const p=P.profile(), f=(lbl,node)=>{ box.appendChild(el('label','st-lbl',lbl)); box.appendChild(node); return node; };
    const g=el('div','st-grid2'); const nick=el('input','st-in'); nick.maxLength=40; nick.value=p.nickname||''; nick.placeholder='Saharsh'; const job=el('input','st-in'); job.maxLength=80; job.value=p.occupation||''; job.placeholder='Student, founder…';
    const a=el('div'), b=el('div'); a.append(el('label','st-lbl','What should I call you?'),nick); b.append(el('label','st-lbl','What do you do?'),job); g.append(a,b); box.appendChild(g);
    const lang=el('select','st-sel'); const src=$('pfLang'); if(src) [...src.options].forEach(o=>lang.appendChild(new Option(o.text,o.value))); else lang.appendChild(new Option('Same as I write (automatic)','')); lang.value=p.language||''; f('Language I answer in',lang);
    const about=el('textarea','st-ta'); about.maxLength=2000; about.value=p.about||''; about.placeholder='I live in Hyderabad. I’m building an app. I like cricket.'; f('More about you',about);
    const ins=el('textarea','st-ta'); ins.maxLength=1000; ins.value=p.instructions||''; ins.placeholder='Explain simply. Use short sentences.'; f('Custom instructions',ins);
    const st=el('span','st-note'); const r=el('div','st-calc'); r.append(button('Save',async()=>{ const where=await P.saveProfile({nickname:nick.value.trim(),occupation:job.value.trim(),language:lang.value,about:about.value.trim(),instructions:ins.value.trim()}); st.className='st-note st-ok'; st.textContent=where==='account'?'Saved on your account.':'Saved on this device — sign in to keep it everywhere.'; },'pri'),st); box.appendChild(r);
  }
  function caps(box){
    H(box,'Capabilities','What CodeConClave can do for you.');
    row(box,'Memory','Remember things you tell me (your name, what you like) and use them in later chats.',tog(store('cc_memory_on')!=='off',(v)=>store('cc_memory_on',v?'on':'off')));
    const mem=P.memory(); const r=el('div','st-row col'); const t=el('div','tx'); t.appendChild(el('b',null,'What I remember about you')); t.appendChild(el('span',null,mem.length?mem.length+' things':'Nothing yet.')); r.appendChild(t);
    const l=el('div','st-list'); mem.forEach((m,i)=>{ const it=el('div','st-item'); it.appendChild(el('div','grow',m)); const x=el('button','st-x'); x.title='Forget this'; x.innerHTML=SV(I.x); x.onclick=()=>{ P.forget(i); draw(box); }; it.appendChild(x); l.appendChild(it); });
    r.appendChild(l); if(mem.length){ const cl=button('Forget everything',()=>{ if(!confirm('Forget everything I remember about you?')) return; P.clearMemory(); draw(box); },'red'); cl.style.marginTop='10px'; cl.style.alignSelf='flex-start'; r.appendChild(cl); } box.appendChild(r);
    row(box,'Live voice','Talk hands-free in any language — say what to do and it does it.',button('Start Live',()=>{ close(); A.startLive(); }));
    if(A.solo) row(box,'Remote','Use this laptop from your phone, from anywhere.',button('Open Remote',()=>{ close(); A.pages.remote(); }));
    row(box,'Plugins','Connect your apps — GitHub, Razorpay, Notion, Slack and hundreds more.',button('Open Plugins',()=>{ close(); A.pages.plugins(); }));
  }
  function voice(box){
    H(box,'Voice');
    row(box,'AI voice','How CodeConClave sounds when it reads answers and in Live.',sel([['male','Male (CodeConClave voice)'],['female','Female (CodeConClave voice)'],['standard','Standard']],P.voice(),(v)=>P.setVoice(v)));
    const live=[['auto','Any language (slower)'],['en','English'],['te','తెలుగు'],['hi','हिन्दी'],['ta','தமிழ்'],['kn','ಕನ್ನಡ'],['ml','മലയാളം'],['mr','मराठी'],['bn','বাংলা'],['gu','ગુજરાતી'],['pa','ਪੰਜਾਬੀ'],['ur','اردو'],['es','Español'],['fr','Français'],['de','Deutsch'],['ar','العربية'],['zh','中文'],['ja','日本語']];
    row(box,'Live language','The language you speak in Live. A set language listens instantly; “Any language” works out the language by itself.',sel(live,store('cc_live_lang')||'en',(v)=>store('cc_live_lang',v)));
    if(P.owner()) row(box,'Voice lock','Only listen to Saharsh and his sister (needs the laptop voice server).',tog(P.lock(),(v)=>P.setLock(v)));
  }
  function notif(box){
    H(box,'Notifications');
    row(box,'Answer sound','Play the guitar sound when an answer is ready — again every 25 s until you look.',tog(P.sound(),(v)=>P.setSound(v)));
    row(box,'Limit is back','Play the guitar sound when your messages are back.',tog(store('cc_limit_sound')!=='off',(v)=>store('cc_limit_sound',v?'on':'off')));
    const perm=(window.Notification&&Notification.permission)||'unsupported';
    row(box,'Desktop notifications',perm==='granted'?'On — you get a notification when something is ready and this tab is in the background.':perm==='denied'?'Blocked in this browser — allow them in the site settings (the lock next to the address).':'Get a notification when something is ready while this tab is in the background.',
      perm==='default'?button('Allow',async()=>{ try{ await Notification.requestPermission(); }catch{} draw(box); },'pri'):null);
  }
  function privacy(box){
    H(box,'Privacy','Your chats are kept on your account so you can use them on any device. Incognito chats are never saved.');
    if(A.solo) row(box,'Incognito chat','A chat that is not saved to your account or this device, and that I don’t remember. It disappears when you leave.',button('Start incognito',()=>{ close(); A.startIncognito(); }));
    row(box,'Memory folder on this device',P.memFolderInfo()||'Keep your memory, profile and chats as files on your phone or laptop.',button('Choose a folder',()=>P.memFolder()));
    row(box,'Export my chats','Download all your chats and memory as one file.',button('Export',()=>P.exportChats()));
    row(box,'Clear chats on this device','Removes the chats saved in this browser (your account keeps its copy).',button('Clear',()=>{ if(!confirm('Clear the chats saved in this browser?')) return; P.clearDevice(); toast('Cleared on this device.'); },'red'));
  }
  function rules(box){
    H(box,'Rules CodeConClave always follows','Strict and built in — on every message, for everyone. Nobody can switch them off, not even with a trick. Your team’s or company’s rules are added on top.');
    const own=['Your rules too','It follows your custom instructions, your team’s standards and your organization’s policies — but never against these rules.'];
    fetch('/api/rules').then(r=>r.json()).then(d=>{ if(!Array.isArray(d.rules)||!d.rules.length) throw 0; [...d.rules,own].forEach(([t,x])=>row(box,t,x)); }).catch(()=>
    [['Honest','It never makes up facts, names, numbers, prices or dates. When it is not sure, it says so and offers to look it up — and live data always shows its source.'],
     ['Asks first','Before it builds something, it asks what you want. Before anything that sends a message, spends money, books, or deletes, it asks for a clear yes.'],
     ['Never pretends','It tells you exactly what it did and what it didn’t do. It never says “sent”, “paid” or “booked” unless the app really did it.'],
     ['Money stays with you','It never moves money. Payments happen in your own UPI or bank app, after you confirm there.'],
     ['Your data is yours','Incognito chats are never saved. You can export or delete your chats any time, and API keys are kept only as a scrambled fingerprint.'],
     ['Safe and kind','No sexual content, no help with hurting anyone, no insults. It stays CodeConClave AI and never pretends to be another AI.'],
     own].forEach(([t,d])=>row(box,t,d)));
  }
  function customize(box){
    H(box,'Customize','Make CodeConClave yours.');
    row(box,'Skills','Ready-made skills — and record your own.',button('Open',()=>{ close(); A.pages.skills(); }));
    row(box,'Plugins','Connect your apps and services.',button('Open',()=>{ close(); A.pages.plugins(); }));
    row(box,'Automations','Tasks on a schedule, in India time.',button('Open',()=>{ close(); A.pages.automations(); }));
    row(box,'Library','Your files.',button('Open',()=>{ close(); A.pages.library(); }));
    row(box,'Creations','Everything CodeConClave made for you.',button('Open',()=>{ close(); A.pages.creations(); }));
  }
  async function keys(box){
    H(box,'API keys','Use CodeConClave AI from your own apps and code. It works like the OpenAI API, so most tools connect in a minute.');
    if(!A.me) return needSignIn(box,'API keys belong to your account.');
    const lst=el('div','st-list'); const shown=el('div');
    const make=el('div','st-row col'); const t=el('div','tx'); t.appendChild(el('b',null,'Create a key')); t.appendChild(el('span',null,'You see the key only once — keep it secret, like a password.')); make.appendChild(t);
    const r=el('div','st-calc'); const nm=el('input','st-in'); nm.placeholder='Name, e.g. My website'; nm.maxLength=40; nm.style.width='240px';
    r.append(nm,button('Create key',async()=>{ try{ const d=await api('/api/keys',{method:'POST',body:{name:nm.value.trim()}}); nm.value=''; shown.innerHTML='';
      const k=el('div','st-key',d.key); shown.appendChild(k); const cp=button(SV(I.copy)+' Copy',async()=>{ try{ await navigator.clipboard.writeText(d.key); toast('Key copied'); }catch{} }); cp.style.marginTop='8px'; shown.appendChild(cp);
      shown.appendChild(el('div','st-note st-warn','Copy it now — you won’t see it again.')); paintKeys(); }catch(e){ toast(e.message); } },'pri')); make.append(r,shown); box.appendChild(make);
    const kr=el('div','st-row col'); const kt=el('div','tx'); kt.appendChild(el('b',null,'Your keys')); kr.append(kt,lst); box.appendChild(kr);
    async function paintKeys(){ lst.innerHTML=''; try{ const d=await api('/api/keys'); if(!d.keys.length) lst.appendChild(el('div','st-note','No keys yet.'));
      d.keys.forEach(k=>{ const it=el('div','st-item'); const g=el('div','grow'); g.append(k.name); g.appendChild(el('small',null,k.prefix+' · made '+when(k.created)+(k.lastUsed?' · used '+when(k.lastUsed):' · not used yet'))); it.appendChild(g);
        it.appendChild(button('Delete',async()=>{ if(!confirm('Delete the key “'+k.name+'”? Apps using it stop working.')) return; await api('/api/keys/'+k.id,{method:'DELETE'}); paintKeys(); },'red')); lst.appendChild(it); }); }catch(e){ lst.textContent=e.message; } }
    paintKeys();
    // the prepaid plan for the API
    const pp=el('div','st-row col'); const pt=el('div','tx'); pt.appendChild(el('b',null,'Prepaid API credit')); pt.appendChild(el('span',null,'Pick how much to prepay for API use: from ₹20,000 up to ₹1,50,000 (₹50,000 is a good start).')); pp.appendChild(pt);
    const rng=el('input','st-range'); rng.type='range'; rng.min='20000'; rng.max='150000'; rng.step='5000'; rng.value='50000'; const big=el('div','st-price'); const save=button('Save my choice',savePlan,'pri'); const note=el('div','st-note');
    const paint=()=>{ big.textContent=inr(rng.value); }; rng.oninput=paint;
    const r2=el('div','st-calc'); r2.append(big,save); pp.append(rng,r2,note); box.appendChild(pp);
    try{ const d=await api('/api/api-plan'); if(d.plan){ rng.value=d.plan.amount; note.textContent='Saved: '+inr(d.plan.amount)+' on '+when(d.plan.at)+'. Payment opens when CodeConClave launches — nothing charged.'; } }catch{}
    paint();
    async function savePlan(){ try{ const d=await api('/api/api-plan',{method:'PUT',body:{amount:Number(rng.value)}}); note.className='st-note st-ok'; note.textContent=d.note; }catch(e){ note.className='st-note st-warn'; note.textContent=e.message; } }
    // how to call it
    const ex=el('div','st-row col'); const et=el('div','tx'); et.appendChild(el('b',null,'How to use it')); et.appendChild(el('span',null,'API calls count like messages: your plan’s limits first, then your credits.')); ex.appendChild(et);
    ex.appendChild(el('div','st-code','curl '+location.origin+'/v1/chat/completions \\\n  -H "Authorization: Bearer YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"codeconclave-1","messages":[{"role":"user","content":"Hello!"}]}\''));
    box.appendChild(ex);
  }
  function desktop(box){
    H(box,'Desktop app','CodeConClave for Windows — everything from the website, plus your computer: open and close apps, run terminal commands, drive a browser (each one only after you say yes).');
    if(A.desk) row(box,'You’re in the desktop app','Apps, the terminal and the browser work right here.');
    row(box,'Download for Windows','The latest version from our releases page.',linkBtn(SV(I.arrow)+' Download',P.deskUrl));
    row(box,'Open apps from the website','With the desktop app installed once, the website can open CMD, Notepad, VS Code and more: tap the button in the chat and your computer asks you first.');
    const ib=$('installBtn'); if(ib && !ib.hidden) row(box,'Install as an app','Add CodeConClave to your computer or phone like an app.',button('Install',()=>ib.click()));
  }
  // the text size choice applies on every page
  const z=store('cc_zoom'); if(z&&z!=='1') document.documentElement.style.zoom=z;
})();
