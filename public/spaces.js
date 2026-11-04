// CodeConClave — three separate spaces, each with its own features (nothing mixed):
//   👤 Solo  — you alone: Founder Mode, Solo Reviewer, My rules, Launch checklist, Changes (time machine), Teach me
//   👥 Team  — people working together: team chat with @CodeConClave, tasks board, pages, team brain, standards, meetings, members
//   🏢 Organization — a company: overview, teamspaces, members & roles, policies, company brain, approvals, audit log, data
// Uses the main page's helpers ($, el, svgIco, toast, me, showPage …) — loaded after it.
(function(){
  const S=document.createElement('style'); S.textContent=`
  .spc{max-width:1100px;padding:6px 22px 60px}
  .spctabs{display:flex;gap:4px;flex-wrap:wrap;padding:0 22px 12px;border-bottom:1px solid #2c2c2c;margin-bottom:16px}
  .spctabs button{border:none;background:none;color:#8c8c8c;font:inherit;font-size:14.5px;padding:8px 14px;border-radius:10px;cursor:pointer}
  .spctabs button:hover{color:#e6e6e6}.spctabs button.on{background:#2c2c2c;color:#e6e6e6}
  .spcbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
  .spcbar select,.spcin,.spcta{background:#151515;color:#e6e6e6;border:1px solid #363636;border-radius:10px;padding:9px 11px;font:inherit;font-size:14px}
  .spcin{flex:1;min-width:160px}.spcta{width:100%;min-height:90px;resize:vertical}
  .spccard{background:#232323;border:1px solid #2c2c2c;border-radius:14px;padding:14px 16px;margin-bottom:10px}
  .spccard h3{margin:0 0 8px;font-size:15.5px}.spccard h4{margin:12px 0 6px;font-size:13.5px;color:#b3b3b3;text-transform:uppercase;letter-spacing:.04em}
  .spccard ul{margin:4px 0;padding-left:20px}.spccard li{margin:3px 0;line-height:1.5}
  .spcmuted{color:#8c8c8c;font-size:13.5px;line-height:1.5}
  .spcempty{color:#8c8c8c;text-align:center;padding:40px 10px;line-height:1.7}
  .spcgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
  .verdict{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:16px;padding:6px 14px;border-radius:999px}
  .verdict.ship{background:#13361f;color:#7bd88f}.verdict.fix{background:#3a2f10;color:#f2c200}.verdict.block{background:#3a1515;color:#ff8a8a}
  .sev{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:1px 7px;margin-right:6px;text-transform:uppercase}
  .sev.high{background:#5a1f1f;color:#ffb4ae}.sev.medium{background:#4a3a12;color:#f2d36b}.sev.low{background:#1f3a4a;color:#9ccdff}
  .kan{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .kancol{background:#1d1d1d;border:1px solid #2c2c2c;border-radius:14px;padding:10px;min-height:200px}
  .kancol h4{margin:2px 4px 10px;font-size:13.5px;color:#b3b3b3}
  .kcard{background:#262626;border:1px solid #333;border-radius:10px;padding:9px 10px;margin-bottom:8px;font-size:14px}
  .kcard .kmeta{color:#8c8c8c;font-size:12px;margin-top:4px}.kcard .kacts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
  .kcard .kacts button,.spcbtn{border:1px solid #3a3a3a;background:#2a2a2a;color:#e6e6e6;border-radius:8px;padding:4px 10px;font:inherit;font-size:12.5px;cursor:pointer}
  .kcard .kacts button:hover,.spcbtn:hover{background:#333}
  .chatlog{height:min(56vh,520px);overflow-y:auto;background:#1b1b1b;border:1px solid #2c2c2c;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
  .cm{max-width:80%;background:#262626;border-radius:12px;padding:8px 11px;font-size:14px;line-height:1.5;white-space:pre-wrap}
  .cm b{display:block;font-size:12px;color:#8c8c8c;margin-bottom:2px}.cm.mine{align-self:flex-end;background:#1a3550}.cm.ai{background:#2a2615;border:1px solid #3a3420}.cm.ai b{color:#f2c200}
  .pagelist button{display:block;width:100%;text-align:left;background:#232323;border:1px solid #2c2c2c;color:#e6e6e6;border-radius:10px;padding:9px 12px;margin-bottom:6px;font:inherit;cursor:pointer}
  .pagelist button.on{border-color:#1a93fe}.pagewrap{display:grid;grid-template-columns:240px 1fr;gap:14px}
  .rolepill{font-size:11.5px;background:#2c2c2c;border-radius:999px;padding:2px 9px;color:#b3b3b3}
  .stat{background:#232323;border-radius:14px;padding:14px}.stat b{display:block;font-size:26px}.stat span{color:#8c8c8c;font-size:13px}
  .audit{width:100%;border-collapse:collapse;font-size:13px}.audit td,.audit th{border-bottom:1px solid #2c2c2c;padding:7px 8px;text-align:left}.audit th{color:#8c8c8c;font-weight:500}
  .chk{display:flex;align-items:flex-start;gap:9px;padding:5px 0;font-size:14px}.chk input{width:17px;height:17px;margin-top:2px;accent-color:#1a93fe}
  .prog{height:7px;border-radius:4px;background:#2c2c2c;overflow:hidden;margin:6px 0 12px}.prog i{display:block;height:100%;background:linear-gradient(90deg,#f2c200,#7bd88f)}
  .spcsrc{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.spcsrc span{font-size:12px;background:#2c2c2c;border-radius:8px;padding:3px 8px;color:#b3b3b3}
  @media(max-width:820px){ .kan{grid-template-columns:1fr} .pagewrap{grid-template-columns:1fr} }
  @media(max-width:560px){ .spcsub{display:none} .spc{padding:6px 14px 60px} .spctabs{padding:0 14px 12px} }`;
  document.head.appendChild(S);

  const api=async(url,opt={})=>{ const r=await fetch(url,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})},body:opt.body&&typeof opt.body!=='string'?JSON.stringify(opt.body):opt.body}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Something went wrong.'); return d; };
  const nid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const ago=(t)=>{ const s=(Date.now()-t)/1000; return s<60?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':new Date(t).toLocaleDateString('en-IN',{day:'numeric',month:'short'}); };
  const store=(k,v)=>{ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)||'null'); localStorage.setItem(k,JSON.stringify(v)); }catch{ return null; } };
  // our own small question box (some in-app browsers block the built-in prompt)
  function askText(label,ph='',init=''){ return new Promise(ok=>{ const m=el('div','modal open'), b=el('div','modalbox'); b.appendChild(el('div','bhead',label)); const i=el('input','spcin'); i.placeholder=ph; i.value=init; i.style.cssText='width:100%;margin:10px 0';
    const done=(v)=>{ m.remove(); ok(v); }; const bar=el('div','mailact right'); const no=el('button','mskip','Cancel'), yes=el('button','msend','OK'); no.onclick=()=>done(null); yes.onclick=()=>done(i.value.trim()||null);
    i.onkeydown=(e)=>{ if(e.key==='Enter') done(i.value.trim()||null); if(e.key==='Escape') done(null); }; m.onclick=(e)=>{ if(e.target===m) done(null); };
    bar.append(no,yes); b.append(i,bar); m.appendChild(b); document.body.appendChild(m); setTimeout(()=>i.focus(),30); }); }
  const btn=(label,fn,cls='spcbtn')=>{ const b=el('button',cls,label); b.onclick=fn; return b; };
  const ICON={solo:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',team:'<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15 14.5a5 5 0 0 1 6.5 5"/>',org:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3"/><path d="M3 12h18"/><path d="M10 12v3h4v-3"/>'};

  // ---- the three pages + their sidebar links ----
  function makePage(id,title,sub){
    const p=el('div','page'); p.id=id; const head=el('div','pagehead');
    const back=el('button','railbtn pback'); back.title='Back'; back.innerHTML=svgIco('<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>'); back.onclick=closePages;
    const h=el('h1',null,title); h.style.flex='0 0 auto'; head.append(back,h); const s=el('span','spcmuted spcsub',sub); s.style.cssText='margin-left:6px;min-width:0;flex:1;overflow-wrap:anywhere'; head.appendChild(s);
    p.appendChild(head); const tabs=el('div','spctabs'); tabs.id=id+'Tabs'; p.appendChild(tabs); const body=el('div','spc'); body.id=id+'Body'; p.appendChild(body);
    document.body.appendChild(p); return p;
  }
  makePage('soloPage','Solo','just you — your own builder tools');
  makePage('teamPage','Team','your team, working together with CodeConClave');
  makePage('orgPage','Organization','your company — teamspaces, rules and control');
  const lbl=el('div','raillbl','Spaces'); const anchor=document.querySelector('.raillbl');
  const links=[['soloBtn','Solo tools',ICON.solo,showSolo],['teamBtn','Team ↗',ICON.team,()=>{ location.href='/team'; }],['orgBtn','Organization ↗',ICON.org,()=>{ location.href='/org'; }]].map(([id,name,ic,fn])=>{ const b=el('button','sidelink'); b.id=id; b.innerHTML=svgIco(ic)+' '+name; b.onclick=fn; return b; });
  anchor.before(lbl,...links);
  Object.assign(PAGE_LINK,{soloPage:'soloBtn',teamPage:'teamBtn',orgPage:'orgBtn'});
  function tabs(pageId,list,cur,onPick){ const t=$(pageId+'Tabs'); t.innerHTML=''; list.forEach(x=>{ const b=el('button',x===cur?'on':null,x); b.onclick=()=>onPick(x); t.appendChild(b); }); }
  const needSign=(body,what)=>{ body.innerHTML=''; const e=el('div','spcempty'); e.append(what+' are kept on your account so everyone sees the same thing. '); const b=btn('Sign in',()=>showAuth(false),'msend'); e.appendChild(el('br')); e.appendChild(b); body.appendChild(e); };

  // ===================================== SOLO =====================================
  let soloTab='Founder Mode';
  function showSolo(){ showPage('soloPage'); renderSolo(); }
  function renderSolo(){
    tabs('soloPage',['Founder Mode','Reviewer','My rules','Launch checklist','Changes','Teach me'],soloTab,(x)=>{ soloTab=x; renderSolo(); });
    const B=$('soloPageBody'); B.innerHTML='';
    ({'Founder Mode':soloFounder,'Reviewer':soloReviewer,'My rules':soloRules,'Launch checklist':soloChecklist,'Changes':soloChanges,'Teach me':soloTeach})[soloTab](B);
  }
  function soloFounder(B){
    B.appendChild(el('div','spcmuted','Describe the outcome you want — “a booking app for my salon”, “add Google login and subscriptions to my SaaS”. I make the product brief, the plan, tasks, data design, API and launch steps.'));
    const ta=el('textarea','spcta'); ta.placeholder='What do you want to build or achieve?'; ta.style.marginTop='10px'; ta.value=store('cc_founder_idea')||''; B.appendChild(ta);
    const out=el('div'); const go=btn('Make the plan',async()=>{ const idea=ta.value.trim(); if(idea.length<8) return toast('Describe it in a sentence or two.'); store('cc_founder_idea',idea); go.disabled=true; go.textContent='Planning…'; out.innerHTML='<div class="spcmuted">Thinking it through like a product lead + architect…</div>';
      try{ const d=await api('/api/solo/brief',{method:'POST',body:{idea}}); store('cc_founder_last',d); out.innerHTML=''; out.appendChild(briefEl(d)); }catch(e){ out.innerHTML=''; out.appendChild(el('div','spcempty',e.message)); }
      go.disabled=false; go.textContent='Make the plan'; },'msend');
    const bar=el('div','spcbar'); bar.style.marginTop='8px'; bar.appendChild(go); B.append(bar,out);
    const last=store('cc_founder_last'); if(last) out.appendChild(briefEl(last));
  }
  function briefEl(d){
    const c=el('div','spccard'); c.appendChild(el('h3',null,d.title)); if(d.oneLiner) c.appendChild(el('div','spcmuted',d.oneLiner));
    const list=(h,items)=>{ if(!items?.length) return; c.appendChild(el('h4',null,h)); const ul=el('ul'); items.forEach(x=>ul.appendChild(el('li',null,typeof x==='string'?x:JSON.stringify(x)))); c.appendChild(ul); };
    if(d.problem){ c.appendChild(el('h4',null,'The problem')); c.appendChild(el('div',null,d.problem)); }
    list('Who it is for',d.users); list('Must-have features',d.features); list('Build plan',d.plan); list('Tasks',d.tasks);
    if(d.data?.length){ c.appendChild(el('h4',null,'Data design')); const ul=el('ul'); d.data.forEach(t=>ul.appendChild(el('li',null,t.table+': '+t.fields.join(', ')))); c.appendChild(ul); }
    if(d.api?.length){ c.appendChild(el('h4',null,'API')); const ul=el('ul'); d.api.forEach(a=>ul.appendChild(el('li',null,a.method+' '+a.path+' — '+a.purpose))); c.appendChild(ul); }
    if(d.stack){ c.appendChild(el('h4',null,'Recommended stack')); c.appendChild(el('div',null,d.stack)); }
    list('Risks',d.risks); list('Launch steps',d.launch);
    const acts=el('div','spcbar'); acts.style.marginTop='12px';
    acts.append(btn('▶ Build it now',()=>{ closePages(); newChat(); input.value='/app '+d.title+': '+d.oneLiner+'. Features: '+(d.features||[]).join('; ')+'. Make it complete and polished.'; input.dispatchEvent(new Event('input')); send(); },'msend'),
      btn('Copy the plan',async()=>{ try{ await navigator.clipboard.writeText(c.innerText); toast('Plan copied'); }catch{ toast('Copy did not work here.'); } }),
      btn('Make a launch checklist',()=>{ store('cc_checklist_project',d.title+' — '+d.oneLiner); soloTab='Launch checklist'; renderSolo(); }));
    c.appendChild(acts); return c;
  }
  function soloReviewer(B){
    B.appendChild(el('div','spcmuted','Your own senior reviewer: security, bugs, edge cases, performance, accessibility and tests — with a clear verdict: Ship, Fix first, or Block release.'));
    const ta=el('textarea','spcta'); ta.placeholder='Paste the code to review…'; ta.style.cssText='margin-top:10px;font-family:ui-monospace,Consolas,monospace;min-height:160px'; B.appendChild(ta);
    const out=el('div'), bar=el('div','spcbar'); bar.style.marginTop='8px';
    const run=async(files)=>{ out.innerHTML='<div class="spcmuted">Reviewing like a strict senior engineer…</div>';
      try{ const d=await api('/api/solo/review',{method:'POST',body:files?{files}:{code:ta.value}}); out.innerHTML=''; out.appendChild(reviewEl(d)); }catch(e){ out.innerHTML=''; out.appendChild(el('div','spcempty',e.message)); } };
    bar.append(btn('Review this code',()=>{ if(ta.value.trim().length<20) return toast('Paste some code first.'); run(null); },'msend'),
      btn(folder?.files?'Review my folder ('+folder.name+')':'Review a folder…',async()=>{
        if(!folder?.files){ toast('Pick the project folder, then press it again.'); return openFolder(); }
        const paths=[...folder.files.keys()].filter(p=>/\.(js|jsx|ts|tsx|py|java|go|rb|php|cs|html|css|vue|svelte|sql|kt|swift|dart)$/i.test(p)&&!/(node_modules|dist|build|\.min\.)/.test(p)).slice(0,25);
        if(!paths.length) return toast('No code files found in that folder.');
        const files=[]; for(const p of paths){ try{ files.push({path:p,text:(await readLocal(p)).slice(0,15000)}); }catch{} } run(files); }));
    B.append(bar,out);
  }
  function reviewEl(d){
    const c=el('div','spccard'); const V={ship:['🟢','Ship it'],fix:['🟡','Fix first'],block:['🔴','Block release']}[d.verdict];
    c.appendChild(Object.assign(el('div','verdict '+d.verdict),{textContent:V[0]+' '+V[1]})); c.appendChild(el('div',null,d.summary)).style.margin='10px 0';
    if(d.findings?.length){ c.appendChild(el('h4',null,d.findings.length+' finding'+(d.findings.length===1?'':'s')));
      ['high','medium','low'].forEach(sv=>d.findings.filter(f=>f.severity===sv).forEach(f=>{ const r=el('div'); r.style.margin='8px 0'; const t=el('div'); t.appendChild(el('span','sev '+sv,sv)); t.append((f.area?f.area+' · ':'')+(f.file||'')); r.appendChild(t); r.appendChild(el('div',null,f.issue)); if(f.fix){ const x=el('div','spcmuted','Fix: '+f.fix); r.appendChild(x); } c.appendChild(r); })); }
    if(d.good?.length){ c.appendChild(el('h4',null,'Done well')); const ul=el('ul'); d.good.forEach(g=>ul.appendChild(el('li',null,g))); c.appendChild(ul); }
    if(d.findings?.length && folder?.files) c.appendChild(btn('Fix these with the coding agent',()=>{ closePages(); let ch=current(); if(!ch){ newChat(); ch=current(); } ch.messages.push({role:'user',content:'Fix the review findings'}); saveC(); renderChat(); runCodeAgent(ch,'Fix these review findings, smallest safe changes first:\n'+d.findings.map(f=>'- ['+f.severity+'] '+(f.file?f.file+': ':'')+f.issue+' → '+f.fix).join('\n')); },'msend'));
    return c;
  }
  // personal rules: every answer, build and coding-agent run follows them
  const MYRULES='cc_myrules_v1'; window.ccMyRules=()=>(store(MYRULES)||[]).map(r=>'- '+r).join('\n');
  function soloRules(B){
    B.appendChild(el('div','spcmuted','Teach me how you work, once — “I use TypeScript strict mode”, “Always use Tailwind”, “Never touch the payments folder without asking”. I follow these in every answer, build and change.'));
    const list=el('div'); const draw=()=>{ list.innerHTML=''; const rules=store(MYRULES)||[]; if(!rules.length) list.appendChild(el('div','spcempty','No rules yet.'));
      rules.forEach((r,i)=>{ const c=el('div','spccard'); c.style.display='flex'; c.style.alignItems='center'; c.style.gap='10px'; const t=el('div',null,r); t.style.flex='1'; c.append(t,btn('Delete',()=>{ const x=store(MYRULES)||[]; x.splice(i,1); store(MYRULES,x); draw(); })); list.appendChild(c); }); };
    const inp=el('input','spcin'); inp.placeholder='Add a rule, e.g. Always write tests for new functions';
    const add=()=>{ const v=inp.value.trim(); if(!v) return; const x=store(MYRULES)||[]; x.push(v.slice(0,200)); store(MYRULES,x.slice(0,40)); inp.value=''; draw(); };
    inp.onkeydown=(e)=>{ if(e.key==='Enter') add(); };
    const bar=el('div','spcbar'); bar.style.marginTop='10px'; bar.append(inp,btn('Add',add,'msend')); B.append(bar,list); draw();
  }
  function soloChecklist(B){
    B.appendChild(el('div','spcmuted','A launch checklist made for your project: domain, SEO, analytics, monitoring, backups, privacy and terms, payments, email, app store rules and security.'));
    const inp=el('input','spcin'); inp.placeholder='Your project, e.g. a salon booking web app with payments'; inp.value=store('cc_checklist_project')||'';
    const out=el('div'); const bar=el('div','spcbar'); bar.style.marginTop='10px';
    const draw=(d)=>{ out.innerHTML=''; if(!d) return; const done=store('cc_checklist_done')||{}; const all=d.groups.flatMap(g=>g.items.map(t=>g.name+'|'+t)); const n=all.filter(k=>done[k]).length;
      const head=el('div','spccard'); head.appendChild(el('h3',null,'Launch: '+d.project)); head.appendChild(el('div','spcmuted',n+' of '+all.length+' done')); const pg=el('div','prog'); const bar2=el('i'); bar2.style.width=Math.round(n/Math.max(1,all.length)*100)+'%'; pg.appendChild(bar2); head.appendChild(pg);
      d.groups.forEach(g=>{ head.appendChild(el('h4',null,g.name)); g.items.forEach(t=>{ const k=g.name+'|'+t, row=el('label','chk'), cb=document.createElement('input'); cb.type='checkbox'; cb.checked=Boolean(done[k]); cb.onchange=()=>{ const x=store('cc_checklist_done')||{}; x[k]=cb.checked; store('cc_checklist_done',x); draw(d); }; row.append(cb,el('span',null,t)); head.appendChild(row); }); });
      out.appendChild(head); };
    bar.append(inp,btn('Make my checklist',async()=>{ const p=inp.value.trim(); store('cc_checklist_project',p); out.innerHTML='<div class="spcmuted">Making your checklist…</div>'; try{ const d=await api('/api/solo/checklist',{method:'POST',body:{project:p}}); store('cc_checklist',d); store('cc_checklist_done',{}); draw(d); }catch(e){ out.innerHTML=''; out.appendChild(el('div','spcempty',e.message)); } },'msend'));
    B.append(bar,out); draw(store('cc_checklist'));
  }
  // the time machine: every change I made to your files and every version of what I built - with Undo
  function soloChanges(B){
    B.appendChild(el('div','spcmuted','Everything I changed for you, newest first. Undo any change, or open the chat it came from.'));
    const rows=[]; convos.forEach(c=>c.messages.forEach((m,i)=>{ if(m.edits?.length||m.fileCard?.saved||m.artifact) rows.push({c,m,i,at:c.updated}); }));
    if(!rows.length){ B.appendChild(el('div','spcempty','No changes yet. When I edit your files or build something, it shows up here.')); return; }
    rows.slice(-60).reverse().forEach(({c,m})=>{ const card=el('div','spccard'); const t=el('div','spcbar'); t.appendChild(el('b',null,c.title||'Chat')); t.appendChild(el('span','spcmuted','· '+(m.artifact?'built '+m.artifact.title+' (v'+(m.artifact.version||1)+')':(m.content||'').slice(0,80))));
      t.appendChild(btn('Open chat',()=>selectChat(c.id))); card.appendChild(t);
      if(m.edits?.length) card.appendChild(editSummary(m.edits,touch)); else if(m.fileCard?.saved) card.appendChild(editSummary([m.fileCard],touch)); else if(m.artifact) card.appendChild(artCardEl(m.artifact));
      B.appendChild(card); });
  }
  function soloTeach(B){
    const on=store('cc_teach_v1')===true; const c=el('div','spccard');
    c.appendChild(el('h3',null,'Teach me mode')); c.appendChild(el('div','spcmuted','When it is on, I explain WHY things work, step by step, with a small example, how to debug it, and a tiny practice question — not just the answer.'));
    const row=el('label','chk'), cb=document.createElement('input'); cb.type='checkbox'; cb.checked=on; cb.onchange=()=>{ store('cc_teach_v1',cb.checked); toast(cb.checked?'Teach me mode is on 🎓':'Teach me mode is off'); };
    row.append(cb,el('span',null,'Turn on Teach me mode')); row.style.marginTop='10px'; c.appendChild(row); B.appendChild(c);
  }

  // ===================================== TEAM =====================================
  let teamId=store('cc_team_cur'), teamTab='Chat', teamData=null, chatPoll=null;
  async function showTeam(){ showPage('teamPage'); await renderTeam(); }
  async function loadSpace(id){ try{ teamData=await api('/api/spaces/'+encodeURIComponent(id)); }catch{ teamData=null; } return teamData; }
  async function renderTeam(){
    clearInterval(chatPoll);
    const B=$('teamPageBody'); B.innerHTML='';
    if(!me){ $('teamPageTabs').innerHTML=''; return needSign(B,'Teams'); }
    let list=[]; try{ list=(await api('/api/spaces')).spaces.filter(s=>s.kind==='team'||s.kind==='teamspace'); }catch(e){ B.appendChild(el('div','spcempty',e.message)); return; }
    const top=el('div','spcbar');
    if(list.length){ const sel=document.createElement('select'); list.forEach(s=>sel.appendChild(new Option((s.kind==='teamspace'?'🏢 ':'👥 ')+s.name,s.id))); if(!list.some(s=>s.id===teamId)) teamId=list[0].id; sel.value=teamId; sel.onchange=()=>{ teamId=sel.value; store('cc_team_cur',teamId); renderTeam(); }; top.appendChild(sel); }
    top.append(btn('＋ New team',async()=>{ const name=await askText('Name your team','e.g. Product team'); if(!name) return; try{ const d=await api('/api/spaces',{method:'POST',body:{kind:'team',name}}); teamId=d.space.id; store('cc_team_cur',teamId); renderTeam(); toast('Team created 🎉'); }catch(e){ toast(e.message); } }),
      btn('Join with a link',async()=>{ const v=await askText('Paste the invite link','https://…/?join=…'); const tok=(String(v||'').match(/join=([\w-]+)/)||[])[1]||String(v||'').trim(); if(!tok) return; try{ const d=await api('/api/join',{method:'POST',body:{token:tok}}); teamId=d.space.id; store('cc_team_cur',teamId); renderTeam(); toast('You joined '+d.space.name); }catch(e){ toast(e.message); } }));
    B.appendChild(top);
    if(!list.length){ $('teamPageTabs').innerHTML=''; const e=el('div','spcempty'); e.innerHTML='No team yet.<br>Create one, then invite your teammates with a link — you’ll share a chat with CodeConClave in it, a task board, pages, a team brain, standards and meeting notes.'; B.appendChild(e); return; }
    if(!await loadSpace(teamId)){ B.appendChild(el('div','spcempty','Could not open this team.')); return; }
    tabs('teamPage',['Chat','Tasks','Pages','Team brain','Standards','Meetings','Members'],teamTab,(x)=>{ teamTab=x; renderTeam(); });
    const head=el('div','spcmuted',teamData.space.name+' · '+teamData.members.length+' member'+(teamData.members.length===1?'':'s')+' · you are '+teamData.myRole); head.style.marginBottom='10px'; B.appendChild(head);
    const box=el('div'); B.appendChild(box);
    ({'Chat':teamChat,'Tasks':teamTasks,'Pages':teamPages,'Team brain':brainTab,'Standards':standardsTab,'Meetings':teamMeetings,'Members':membersTab})[teamTab](box,teamData);
  }
  const items=async(sp,kind,since)=> (await api('/api/spaces/'+sp.id+'/items/'+kind+(since?'?since='+since:''))).items;
  const putItem=(sp,kind,id,data)=>api('/api/spaces/'+sp.id+'/items/'+kind+'/'+encodeURIComponent(id),{method:'PUT',body:{data}});
  const delItem=(sp,kind,id)=>api('/api/spaces/'+sp.id+'/items/'+kind+'/'+encodeURIComponent(id),{method:'DELETE'});
  async function teamChat(box,t){
    const log=el('div','chatlog'); box.appendChild(log);
    let last=0; const seen=new Set();
    const pull=async()=>{ try{ const list=(await items(t.space,'message',last)).reverse(); for(const m of list){ last=Math.max(last,m.updated); if(seen.has(m.id)) continue; seen.add(m.id);
        const d=m.data, c=el('div','cm'+(d.ai?' ai':String(d.by)===String(me?.id)?' mine':'')); c.appendChild(el('b',null,(d.byName||'')+' · '+ago(d.at))); c.append(d.text); log.appendChild(c); }
      if(list.length) log.scrollTop=log.scrollHeight; }catch{} };
    await pull(); if(!log.children.length) log.appendChild(el('div','spcmuted','Say hi to your team. Mention @CodeConClave to ask the AI — it knows your team brain and standards.'));
    const inp=el('input','spcin'); inp.placeholder='Message your team… (type @CodeConClave to ask the AI)';
    const go=async()=>{ const text=inp.value.trim(); if(!text) return; inp.value=''; try{ await api('/api/spaces/'+t.space.id+'/channel',{method:'POST',body:{text}}); await pull(); }catch(e){ toast(e.message); } };
    inp.onkeydown=(e)=>{ if(e.key==='Enter') go(); };
    const bar=el('div','spcbar'); bar.append(inp,btn('Send',go,'msend')); box.appendChild(bar);
    chatPoll=setInterval(()=>{ if(!$('teamPage').classList.contains('open')) return clearInterval(chatPoll); pull(); },4000);
  }
  async function teamTasks(box,t){
    const bar=el('div','spcbar'), inp=el('input','spcin'); inp.placeholder='Add a task…';
    const add=async()=>{ const title=inp.value.trim(); if(!title) return; inp.value=''; await putItem(t.space,'task',nid(),{title,status:'todo'}); draw(); };
    inp.onkeydown=(e)=>{ if(e.key==='Enter') add(); };
    const out=el('div');
    bar.append(inp,btn('Add',add,'msend'),btn('📋 Standup summary',async()=>{ out.innerHTML='<div class="spcmuted">Writing the standup…</div>'; try{ const d=await api('/api/spaces/'+t.space.id+'/ai/standup',{method:'POST',body:{}}); out.innerHTML=''; const c=el('div','spccard'); c.appendChild(el('h3',null,'Standup')); c.appendChild(el('div',null,d.text)).style.whiteSpace='pre-wrap'; out.appendChild(c); }catch(e){ out.textContent=e.message; } }),
      btn('🚀 Release notes',async()=>{ out.innerHTML='<div class="spcmuted">Writing release notes…</div>'; try{ const d=await api('/api/spaces/'+t.space.id+'/ai/release-notes',{method:'POST',body:{}}); out.innerHTML=''; const c=el('div','spccard'); c.appendChild(el('h3',null,'Release notes')); c.appendChild(el('div',null,d.text)).style.whiteSpace='pre-wrap'; out.appendChild(c); }catch(e){ out.textContent=e.message; } }));
    const kan=el('div','kan'); box.append(bar,out,kan);
    const COLS=[['todo','To do'],['doing','Doing'],['done','Done']];
    async function draw(){ kan.innerHTML=''; const list=await items(t.space,'task');
      COLS.forEach(([k,name],ci)=>{ const col=el('div','kancol'); col.appendChild(el('h4',null,name+' · '+list.filter(x=>(x.data.status||'todo')===k).length));
        list.filter(x=>(x.data.status||'todo')===k).forEach(x=>{ const d=x.data, c=el('div','kcard'); c.appendChild(el('div',null,d.title));
          c.appendChild(el('div','kmeta',[d.assigneeName?'👤 '+d.assigneeName:'',d.risk?'risk '+d.risk:'',d.estimate||''].filter(Boolean).join(' · ')||'by '+(d.byName||'')));
          if(d.steps?.length){ const ul=el('ul'); ul.style.cssText='margin:6px 0 0;padding-left:18px;font-size:13px;color:#cfcfcf'; d.steps.forEach(s=>ul.appendChild(el('li',null,s))); c.appendChild(ul); }
          const a=el('div','kacts');
          if(ci>0) a.appendChild(btn('←',async()=>{ await putItem(t.space,'task',x.id,{...d,status:COLS[ci-1][0]}); draw(); }));
          if(ci<2) a.appendChild(btn('→',async()=>{ await putItem(t.space,'task',x.id,{...d,status:COLS[ci+1][0]}); draw(); }));
          const who=document.createElement('select'); who.style.cssText='background:#2a2a2a;color:#e6e6e6;border:1px solid #3a3a3a;border-radius:8px;font-size:12px'; who.appendChild(new Option('assign…','')); t.members.forEach(m=>who.appendChild(new Option(m.name||m.email,m.name||m.email))); who.value=d.assigneeName||''; who.onchange=async()=>{ await putItem(t.space,'task',x.id,{...d,assigneeName:who.value}); draw(); }; a.appendChild(who);
          a.appendChild(btn('✨ Plan with AI',async(e)=>{ e.target.textContent='Planning…'; try{ const p=await api('/api/spaces/'+t.space.id+'/ai/plan-task',{method:'POST',body:{title:d.title,detail:d.detail||''}}); await putItem(t.space,'task',x.id,{...d,steps:p.steps,acceptance:p.acceptance,risk:p.risk,estimate:p.estimate}); draw(); }catch(err){ toast(err.message); e.target.textContent='✨ Plan with AI'; } }));
          a.appendChild(btn('✕',async()=>{ await delItem(t.space,'task',x.id); draw(); }));
          c.appendChild(a); col.appendChild(c); });
        kan.appendChild(col); }); }
    draw();
  }
  async function teamPages(box,t){
    const wrap=el('div','pagewrap'), left=el('div','pagelist'), right=el('div'); wrap.append(left,right); box.appendChild(wrap);
    let cur=null;
    async function drawList(){ left.innerHTML=''; left.appendChild(btn('＋ New page',()=>openPage({id:nid(),data:{title:'Untitled',body:'',comments:[]}},true),'msend')); left.lastChild.style.marginBottom='10px';
      const list=await items(t.space,'page'); list.forEach(p=>{ const b=el('button',cur&&cur.id===p.id?'on':null,p.data.title||'Untitled'); b.onclick=()=>openPage(p); left.appendChild(b); }); if(!list.length) left.appendChild(el('div','spcmuted','No pages yet.')); }
    function openPage(p,fresh){ cur=p; right.innerHTML=''; const d={comments:[],...p.data};
      const title=el('input','spcin'); title.value=d.title||''; title.style.cssText='width:100%;font-size:20px;font-weight:600;margin-bottom:8px';
      const body=el('textarea','spcta'); body.value=d.body||''; body.style.minHeight='320px'; body.placeholder='Write in Markdown — headings (#), lists (-), tables…';
      const bar=el('div','spcbar'); bar.style.marginTop='8px';
      const save=async()=>{ await putItem(t.space,'page',p.id,{...d,title:title.value.trim()||'Untitled',body:body.value}); toast('Saved ✅'); cur={...p,data:{...d,title:title.value,body:body.value}}; drawList(); };
      bar.append(btn('Save',save,'msend'),btn('✨ Write with AI',async(e)=>{ const what=await askText('What should the page be about?','e.g. How we onboard a new developer',title.value==='Untitled'?'':title.value); if(!what) return; e.target.textContent='Writing…'; try{ const r=await api('/api/spaces/'+t.space.id+'/ai/write-page',{method:'POST',body:{prompt:what}}); body.value=r.body; if(title.value==='Untitled') title.value=what.slice(0,80); }catch(err){ toast(err.message); } e.target.textContent='✨ Write with AI'; }),
        btn('History ('+((d.history||[]).length)+')',()=>{ const h=(d.history||[]); if(!h.length) return toast('No earlier versions yet.'); hist.innerHTML=''; h.forEach(v=>{ const r=el('div','spccard'); r.appendChild(el('div','spcmuted',ago(v.at)+' · '+(v.byName||''))); r.appendChild(el('b',null,v.title)); r.appendChild(btn('Restore this version',()=>{ title.value=v.title; body.value=v.body; toast('Restored — press Save to keep it.'); })); hist.appendChild(r); }); }),
        btn('Delete',async()=>{ if(!confirm('Delete this page?')) return; await delItem(t.space,'page',p.id); right.innerHTML=''; cur=null; drawList(); }));
      const hist=el('div');
      const com=el('div','spccard'); com.appendChild(el('h4',null,'Comments')); (d.comments||[]).forEach(c=>{ const r=el('div'); r.style.margin='6px 0'; r.appendChild(el('b',null,c.byName+' · '+ago(c.at)+': ')); r.append(c.text); com.appendChild(r); });
      const ci=el('input','spcin'); ci.placeholder='Add a comment (use @name to mention)'; ci.onkeydown=async(e)=>{ if(e.key!=='Enter'||!ci.value.trim()) return; d.comments=[...(d.comments||[]),{byName:me?.name||me?.email,text:ci.value.trim(),at:Date.now()}]; ci.value=''; await putItem(t.space,'page',p.id,{...d,title:title.value,body:body.value}); openPage({...p,data:d}); };
      com.appendChild(ci);
      right.append(title,body,bar,hist,com); if(fresh) title.select(); }
    drawList();
  }
  async function brainTab(box,t){
    const isOrg=t.space.kind==='org';
    box.appendChild(el('div','spcmuted',(isOrg?'The company brain':'The team brain')+': notes, docs and files everyone shares. Ask anything and CodeConClave answers from them, with sources'+(isOrg?' — across all teamspaces.':'.')));
    const ask=el('input','spcin'); ask.placeholder=isOrg?'Ask the company brain… e.g. Which team owns billing?':'Ask the team brain… e.g. How do we handle login?'; const ans=el('div');
    const go=async()=>{ const q=ask.value.trim(); if(!q) return; ans.innerHTML='<div class="spcmuted">Looking through your knowledge…</div>'; try{ const d=await api('/api/spaces/'+t.space.id+'/ask',{method:'POST',body:{question:q}}); ans.innerHTML=''; const c=el('div','spccard'); c.appendChild(el('div',null,d.answer)).style.whiteSpace='pre-wrap'; if(d.sources?.length){ const s=el('div','spcsrc'); d.sources.forEach(x=>s.appendChild(el('span',null,'['+x.n+'] '+x.title+(x.space&&isOrg?' · '+x.space:'')))); c.appendChild(s); } ans.appendChild(c); }catch(e){ ans.textContent=e.message; } };
    ask.onkeydown=(e)=>{ if(e.key==='Enter') go(); };
    const bar=el('div','spcbar'); bar.style.marginTop='10px'; bar.append(ask,btn('Ask',go,'msend')); box.append(bar,ans);
    if(t.myRole==='guest') return;
    const add=el('div','spccard'); add.appendChild(el('h4',null,'Add knowledge'));
    const ti=el('input','spcin'); ti.placeholder='Title, e.g. How we deploy'; ti.style.width='100%'; const tx=el('textarea','spcta'); tx.placeholder='Paste the text, or add a file below'; tx.style.marginTop='8px';
    const file=document.createElement('input'); file.type='file'; file.accept='.txt,.md,.csv,.json,.html,.js,.ts,.py,.pdf'; file.onchange=async()=>{ const f=file.files[0]; if(!f) return; try{ const r=await readFile(f); tx.value=(r.text||'').slice(0,100000); if(!ti.value) ti.value=f.name; }catch{ toast('Could not read that file.'); } };
    const bar2=el('div','spcbar'); bar2.style.marginTop='8px'; bar2.append(file,btn('Save to the brain',async()=>{ if(!ti.value.trim()||!tx.value.trim()) return toast('Add a title and some text.'); await putItem(t.space,'knowledge',nid(),{title:ti.value.trim(),body:tx.value}); ti.value=''; tx.value=''; file.value=''; drawK(); toast('Added — everyone can ask about it now.'); },'msend'));
    add.append(ti,tx,bar2); box.appendChild(add);
    const kl=el('div','spcgrid'); box.appendChild(kl);
    async function drawK(){ kl.innerHTML=''; for(const k of await items(t.space,'knowledge')){ const c=el('div','spccard'); c.appendChild(el('b',null,k.data.title)); c.appendChild(el('div','spcmuted',(k.data.body||'').slice(0,140)+'…')); c.appendChild(el('div','spcmuted','by '+(k.data.byName||'')+' · '+ago(k.updated))); c.appendChild(btn('Delete',async()=>{ await delItem(t.space,'knowledge',k.id); drawK(); })); kl.appendChild(c); } }
    drawK();
  }
  async function standardsTab(box,t){
    const isOrg=t.space.kind==='org';
    box.appendChild(el('div','spcmuted',(isOrg?'Company-wide rules':'Team standards')+' — naming, libraries, testing, forbidden patterns, review rules. CodeConClave follows them for '+(isOrg?'everyone in the company.':'everyone in the team.')+' Only admins change them.'));
    const list=el('div'); box.appendChild(list);
    const draw=async()=>{ list.innerHTML=''; const rules=await items(t.space,'rule'); if(!rules.length) list.appendChild(el('div','spcempty','No standards yet.'));
      rules.forEach(r=>{ const c=el('div','spccard'); c.style.display='flex'; c.style.gap='10px'; c.style.alignItems='center'; const x=el('div',null,r.data.text); x.style.flex='1'; c.appendChild(x); if(['owner','admin'].includes(t.myRole)) c.appendChild(btn('Delete',async()=>{ await delItem(t.space,'rule',r.id); draw(); })); list.appendChild(c); }); };
    if(['owner','admin'].includes(t.myRole)){ const inp=el('input','spcin'); inp.placeholder='e.g. Every API change needs a test and a docs update'; const add=async()=>{ if(!inp.value.trim()) return; await putItem(t.space,'rule',nid(),{text:inp.value.trim().slice(0,300)}); inp.value=''; draw(); };
      inp.onkeydown=(e)=>{ if(e.key==='Enter') add(); }; const bar=el('div','spcbar'); bar.style.marginTop='10px'; bar.append(inp,btn('Add standard',add,'msend')); box.insertBefore(bar,list); }
    draw();
  }
  async function teamMeetings(box,t){
    box.appendChild(el('div','spcmuted','Paste the meeting notes or transcript. I write the summary, the decisions and the action items — and every action item becomes a task on the board.'));
    const ta=el('textarea','spcta'); ta.style.marginTop='10px'; ta.placeholder='Paste the meeting notes or transcript…'; const out=el('div');
    const bar=el('div','spcbar'); bar.style.marginTop='8px'; bar.appendChild(btn('Summarize + make tasks',async(e)=>{ if(ta.value.trim().length<40) return toast('Paste the notes first.'); e.target.textContent='Working…'; try{ await api('/api/spaces/'+t.space.id+'/ai/meeting',{method:'POST',body:{transcript:ta.value}}); ta.value=''; toast('Done — the action items are on the Tasks board.'); draw(); }catch(err){ toast(err.message); } e.target.textContent='Summarize + make tasks'; },'msend'));
    box.append(ta,bar,out);
    async function draw(){ out.innerHTML=''; for(const m of await items(t.space,'meeting')){ const c=el('div','spccard'); c.appendChild(el('h3',null,m.data.title)); c.appendChild(el('div','spcmuted',ago(m.updated)+' · '+(m.data.byName||'')));
      c.appendChild(el('div',null,m.data.summary)).style.cssText='white-space:pre-wrap;margin-top:6px';
      if(m.data.decisions?.length){ c.appendChild(el('h4',null,'Decisions')); const ul=el('ul'); m.data.decisions.forEach(x=>ul.appendChild(el('li',null,x))); c.appendChild(ul); }
      if(m.data.actions?.length){ c.appendChild(el('h4',null,'Action items')); const ul=el('ul'); m.data.actions.forEach(x=>ul.appendChild(el('li',null,x))); c.appendChild(ul); }
      out.appendChild(c); } }
    draw();
  }
  async function membersTab(box,t,afterChange){
    const admin=['owner','admin'].includes(t.myRole);
    if(admin){ const c=el('div','spccard'); c.appendChild(el('h4',null,'Invite people')); const role=document.createElement('select'); ['member','admin','guest'].forEach(r=>role.appendChild(new Option(r==='guest'?'guest (read only)':r,r)));
      role.style.cssText='background:#151515;color:#e6e6e6;border:1px solid #363636;border-radius:10px;padding:8px'; const link=el('input','spcin'); link.readOnly=true; link.placeholder='Press “Make invite link”';
      const bar=el('div','spcbar'); bar.append(role,btn('Make invite link',async()=>{ try{ const d=await api('/api/spaces/'+t.space.id+'/invites',{method:'POST',body:{role:role.value}}); link.value=location.origin+'/?join='+d.token; link.select(); try{ await navigator.clipboard.writeText(link.value); toast('Invite link copied — valid for 14 days'); }catch{} }catch(e){ toast(e.message); } },'msend')); c.append(bar,link); box.appendChild(c); }
    const list=el('div'); box.appendChild(list);
    t.members.forEach(m=>{ const c=el('div','spccard'); c.style.display='flex'; c.style.alignItems='center'; c.style.gap='10px'; const n=el('div'); n.style.flex='1'; n.appendChild(el('b',null,m.name||m.email)); n.appendChild(el('div','spcmuted',m.email+' · joined '+ago(m.joined))); c.append(n,el('span','rolepill',m.role));
      if(admin && m.role!=='owner'){ const sel=document.createElement('select'); ['admin','member','guest'].forEach(r=>sel.appendChild(new Option(r,r))); sel.value=m.role; sel.onchange=async()=>{ try{ await api('/api/spaces/'+t.space.id+'/members/'+m.id,{method:'PATCH',body:{role:sel.value}}); toast('Role changed'); }catch(e){ toast(e.message); } }; c.appendChild(sel);
        c.appendChild(btn('Remove',async()=>{ if(!confirm('Remove '+(m.name||m.email)+'?')) return; await api('/api/spaces/'+t.space.id+'/members/'+m.id,{method:'DELETE'}); afterChange?afterChange():renderTeam(); })); }
      if(String(m.id)===String(me?.id) && m.role!=='owner') c.appendChild(btn('Leave',async()=>{ if(!confirm('Leave '+t.space.name+'?')) return; await api('/api/spaces/'+t.space.id+'/members/'+m.id,{method:'DELETE'}); afterChange?afterChange():renderTeam(); }));
      list.appendChild(c); });
  }

  // ================================== ORGANIZATION ==================================
  let orgId=store('cc_org_cur'), orgTab='Overview', orgData=null;
  async function showOrg(){ showPage('orgPage'); await renderOrg(); }
  async function renderOrg(){
    const B=$('orgPageBody'); B.innerHTML='';
    if(!me){ $('orgPageTabs').innerHTML=''; return needSign(B,'Organizations'); }
    let list=[]; try{ list=(await api('/api/spaces')).spaces.filter(s=>s.kind==='org'); }catch(e){ B.appendChild(el('div','spcempty',e.message)); return; }
    const top=el('div','spcbar');
    if(list.length){ const sel=document.createElement('select'); list.forEach(s=>sel.appendChild(new Option('🏢 '+s.name,s.id))); if(!list.some(s=>s.id===orgId)) orgId=list[0].id; sel.value=orgId; sel.onchange=()=>{ orgId=sel.value; store('cc_org_cur',orgId); renderOrg(); }; top.appendChild(sel); }
    top.append(btn('＋ New organization',async()=>{ const name=await askText('Name your organization','e.g. Sweet Spot Bakery Pvt Ltd'); if(!name) return; try{ const d=await api('/api/spaces',{method:'POST',body:{kind:'org',name}}); orgId=d.space.id; store('cc_org_cur',orgId); renderOrg(); toast('Organization created 🏢'); }catch(e){ toast(e.message); } }),
      btn('Join with a link',async()=>{ const v=await askText('Paste the invite link','https://…/?join=…'); const tok=(String(v||'').match(/join=([\w-]+)/)||[])[1]||String(v||'').trim(); if(!tok) return; try{ const d=await api('/api/join',{method:'POST',body:{token:tok}}); orgId=d.space.id; store('cc_org_cur',orgId); renderOrg(); }catch(e){ toast(e.message); } }));
    B.appendChild(top);
    if(!list.length){ $('orgPageTabs').innerHTML=''; const e=el('div','spcempty'); e.innerHTML='No organization yet.<br>Create one for your company: teamspaces for each team, members and roles, AI policies, a company brain, approvals, an audit log and data controls.'; B.appendChild(e); return; }
    try{ orgData=await api('/api/spaces/'+orgId); }catch(e){ B.appendChild(el('div','spcempty',e.message)); return; }
    const admin=['owner','admin'].includes(orgData.myRole);
    const T=admin?['Overview','Teamspaces','Members','Policies','Company brain','Company rules','Approvals','Audit log','Data']:['Teamspaces','Company brain','Company rules','Approvals'];
    if(!T.includes(orgTab)) orgTab=T[0];
    tabs('orgPage',T,orgTab,(x)=>{ orgTab=x; renderOrg(); });
    const head=el('div','spcmuted',orgData.space.name+' · '+orgData.members.length+' member'+(orgData.members.length===1?'':'s')+' · '+orgData.children.length+' teamspace'+(orgData.children.length===1?'':'s')+' · you are '+orgData.myRole); head.style.marginBottom='10px'; B.appendChild(head);
    const box=el('div'); B.appendChild(box);
    ({'Overview':orgOverview,'Teamspaces':orgTeamspaces,'Members':(b,t)=>{ orgDomain(b,t); membersTab(b,t,renderOrg); },'Policies':orgPolicies,'Company brain':brainTab,'Company rules':standardsTab,'Approvals':orgApprovals,'Audit log':orgAudit,'Data':orgDataTab})[orgTab](box,orgData);
  }
  async function orgOverview(box,t){
    let d; try{ d=await api('/api/spaces/'+t.space.id+'/overview'); }catch(e){ box.textContent=e.message; return; }
    const g=el('div','spcgrid'); [['Members',d.members],['Teamspaces',d.teamspaces],['AI & team actions (30 days)',d.actions30d],['Approvals waiting',d.approvalsWaiting],['Tasks done',d.tasksDone],['Tasks open',d.tasksOpen]].forEach(([k,v])=>{ const c=el('div','stat'); c.appendChild(el('b',null,String(v))); c.appendChild(el('span',null,k)); g.appendChild(c); }); box.appendChild(g);
    const two=el('div','spcgrid'); two.style.marginTop='12px';
    const tbl=(title,obj)=>{ const c=el('div','spccard'); c.appendChild(el('h4',null,title)); const rows=Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,10); if(!rows.length) c.appendChild(el('div','spcmuted','Nothing yet.')); rows.forEach(([k,v])=>{ const r=el('div','spcbar'); r.style.margin='4px 0'; const n=el('span',null,k); n.style.flex='1'; r.append(n,el('b',null,String(v))); c.appendChild(r); }); return c; };
    two.append(tbl('Most active people',d.byPerson),tbl('What is being done',d.byAction)); box.appendChild(two);
    box.appendChild(el('div','spcmuted','Only real counts from your audit log — no guesses.')).style.marginTop='8px';
  }
  async function orgTeamspaces(box,t){
    box.appendChild(el('div','spcmuted','Each team in the company gets its own teamspace — its own chat, tasks, pages, brain, standards and meetings. The company rules and policies apply to all of them.'));
    if(['owner','admin'].includes(t.myRole)){ const inp=el('input','spcin'); inp.placeholder='New teamspace, e.g. Engineering'; const bar=el('div','spcbar'); bar.style.marginTop='10px'; bar.append(inp,btn('Create teamspace',async()=>{ if(!inp.value.trim()) return; try{ await api('/api/spaces',{method:'POST',body:{kind:'teamspace',name:inp.value.trim(),parentId:t.space.id}}); renderOrg(); }catch(e){ toast(e.message); } },'msend')); box.appendChild(bar); }
    const g=el('div','spcgrid'); g.style.marginTop='10px'; box.appendChild(g);
    if(!t.children.length) g.appendChild(el('div','spcempty','No teamspaces yet.'));
    t.children.forEach(c=>{ const k=el('div','spccard'); k.appendChild(el('h3',null,'🏢 '+c.name)); k.appendChild(el('div','spcmuted','created '+ago(c.created)));
      k.appendChild(btn('Open',()=>{ teamId=c.id; store('cc_team_cur',c.id); teamTab='Chat'; showTeam(); },'msend')); g.appendChild(k); });
  }
  function orgDomain(box,t){
    if(!['owner','admin'].includes(t.myRole)) return;
    const c=el('div','spccard'); c.appendChild(el('h4',null,'Company email domain')); c.appendChild(el('div','spcmuted','People who sign in with an email on this domain can join by themselves (e.g. yourcompany.com).'));
    const inp=el('input','spcin'); inp.placeholder='yourcompany.com'; inp.value=t.space.settings?.domain||''; const bar=el('div','spcbar'); bar.style.marginTop='8px';
    bar.append(inp,btn('Save',async()=>{ try{ await api('/api/spaces/'+t.space.id,{method:'PATCH',body:{settings:{domain:inp.value}}}); toast('Saved'); }catch(e){ toast(e.message); } },'msend')); c.appendChild(bar); box.appendChild(c);
  }
  const TOOLS=[['image','Pictures'],['video','Videos'],['audio','Audio files'],['build','Games / websites / apps'],['code','Coding agent in folders'],['files','Local files'],['browser','Opening websites'],['device','Opening apps on computers'],['web','Web search'],['research','Deep research'],['mail','Gmail'],['doc','Office files']];
  function orgPolicies(box,t){
    const st={disabledTools:[],agentMode:'ask',protectedPaths:[],maskPrivate:false,retentionDays:0,instructions:'',...t.space.settings};
    const c1=el('div','spccard'); c1.appendChild(el('h3',null,'AI tools members can use')); c1.appendChild(el('div','spcmuted','Turn off anything your company does not want people to use.'));
    const g=el('div','spcgrid'); g.style.marginTop='8px'; const boxes={};
    TOOLS.forEach(([k,n])=>{ const r=el('label','chk'), cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!st.disabledTools.includes(k); boxes[k]=cb; r.append(cb,el('span',null,n)); g.appendChild(r); }); c1.appendChild(g);
    const c2=el('div','spccard'); c2.appendChild(el('h3',null,'How the coding agent may act'));
    const mode=document.createElement('select'); mode.style.cssText='background:#151515;color:#e6e6e6;border:1px solid #363636;border-radius:10px;padding:8px'; [['readonly','Read only — it explains and suggests, never changes files'],['ask','Ask before changes — every change needs the person’s OK'],['auto','Automatic — it changes files and shows Undo']].forEach(([v,n])=>mode.appendChild(new Option(n,v))); mode.value=st.agentMode; c2.appendChild(mode);
    c2.appendChild(el('h4',null,'Protected files and folders (one per line) — the agent never changes these'));
    const prot=el('textarea','spcta'); prot.value=(st.protectedPaths||[]).join('\n'); c2.appendChild(prot);
    const c3=el('div','spccard'); c3.appendChild(el('h3',null,'Privacy and data'));
    const r1=el('label','chk'), mk=document.createElement('input'); mk.type='checkbox'; mk.checked=st.maskPrivate; r1.append(mk,el('span',null,'Hide private data from the AI — emails, phone numbers, Aadhaar, PAN and card numbers are replaced before anything is sent')); c3.appendChild(r1);
    const r2=el('div','spcbar'); r2.style.marginTop='8px'; const days=el('input','spcin'); days.type='number'; days.min='0'; days.value=st.retentionDays||0; days.style.maxWidth='120px'; r2.append(el('span',null,'Delete team chat messages after'),days,el('span','spcmuted','days (0 = keep)')); c3.appendChild(r2);
    const c4=el('div','spccard'); c4.appendChild(el('h3',null,'Company instructions')); c4.appendChild(el('div','spcmuted','How CodeConClave should talk and work for your company — brand voice, what to avoid, who to send people to.'));
    const ins=el('textarea','spcta'); ins.value=st.instructions||''; ins.style.marginTop='8px'; c4.appendChild(ins);
    const save=btn('Save policies',async()=>{ try{ await api('/api/spaces/'+t.space.id,{method:'PATCH',body:{settings:{disabledTools:TOOLS.map(([k])=>k).filter(k=>!boxes[k].checked),agentMode:mode.value,protectedPaths:prot.value.split('\n').map(s=>s.trim()).filter(Boolean),maskPrivate:mk.checked,retentionDays:Number(days.value)||0,instructions:ins.value}}}); toast('Policies saved — they apply to every member now.'); }catch(e){ toast(e.message); } },'msend');
    box.append(c1,c2,c3,c4,save);
  }
  async function orgApprovals(box,t){
    const admin=['owner','admin'].includes(t.myRole);
    box.appendChild(el('div','spcmuted','Big or risky things go through an approval: a production deploy, a payments change, deleting data, a new tool. Members ask; admins approve or reject — and it is all in the audit log.'));
    const c=el('div','spccard'); const ti=el('input','spcin'); ti.placeholder='What needs approval?'; ti.style.width='100%'; const why=el('textarea','spcta'); why.placeholder='Why, and what could go wrong'; why.style.marginTop='8px';
    c.append(ti,why,btn('Ask for approval',async()=>{ if(!ti.value.trim()) return; await putItem(t.space,'approval',nid(),{title:ti.value.trim(),reason:why.value.trim(),status:'waiting'}); ti.value=''; why.value=''; draw(); toast('Sent to the admins'); },'msend')); box.appendChild(c);
    const list=el('div'); box.appendChild(list);
    async function draw(){ list.innerHTML=''; const all=await items(t.space,'approval'); if(!all.length) list.appendChild(el('div','spcempty','No approvals yet.'));
      all.forEach(a=>{ const d=a.data, k=el('div','spccard'); const h=el('div','spcbar'); h.appendChild(el('b',null,d.title)); h.appendChild(el('span','rolepill',{waiting:'⏳ waiting',approved:'✅ approved',rejected:'⛔ rejected'}[d.status]||d.status)); k.appendChild(h);
        k.appendChild(el('div','spcmuted','asked by '+(d.byName||'')+' · '+ago(d.at)+(d.decidedBy?' · decided by '+d.decidedBy:''))); if(d.reason) k.appendChild(el('div',null,d.reason)).style.marginTop='6px';
        if(admin && d.status==='waiting'){ const b=el('div','spcbar'); b.style.marginTop='8px'; b.append(btn('Approve',async()=>{ await putItem(t.space,'approval',a.id,{...d,status:'approved',decidedBy:me?.name||me?.email,decidedAt:Date.now()}); draw(); },'msend'),btn('Reject',async()=>{ await putItem(t.space,'approval',a.id,{...d,status:'rejected',decidedBy:me?.name||me?.email,decidedAt:Date.now()}); draw(); })); k.appendChild(b); }
        list.appendChild(k); }); }
    draw();
  }
  async function orgAudit(box,t){
    const bar=el('div','spcbar'); const dl=Object.assign(document.createElement('a'),{href:'/api/spaces/'+t.space.id+'/audit.csv',className:'msend',textContent:'⬇ Download as CSV'}); bar.appendChild(dl); box.appendChild(bar);
    box.appendChild(el('div','spcmuted','Who did what, when — in the organization and every teamspace. The AI’s use is logged by tool only, never the content of chats.')).style.margin='8px 0';
    const tb=document.createElement('table'); tb.className='audit'; tb.innerHTML='<tr><th>When</th><th>Who</th><th>Action</th><th>Where</th><th>Detail</th></tr>'; box.appendChild(tb);
    for(const r of await items(t.space,'audit')){ const tr=document.createElement('tr'); [new Date(r.data.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}),r.data.whoName,r.data.action,r.data.space,r.data.detail].forEach(v=>tr.appendChild(el('td',null,v||''))); tb.appendChild(tr); }
  }
  function orgDataTab(box,t){
    const c=el('div','spccard'); c.appendChild(el('h3',null,'Export everything')); c.appendChild(el('div','spcmuted','All members, teamspaces, pages, tasks, knowledge, rules, approvals and the audit log — as one JSON file.'));
    c.appendChild(Object.assign(document.createElement('a'),{href:'/api/spaces/'+t.space.id+'/export',className:'msend',textContent:'⬇ Export organization data'})); box.appendChild(c);
    if(t.myRole!=='owner') return;
    const d=el('div','spccard'); d.appendChild(el('h3',null,'Delete the organization')); d.appendChild(el('div','spcmuted','This deletes the organization, all its teamspaces and everything in them. It cannot be undone.'));
    const inp=el('input','spcin'); inp.placeholder='Type the organization name to confirm'; const bar=el('div','spcbar'); bar.style.marginTop='8px';
    bar.append(inp,btn('Delete forever',async()=>{ if(inp.value.trim()!==t.space.name) return toast('Type the exact name first.'); try{ await api('/api/spaces/'+t.space.id,{method:'DELETE'}); orgId=null; store('cc_org_cur',null); renderOrg(); toast('Organization deleted.'); }catch(e){ toast(e.message); } })); d.appendChild(bar); box.appendChild(d);
  }

  // an invite link (?join=…) opens the right space after sign-in
  async function handleJoin(){
    const tok=new URLSearchParams(location.search).get('join'); if(!tok) return;
    if(!me){ toast('Sign in to join the team'); showAuth(false); return; }
    try{ const d=await api('/api/join',{method:'POST',body:{token:tok}}); history.replaceState(null,'','/'); if(d.space.kind==='org'){ orgId=d.space.id; store('cc_org_cur',orgId); showOrg(); } else { teamId=d.space.id; store('cc_team_cur',teamId); showTeam(); } toast('Welcome to '+d.space.name+' 🎉'); }
    catch(e){ toast(e.message); }
  }
  // invite links belong to the Team / Organization pages now
  if(new URLSearchParams(location.search).get('join')) location.replace('/team'+location.search);
  window.ccSpaces={showSolo,showTeam,showOrg,policy:()=>api('/api/my-policy').then(d=>d.policy).catch(()=>null)};
})();
