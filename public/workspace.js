// CodeConClave Team (/team) and Organization (/org) — two separate full pages on one design.
//   Team: chat with @CodeConClave, tasks, pages, team brain, standards, meetings, members
//   Organization: overview, teamspaces, members, policies, company brain, company rules, approvals, audit log, data
(function(){
  const {$,el,ico,ICONS,toast,api,store,ago,btn,askText,loadMe,signIn,signOut}=cc;
  const KIND=location.pathname.startsWith('/org')?'org':'team';
  const T=KIND==='org'?{name:'Organization',color:'#f2c200',word:'organization',icon:ICONS.org}:{name:'Team',color:'#5fd38d',word:'team',icon:ICONS.team};
  document.title='CodeConClave '+T.name;
  const app=$('app'); let space=null, data=null, tab=null, poll=null;
  const nid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const initials=(s)=>String(s||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
  const hue=(s)=>{ let h=0; for(const c of String(s)) h=(h*31+c.charCodeAt(0))%360; return h; };
  const avatar=(name,round)=>{ const a=el('div','av'+(round?' round':''),initials(name)); a.style.background='hsl('+hue(name)+' 65% 62%)'; return a; };
  const items=async(kind,since)=>(await api('/api/spaces/'+space.id+'/items/'+kind+(since?'?since='+since:''))).items;
  const putItem=(kind,id,d)=>api('/api/spaces/'+space.id+'/items/'+kind+'/'+encodeURIComponent(id),{method:'PUT',body:{data:d}});
  const delItem=(kind,id)=>api('/api/spaces/'+space.id+'/items/'+kind+'/'+encodeURIComponent(id),{method:'DELETE'});
  const isAdmin=()=>['owner','admin'].includes(data?.myRole);

  // ---------- start: sign in -> join / pick / create -> the workspace ----------
  async function boot(){
    await loadMe();
    const q=new URLSearchParams(location.search);
    if(!cc.me){ return welcome(q.get('join')); }
    if(q.get('join')){ try{ const d=await api('/api/join',{method:'POST',body:{token:q.get('join')}}); history.replaceState(null,'',location.pathname);
        if(d.space.kind==='org' && KIND!=='org') return location.replace('/org?space='+d.space.id); if(d.space.kind!=='org' && KIND==='org') return location.replace('/team?space='+d.space.id);
        store('cc_'+KIND+'_cur',d.space.id); toast('Welcome to '+d.space.name+' 🎉'); }catch(e){ toast(e.message); } }
    if(q.get('space')){ store('cc_'+KIND+'_cur',q.get('space')); history.replaceState(null,'',location.pathname); }
    await openSpace(store('cc_'+KIND+'_cur'));
  }
  function welcome(join){
    app.innerHTML=''; const c=el('div','center'), w=el('div','welcome');
    w.innerHTML='<img src="/logo.png" alt="CodeConClave">'; w.appendChild(el('h1',null,'CodeConClave '+T.name));
    w.appendChild(el('div','k-muted',KIND==='org'?'Your company’s AI workspace — teamspaces for every department, AI policies, approvals and an audit log.':'Your team’s AI workspace — a team chat with CodeConClave in it, a tasks board, pages, a shared brain and meeting notes.'));
    const r=el('div','k-row'); r.style.justifyContent='center';
    r.append(btn('Create free account',async()=>{ if(await signIn('signup',join?'Create your account to join the '+T.word+'.':'')) boot(); },'pri'),btn('Sign in',async()=>{ if(await signIn('signin')) boot(); }));
    w.appendChild(r); const back=el('div','k-muted k-small'); back.style.marginTop='22px'; back.innerHTML='<a href="/?home=1">← All plans</a>'; w.appendChild(back);
    c.appendChild(w); app.appendChild(c);
  }
  async function mySpaces(){ return (await api('/api/spaces')).spaces.filter(s=>KIND==='org'?s.kind==='org':s.kind==='team'||s.kind==='teamspace'); }
  async function openSpace(id){
    let list=[]; try{ list=await mySpaces(); }catch(e){ app.textContent=e.message; return; }
    if(!list.length) return firstRun();
    space=list.find(s=>s.id===id)||list[0]; store('cc_'+KIND+'_cur',space.id);
    try{ data=await api('/api/spaces/'+space.id); space=data.space; }catch(e){ toast(e.message); return firstRun(); }
    shell(list);
  }
  function firstRun(){
    app.innerHTML=''; const c=el('div','center'), w=el('div','welcome');
    w.innerHTML='<img src="/logo.png" alt="CodeConClave">'; w.appendChild(el('h1',null,KIND==='org'?'Set up your organization':'Create your team'));
    w.appendChild(el('div','k-muted',KIND==='org'?'Give it your company’s name. Then add teamspaces, invite people and set your AI policies.':'Give your team a name, then invite your teammates with a link.'));
    const card=el('div','k-card'), inp=el('input','k-in'); inp.placeholder=KIND==='org'?'Company name, e.g. Sweet Spot Pvt Ltd':'Team name, e.g. Product team';
    const go=btn((KIND==='org'?'Create organization':'Create team')+' '+ico(ICONS.arrow),async()=>{ if(!inp.value.trim()) return toast('Type a name first.'); go.disabled=true;
      try{ const d=await api('/api/spaces',{method:'POST',body:{kind:KIND,name:inp.value.trim()}}); await api('/api/me/plan',{method:'POST',body:{plan:KIND}}).catch(()=>{}); openSpace(d.space.id); }catch(e){ toast(e.message); go.disabled=false; } },'pri');
    inp.onkeydown=(e)=>{ if(e.key==='Enter') go.click(); }; go.style.cssText='width:100%;margin-top:10px';
    card.append(inp,go); w.appendChild(card);
    const j=el('div','k-card'); j.appendChild(el('div','k-muted k-small','Got an invite link?')); const ji=el('input','k-in'); ji.placeholder='Paste the invite link'; ji.style.marginTop='8px';
    j.append(ji,btn('Join',()=>{ const tok=(ji.value.match(/join=([\w-]+)/)||[])[1]||ji.value.trim(); if(tok) location.href=location.pathname+'?join='+encodeURIComponent(tok); }));
    j.lastChild.style.marginTop='8px'; w.appendChild(j);
    const back=el('div','k-muted k-small'); back.style.marginTop='18px'; back.innerHTML='<a href="/?home=1">← All plans</a> · <a href="/solo">Solo</a>'; w.appendChild(back);
    c.appendChild(w); app.appendChild(c);
  }

  // ---------- the workspace shell ----------
  const NAV_TEAM=[['Chat',ICONS.chat],['Tasks',ICONS.tasks],['Pages',ICONS.page],['Team brain',ICONS.brain],['Standards',ICONS.rule],['Meetings',ICONS.meet],['Members',ICONS.people]];
  const NAV_ORG_ADMIN=[['Overview',ICONS.chart],['Teamspaces',ICONS.spaces],['Members',ICONS.people],['Policies',ICONS.policy],['Company brain',ICONS.brain],['Company rules',ICONS.rule],['Approvals',ICONS.check],['Audit log',ICONS.log],['Data',ICONS.data]];
  const NAV_ORG=[['Teamspaces',ICONS.spaces],['Company brain',ICONS.brain],['Company rules',ICONS.rule],['Approvals',ICONS.check]];
  function shell(list){
    clearInterval(poll);
    const nav=KIND==='org'?(isAdmin()?NAV_ORG_ADMIN:NAV_ORG):NAV_TEAM;
    if(!tab||!nav.some(n=>n[0]===tab)) tab=store('cc_'+KIND+'_tab')||nav[0][0]; if(!nav.some(n=>n[0]===tab)) tab=nav[0][0];
    app.innerHTML=''; const ws=el('div','ws');
    const side=el('aside','side'); const top=el('div','top'); top.innerHTML='<a href="/?home=1"><img src="/logo.png" alt="CodeConClave"></a>'; const kt=el('span','kindtag',T.name); kt.style.background=T.color+'22'; kt.style.color=T.color; top.appendChild(kt); side.appendChild(top);
    const sw=el('button','switch'); sw.appendChild(avatar(space.name)); const nm=el('div','nm'); nm.appendChild(el('b',null,space.name)); nm.appendChild(el('span',null,data.members.length+' member'+(data.members.length===1?'':'s')+' · '+data.myRole)); sw.appendChild(nm); sw.insertAdjacentHTML('beforeend',ico(ICONS.down));
    sw.onclick=(e)=>{ e.stopPropagation(); switcher(sw,list); }; side.appendChild(sw);
    const nv=el('div','nav'); nav.forEach(([n,ic])=>{ const b=el('button',n===tab?'on':null); b.innerHTML=ico(ic)+' '+n; b.onclick=()=>{ tab=n; store('cc_'+KIND+'_tab',n); document.body.classList.remove('open'); shell(list); }; nv.appendChild(b); });
    if(KIND==='team' && space.kind==='teamspace'){ nv.appendChild(el('div','lbl','Company')); const b=el('button'); b.innerHTML=ico(ICONS.org)+' Organization console'; b.onclick=()=>location.href='/org'; nv.appendChild(b); }
    side.appendChild(nv);
    const foot=el('div','foot'), me=el('div','me'); me.appendChild(avatar(cc.me.name||cc.me.email,true)); me.appendChild(el('div','nm',cc.me.name||cc.me.email)); const so=el('button','k-btn sm'); so.innerHTML=ico(ICONS.out); so.title='Sign out'; so.onclick=signOut; me.appendChild(so); foot.appendChild(me);
    const ot=el('div','others'); [['Solo','/solo'],['Team','/team'],['Organization','/org']].filter(([n])=>n!==T.name).forEach(([n,h])=>{ const a=el('a',null,n); a.href=h; ot.appendChild(a); }); foot.appendChild(ot); side.appendChild(foot);
    const main=el('main','main'), head=el('div','head'); const bg=el('button','burger'); bg.innerHTML=ico(ICONS.menu); bg.onclick=()=>document.body.classList.toggle('open'); head.appendChild(bg);
    const h1=el('h1'); h1.innerHTML=ico((nav.find(n=>n[0]===tab)||nav[0])[1])+' '; h1.append(tab); head.appendChild(h1); const acts=el('div','k-row'); acts.id='acts'; head.appendChild(acts);
    const body=el('div','body'), inner=el('div','inner'); body.appendChild(inner); main.append(head,body); ws.append(side,main); app.appendChild(ws);
    document.addEventListener('click',closeMenus);
    const R={'Chat':pChat,'Tasks':pTasks,'Pages':pPages,'Team brain':pBrain,'Company brain':pBrain,'Standards':pRules,'Company rules':pRules,'Meetings':pMeetings,'Members':pMembers,
      'Overview':pOverview,'Teamspaces':pTeamspaces,'Policies':pPolicies,'Approvals':pApprovals,'Audit log':pAudit,'Data':pData}[tab];
    R(inner,acts);
  }
  function closeMenus(){ document.querySelectorAll('.menu').forEach(m=>m.remove()); }
  function switcher(anchor,list){
    closeMenus(); const m=el('div','menu'); const r=anchor.getBoundingClientRect(); m.style.left=r.left+'px'; m.style.top=(r.bottom+6)+'px';
    list.forEach(s=>{ const b=el('button'); b.appendChild(avatar(s.name)); b.append(s.name+(s.kind==='teamspace'?' (teamspace)':'')); if(s.id===space.id) b.insertAdjacentHTML('beforeend',ico(ICONS.check)); b.onclick=()=>openSpace(s.id); m.appendChild(b); });
    m.appendChild(el('hr'));
    const nb=el('button'); nb.innerHTML=ico(ICONS.plus)+' New '+T.word; nb.onclick=async()=>{ const n=await askText('Name the new '+T.word,KIND==='org'?'e.g. Sweet Spot Pvt Ltd':'e.g. Design team'); if(!n) return; try{ const d=await api('/api/spaces',{method:'POST',body:{kind:KIND,name:n}}); openSpace(d.space.id); }catch(e){ toast(e.message); } }; m.appendChild(nb);
    const jb=el('button'); jb.innerHTML=ico(ICONS.arrow)+' Join with an invite link'; jb.onclick=async()=>{ const v=await askText('Paste the invite link','https://…?join=…'); const tok=(String(v||'').match(/join=([\w-]+)/)||[])[1]||String(v||'').trim(); if(tok) location.href=location.pathname+'?join='+encodeURIComponent(tok); }; m.appendChild(jb);
    document.body.appendChild(m);
  }

  // ---------- TEAM pages ----------
  async function pChat(box){
    const c=el('div','chat'), log=el('div','log'); c.appendChild(log); box.parentElement.style.paddingBottom='0';
    let last=0; const seen=new Set();
    const add=(m)=>{ const d=m.data, row=el('div','msg'+(d.ai?' ai':'')); if(d.ai){ const a=el('div','av round'); a.style.background='#111'; a.innerHTML='<img src="/icon-192.png" alt="" style="width:32px;height:32px;border-radius:50%">'; row.appendChild(a); } else row.appendChild(avatar(d.byName,true));
      const t=el('div'); t.style.minWidth='0'; const w=el('div','who',d.byName||''); w.appendChild(el('span',null,ago(d.at))); t.appendChild(w); t.appendChild(el('div','txt',d.text)); row.appendChild(t); log.appendChild(row); };
    const pull=async()=>{ try{ const list=(await items('message',last)).reverse(); for(const m of list){ last=Math.max(last,m.updated); if(seen.has(m.id)) continue; seen.add(m.id); log.querySelector('.empty')?.remove(); add(m); } if(list.length) log.scrollTop=log.scrollHeight; }catch{} };
    log.appendChild(el('div','empty','This is the start of '+space.name+'’s chat.\nMention @CodeConClave to ask the AI — it knows your team brain and standards.'));
    await pull();
    const comp=el('div','composer'), ta=document.createElement('textarea'); ta.rows=1; ta.placeholder='Message '+space.name+' — type @CodeConClave to ask the AI';
    ta.oninput=()=>{ ta.style.height='auto'; ta.style.height=Math.min(160,ta.scrollHeight)+'px'; };
    const send=async()=>{ const text=ta.value.trim(); if(!text) return; ta.value=''; ta.oninput(); if(/@(codeconclave|cc|ai)\b/i.test(text)) toast('CodeConClave is thinking…'); try{ await api('/api/spaces/'+space.id+'/channel',{method:'POST',body:{text}}); await pull(); }catch(e){ toast(e.message); } };
    ta.onkeydown=(e)=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } };
    const sb=btn(ico(ICONS.arrow),send,'pri sm'); comp.append(ta,sb); c.appendChild(comp); box.appendChild(c);
    if(data.myRole==='guest'){ ta.disabled=true; ta.placeholder='Guests can read the chat'; }
    poll=setInterval(()=>{ if(!document.body.contains(log)) return clearInterval(poll); pull(); },4000);
  }
  async function pTasks(box,acts){
    const out=el('div');
    acts.append(btn('📋 Standup',async()=>{ out.innerHTML='<div class="k-muted">Writing the standup…</div>'; try{ const d=await api('/api/spaces/'+space.id+'/ai/standup',{method:'POST',body:{}}); out.innerHTML=''; const c=el('div','k-card'); c.appendChild(el('b',null,'Standup')); const t=el('div',null,d.text); t.style.cssText='white-space:pre-wrap;margin-top:8px;line-height:1.55'; c.appendChild(t); out.appendChild(c); }catch(e){ out.textContent=e.message; } },'sm'),
      btn('🚀 Release notes',async()=>{ out.innerHTML='<div class="k-muted">Writing release notes…</div>'; try{ const d=await api('/api/spaces/'+space.id+'/ai/release-notes',{method:'POST',body:{}}); out.innerHTML=''; const c=el('div','k-card'); c.appendChild(el('b',null,'Release notes')); const t=el('div',null,d.text); t.style.cssText='white-space:pre-wrap;margin-top:8px;line-height:1.55'; c.appendChild(t); out.appendChild(c); }catch(e){ out.textContent=e.message; } },'sm'));
    const bar=el('div','bar'), inp=el('input','k-in'); inp.placeholder='Add a task and press Enter'; inp.style.flex='1';
    const add=async()=>{ const title=inp.value.trim(); if(!title) return; inp.value=''; try{ await putItem('task',nid(),{title,status:'todo'}); draw(); }catch(e){ toast(e.message); } };
    inp.onkeydown=(e)=>{ if(e.key==='Enter') add(); }; bar.append(inp,btn(ico(ICONS.plus)+' Add',add,'pri'));
    const kan=el('div','kan'); box.append(bar,out,kan); out.style.marginBottom='14px';
    const COLS=[['todo','To do'],['doing','Doing'],['done','Done']];
    async function draw(){ const list=await items('task'); kan.innerHTML='';
      COLS.forEach(([k,name],ci)=>{ const mine=list.filter(x=>(x.data.status||'todo')===k), col=el('div','col'); const h=el('h4'); h.append(el('span',null,name),el('span',null,String(mine.length))); col.appendChild(h);
        if(!mine.length) col.appendChild(el('div','k-muted k-small',ci===0?'Nothing to do yet.':ci===1?'Nothing in progress.':'Nothing finished yet.'));
        mine.forEach(x=>{ const d=x.data, c=el('div','tcard'); c.appendChild(el('div','t',d.title)); const meta=[d.assigneeName?'👤 '+d.assigneeName:'',d.estimate?'⏱ '+d.estimate:'',d.risk?'risk '+d.risk:''].filter(Boolean).join(' · '); c.appendChild(el('div','m',meta||'added by '+(d.byName||'')+' · '+ago(d.at||x.updated)));
          if(d.steps?.length){ const ul=el('ul'); d.steps.forEach(s=>ul.appendChild(el('li',null,s))); c.appendChild(ul); }
          const a=el('div','acts');
          if(ci>0) a.appendChild(btn('←',async()=>{ await putItem('task',x.id,{...d,status:COLS[ci-1][0]}); draw(); },'sm'));
          if(ci<2) a.appendChild(btn('→',async()=>{ await putItem('task',x.id,{...d,status:COLS[ci+1][0]}); draw(); },'sm'));
          const who=document.createElement('select'); who.appendChild(new Option('Assign…','')); data.members.forEach(m=>who.appendChild(new Option(m.name||m.email,m.name||m.email))); who.value=d.assigneeName||''; who.onchange=async()=>{ await putItem('task',x.id,{...d,assigneeName:who.value}); draw(); }; a.appendChild(who);
          const pb=btn('✨ Plan',async()=>{ pb.textContent='Planning…'; try{ const p=await api('/api/spaces/'+space.id+'/ai/plan-task',{method:'POST',body:{title:d.title,detail:d.detail||''}}); await putItem('task',x.id,{...d,steps:p.steps,acceptance:p.acceptance,risk:p.risk,estimate:p.estimate}); draw(); }catch(e){ toast(e.message); pb.textContent='✨ Plan'; } },'sm'); a.appendChild(pb);
          a.appendChild(btn('✕',async()=>{ await delItem('task',x.id); draw(); },'sm'));
          c.appendChild(a); col.appendChild(c); });
        kan.appendChild(col); }); }
    draw();
  }
  async function pPages(box,acts){
    const wrap=el('div','pages'), left=el('div','plist'), right=el('div'); wrap.append(left,right); box.appendChild(wrap);
    let cur=null;
    acts.appendChild(btn(ico(ICONS.plus)+' New page',()=>openPage({id:nid(),data:{title:'Untitled',body:'',comments:[]}},true),'pri sm'));
    async function drawList(){ left.innerHTML=''; const list=await items('page'); if(!list.length) left.appendChild(el('div','k-muted k-small','No pages yet. Make the first one.')); list.forEach(p=>{ const b=el('button',cur&&cur.id===p.id?'on':null,'📄 '+(p.data.title||'Untitled')); b.onclick=()=>openPage(p); left.appendChild(b); }); if(!cur&&list[0]) openPage(list[0]); }
    function openPage(p,fresh){ cur=p; right.innerHTML=''; const d={comments:[],...p.data};
      const title=el('input','ptitle'); title.value=d.title||''; const body=el('textarea','k-ta'); body.value=d.body||''; body.style.minHeight='360px'; body.placeholder='Write in Markdown — # headings, - lists, tables…';
      const bar=el('div','bar'); bar.style.marginTop='10px';
      const save=async()=>{ try{ await putItem('page',p.id,{...d,title:title.value.trim()||'Untitled',body:body.value}); toast('Saved ✅'); cur={...p,data:{...d,title:title.value,body:body.value}}; drawList(); }catch(e){ toast(e.message); } };
      const hist=el('div');
      const wb=btn('✨ Write with AI',async()=>{ const what=await askText('What should the page be about?','e.g. How we onboard a new developer',title.value==='Untitled'?'':title.value); if(!what) return; wb.textContent='Writing…'; try{ const r=await api('/api/spaces/'+space.id+'/ai/write-page',{method:'POST',body:{prompt:what}}); body.value=r.body; if(!title.value||title.value==='Untitled') title.value=what.slice(0,80); }catch(e){ toast(e.message); } wb.textContent='✨ Write with AI'; });
      bar.append(btn('Save',save,'pri'),wb,btn('History ('+(d.history||[]).length+')',()=>{ hist.innerHTML=''; (d.history||[]).forEach(v=>{ const r=el('div','row'); const g=el('div','grow'); g.appendChild(el('b',null,v.title)); g.appendChild(el('div','k-muted',ago(v.at)+' · '+(v.byName||''))); r.append(g,btn('Restore',()=>{ title.value=v.title; body.value=v.body; toast('Restored — press Save to keep it.'); },'sm')); hist.appendChild(r); }); if(!(d.history||[]).length) toast('No earlier versions yet.'); }),
        btn('Delete',async()=>{ if(!confirm('Delete this page?')) return; await delItem('page',p.id); cur=null; right.innerHTML=''; drawList(); }));
      const com=el('div','k-card'); com.style.marginTop='14px'; com.appendChild(el('b',null,'Comments'));
      (d.comments||[]).forEach(c=>{ const r=el('div'); r.style.margin='10px 0'; r.appendChild(el('div','k-muted k-small',c.byName+' · '+ago(c.at))); r.appendChild(el('div',null,c.text)); com.appendChild(r); });
      const ci=el('input','k-in'); ci.placeholder='Add a comment and press Enter'; ci.style.marginTop='10px'; ci.onkeydown=async(e)=>{ if(e.key!=='Enter'||!ci.value.trim()) return; d.comments=[...(d.comments||[]),{byName:cc.me.name||cc.me.email,text:ci.value.trim(),at:Date.now()}]; ci.value=''; await putItem('page',p.id,{...d,title:title.value,body:body.value}); openPage({...p,data:d}); }; com.appendChild(ci);
      right.append(title,body,bar,hist,com); if(fresh) title.select(); }
    drawList();
  }
  async function pBrain(box){
    const org=space.kind==='org';
    box.appendChild(el('div','k-muted',(org?'The company brain':'The team brain')+' — notes, docs and files everyone shares. Ask anything and CodeConClave answers from them, with sources'+(org?', across every teamspace.':'.')));
    const bar=el('div','bar'); bar.style.marginTop='14px'; const ask=el('input','k-in'); ask.style.flex='1'; ask.placeholder=org?'Ask the company brain… e.g. Which team owns billing?':'Ask the team brain… e.g. How do we deploy?'; const ans=el('div');
    const go=async()=>{ const q=ask.value.trim(); if(!q) return; ans.innerHTML='<div class="k-muted">Looking through your knowledge…</div>'; try{ const d=await api('/api/spaces/'+space.id+'/ask',{method:'POST',body:{question:q}}); ans.innerHTML=''; const c=el('div','k-card'); const t=el('div',null,d.answer); t.style.cssText='white-space:pre-wrap;line-height:1.6'; c.appendChild(t); if(d.sources?.length){ const s=el('div','src'); d.sources.forEach(x=>s.appendChild(el('span',null,'['+x.n+'] '+x.title+(org&&x.space?' · '+x.space:'')))); c.appendChild(s); } ans.appendChild(c); }catch(e){ ans.textContent=e.message; } };
    ask.onkeydown=(e)=>{ if(e.key==='Enter') go(); }; bar.append(ask,btn('Ask',go,'pri')); box.append(bar,ans);
    if(data.myRole==='guest') return;
    box.appendChild(el('div','sec','Add knowledge'));
    const card=el('div','k-card'), ti=el('input','k-in'); ti.placeholder='Title, e.g. How we deploy'; const tx=el('textarea','k-ta'); tx.placeholder='Paste the text, or pick a file'; tx.style.marginTop='10px';
    const file=document.createElement('input'); file.type='file'; file.accept='.txt,.md,.csv,.json,.html,.js,.ts,.py'; file.onchange=async()=>{ const f=file.files[0]; if(!f) return; try{ tx.value=(await f.text()).slice(0,100000); if(!ti.value) ti.value=f.name; }catch{ toast('Could not read that file.'); } };
    const r=el('div','bar'); r.style.margin='10px 0 0'; r.append(file,btn('Save to the brain',async()=>{ if(!ti.value.trim()||!tx.value.trim()) return toast('Add a title and some text.'); try{ await putItem('knowledge',nid(),{title:ti.value.trim(),body:tx.value}); ti.value=''; tx.value=''; file.value=''; drawK(); toast('Added — everyone can ask about it now.'); }catch(e){ toast(e.message); } },'pri'));
    card.append(ti,tx,r); box.appendChild(card);
    box.appendChild(el('div','sec','In the brain')); const kl=el('div','grid'); box.appendChild(kl);
    async function drawK(){ kl.innerHTML=''; const list=await items('knowledge'); if(!list.length) kl.appendChild(el('div','k-muted','Nothing yet.')); list.forEach(k=>{ const c=el('div','k-card'); c.appendChild(el('b',null,k.data.title)); c.appendChild(el('div','k-muted k-small',(k.data.body||'').slice(0,140)+'…')).style.margin='6px 0'; c.appendChild(el('div','k-muted k-small','by '+(k.data.byName||'')+' · '+ago(k.updated))); c.appendChild(btn('Delete',async()=>{ await delItem('knowledge',k.id); drawK(); },'sm')).style.marginTop='8px'; kl.appendChild(c); }); }
    drawK();
  }
  async function pRules(box){
    const org=space.kind==='org';
    box.appendChild(el('div','k-muted',(org?'Company-wide rules':'Team standards')+' — naming, libraries, testing, forbidden patterns, how to review. CodeConClave follows them for everyone'+(org?' in the company.':' in the team.')+' Only admins can change them.'));
    if(isAdmin()){ const bar=el('div','bar'); bar.style.marginTop='14px'; const inp=el('input','k-in'); inp.style.flex='1'; inp.placeholder='e.g. Every API change needs a test and a docs update'; const add=async()=>{ if(!inp.value.trim()) return; await putItem('rule',nid(),{text:inp.value.trim().slice(0,300)}); inp.value=''; draw(); }; inp.onkeydown=(e)=>{ if(e.key==='Enter') add(); }; bar.append(inp,btn(ico(ICONS.plus)+' Add rule',add,'pri')); box.appendChild(bar); }
    const list=el('div'); list.style.marginTop='12px'; box.appendChild(list);
    async function draw(){ list.innerHTML=''; const rules=await items('rule'); if(!rules.length) list.appendChild(el('div','empty','No rules yet.'));
      rules.forEach(r=>{ const row=el('div','row'); row.insertAdjacentHTML('beforeend',ico(ICONS.rule)); const g=el('div','grow',r.data.text); row.appendChild(g); if(isAdmin()) row.appendChild(btn('Delete',async()=>{ await delItem('rule',r.id); draw(); },'sm')); list.appendChild(row); }); }
    draw();
  }
  async function pMeetings(box){
    box.appendChild(el('div','k-muted','Paste the meeting notes or transcript. CodeConClave writes the summary, the decisions and the action items — and every action item becomes a task on the board.'));
    const ta=el('textarea','k-ta'); ta.style.marginTop='14px'; ta.placeholder='Paste the meeting notes or transcript…'; const bar=el('div','bar'); bar.style.marginTop='10px';
    const go=btn('✨ Summarize + make tasks',async()=>{ if(ta.value.trim().length<40) return toast('Paste the notes first.'); go.textContent='Working…'; go.disabled=true; try{ await api('/api/spaces/'+space.id+'/ai/meeting',{method:'POST',body:{transcript:ta.value}}); ta.value=''; toast('Done — the action items are on the Tasks board.'); draw(); }catch(e){ toast(e.message); } go.textContent='✨ Summarize + make tasks'; go.disabled=false; },'pri');
    bar.appendChild(go); const out=el('div'); box.append(ta,bar,out);
    async function draw(){ out.innerHTML=''; const list=await items('meeting'); if(list.length) out.appendChild(el('div','sec','Meetings'));
      list.forEach(m=>{ const c=el('div','k-card'); c.style.marginBottom='12px'; c.appendChild(el('b',null,m.data.title)); c.appendChild(el('div','k-muted k-small',ago(m.updated)+' · '+(m.data.byName||''))); const s=el('div',null,m.data.summary); s.style.cssText='white-space:pre-wrap;margin-top:10px;line-height:1.55'; c.appendChild(s);
        if(m.data.decisions?.length){ c.appendChild(el('div','sec','Decisions')); const ul=el('ul'); m.data.decisions.forEach(x=>ul.appendChild(el('li',null,x))); c.appendChild(ul); }
        if(m.data.actions?.length){ c.appendChild(el('div','sec','Action items')); const ul=el('ul'); m.data.actions.forEach(x=>ul.appendChild(el('li',null,x))); c.appendChild(ul); }
        out.appendChild(c); }); }
    draw();
  }
  async function pMembers(box){
    if(KIND==='org' && isAdmin()){ const c=el('div','k-card'); c.style.marginBottom='14px'; c.appendChild(el('b',null,'Company email domain')); c.appendChild(el('div','k-muted k-small','People who sign up with an email on this domain can join by themselves (e.g. yourcompany.com).')).style.margin='4px 0 10px';
      const r=el('div','bar'); r.style.margin='0'; const inp=el('input','k-in'); inp.style.flex='1'; inp.placeholder='yourcompany.com'; inp.value=space.settings?.domain||''; r.append(inp,btn('Save',async()=>{ try{ await api('/api/spaces/'+space.id,{method:'PATCH',body:{settings:{domain:inp.value}}}); toast('Saved'); }catch(e){ toast(e.message); } },'pri')); c.appendChild(r); box.appendChild(c); }
    if(isAdmin()){ const c=el('div','k-card'); c.style.marginBottom='14px'; c.appendChild(el('b',null,'Invite people')); c.appendChild(el('div','k-muted k-small','Make a link and send it to them — it works for 14 days.')).style.margin='4px 0 10px';
      const r=el('div','bar'); r.style.margin='0'; const role=el('select','k-sel'); role.style.width='auto'; [['member','Member'],['admin','Admin'],['guest','Guest (read only)']].forEach(([v,n])=>role.appendChild(new Option(n,v)));
      const link=el('input','k-in'); link.readOnly=true; link.style.flex='1'; link.placeholder='Press “Make invite link”';
      r.append(role,btn('Make invite link',async()=>{ try{ const d=await api('/api/spaces/'+space.id+'/invites',{method:'POST',body:{role:role.value}}); link.value=location.origin+(KIND==='org'?'/org':'/team')+'?join='+d.token; link.select(); try{ await navigator.clipboard.writeText(link.value); toast('Invite link copied'); }catch{} }catch(e){ toast(e.message); } },'pri'),link); c.appendChild(r); box.appendChild(c); }
    box.appendChild(el('div','sec',data.members.length+' member'+(data.members.length===1?'':'s')));
    data.members.forEach(m=>{ const row=el('div','row'); row.appendChild(avatar(m.name||m.email,true)); const g=el('div','grow'); g.appendChild(el('b',null,(m.name||m.email)+(String(m.id)===String(cc.me.id)?' (you)':''))); g.appendChild(el('div','k-muted',m.email+' · joined '+ago(m.joined))); row.append(g);
      if(isAdmin() && m.role!=='owner'){ const sel=el('select','k-sel'); sel.style.width='auto'; ['admin','member','guest'].forEach(r=>sel.appendChild(new Option(r[0].toUpperCase()+r.slice(1),r))); sel.value=m.role; sel.onchange=async()=>{ try{ await api('/api/spaces/'+space.id+'/members/'+m.id,{method:'PATCH',body:{role:sel.value}}); toast('Role changed'); }catch(e){ toast(e.message); } }; row.appendChild(sel);
        row.appendChild(btn('Remove',async()=>{ if(!confirm('Remove '+(m.name||m.email)+'?')) return; await api('/api/spaces/'+space.id+'/members/'+m.id,{method:'DELETE'}); openSpace(space.id); },'sm')); }
      else row.appendChild(el('span','role',m.role));
      if(String(m.id)===String(cc.me.id) && m.role!=='owner') row.appendChild(btn('Leave',async()=>{ if(!confirm('Leave '+space.name+'?')) return; await api('/api/spaces/'+space.id+'/members/'+m.id,{method:'DELETE'}); openSpace(null); },'sm'));
      box.appendChild(row); });
  }

  // ---------- ORGANIZATION pages ----------
  async function pOverview(box){
    let d; try{ d=await api('/api/spaces/'+space.id+'/overview'); }catch(e){ box.textContent=e.message; return; }
    const g=el('div','grid'); [['Members',d.members],['Teamspaces',d.teamspaces],['Actions in 30 days',d.actions30d],['Approvals waiting',d.approvalsWaiting],['Tasks done',d.tasksDone],['Tasks open',d.tasksOpen]].forEach(([k,v])=>{ const c=el('div','stat'); c.appendChild(el('b',null,String(v))); c.appendChild(el('span',null,k)); g.appendChild(c); }); box.appendChild(g);
    const two=el('div','grid'); two.style.marginTop='14px';
    const tbl=(t,obj)=>{ const c=el('div','k-card'); c.appendChild(el('b',null,t)); const rows=Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,10); if(!rows.length) c.appendChild(el('div','k-muted k-small','Nothing yet.')).style.marginTop='8px';
      rows.forEach(([k,v])=>{ const r=el('div','k-row'); r.style.margin='8px 0'; const n=el('span','k-grow',k); r.append(n,el('b',null,String(v))); c.appendChild(r); }); return c; };
    two.append(tbl('Most active people',d.byPerson),tbl('What is being done',d.byAction)); box.appendChild(two);
    box.appendChild(el('div','k-muted k-small','Real counts from your audit log — no estimates.')).style.marginTop='12px';
  }
  async function pTeamspaces(box,acts){
    box.appendChild(el('div','k-muted','Every team in the company gets its own teamspace — its own chat, tasks, pages, brain, standards and meetings. Company rules and policies apply to all of them.'));
    if(isAdmin()) acts.appendChild(btn(ico(ICONS.plus)+' New teamspace',async()=>{ const n=await askText('Name the teamspace','e.g. Engineering'); if(!n) return; try{ await api('/api/spaces',{method:'POST',body:{kind:'teamspace',name:n,parentId:space.id}}); openSpace(space.id); }catch(e){ toast(e.message); } },'pri sm'));
    const g=el('div','grid'); g.style.marginTop='16px'; box.appendChild(g);
    if(!data.children.length) g.appendChild(el('div','empty','No teamspaces yet.'+(isAdmin()?' Press “New teamspace” to add one.':'')));
    data.children.forEach(c=>{ const k=el('div','k-card'); const h=el('div','k-row'); h.appendChild(avatar(c.name)); const b=el('b',null,c.name); h.appendChild(b); k.appendChild(h); k.appendChild(el('div','k-muted k-small','created '+ago(c.created))).style.margin='8px 0 12px';
      k.appendChild(btn('Open teamspace '+ico(ICONS.arrow),()=>location.href='/team?space='+c.id,'pri sm')); g.appendChild(k); });
  }
  const TOOLS=[['image','Pictures'],['video','Videos'],['audio','Audio files'],['build','Games / websites / apps'],['code','Coding agent in folders'],['files','Local files'],['browser','Opening websites'],['device','Opening apps on computers'],['web','Web search'],['research','Deep research'],['mail','Gmail'],['doc','Office files']];
  function pPolicies(box){
    const st={disabledTools:[],agentMode:'ask',protectedPaths:[],maskPrivate:false,retentionDays:0,instructions:'',...space.settings};
    const card=(t,sub)=>{ const c=el('div','k-card'); c.style.marginBottom='14px'; c.appendChild(el('b',null,t)); if(sub) c.appendChild(el('div','k-muted k-small',sub)).style.margin='4px 0 12px'; box.appendChild(c); return c; };
    const c1=card('AI tools members can use','Untick anything your company does not want people to use.'); const g=el('div','grid'); g.style.gap='4px 12px'; const boxes={};
    TOOLS.forEach(([k,n])=>{ const r=el('label','chk'), cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!st.disabledTools.includes(k); boxes[k]=cb; r.append(cb,el('span',null,n)); g.appendChild(r); }); c1.appendChild(g);
    const c2=card('How the coding agent may act'); const mode=el('select','k-sel'); [['readonly','Read only — it explains and suggests, never changes files'],['ask','Ask before changes — every change needs the person’s OK'],['auto','Automatic — it changes files and shows Undo']].forEach(([v,n])=>mode.appendChild(new Option(n,v))); mode.value=st.agentMode; c2.appendChild(mode);
    c2.appendChild(el('div','k-muted k-small','Protected files and folders — the agent never changes these (one per line)')).style.margin='12px 0 8px'; const prot=el('textarea','k-ta'); prot.value=(st.protectedPaths||[]).join('\n'); c2.appendChild(prot);
    const c3=card('Privacy and data'); const r1=el('label','chk'), mk=document.createElement('input'); mk.type='checkbox'; mk.checked=st.maskPrivate; r1.append(mk,el('span',null,'Hide private data from the AI — emails, phone numbers, Aadhaar, PAN and card numbers are replaced before anything is sent')); c3.appendChild(r1);
    const r3=el('label','chk'), ps=document.createElement('input'); ps.type='checkbox'; ps.checked=st.publicShares===true; r3.append(ps,el('span',null,'Allow public share links in teamspaces — anyone with the link can view that work (read only). Private links for members always work.')); c3.appendChild(r3);
    const r2=el('div','k-row'); r2.style.marginTop='10px'; const days=el('input','k-in'); days.type='number'; days.min='0'; days.value=st.retentionDays||0; days.style.maxWidth='110px'; r2.append(el('span',null,'Delete team chat messages after'),days,el('span','k-muted','days (0 = keep)')); c3.appendChild(r2);
    const c4=card('Company instructions','How CodeConClave should talk and work for your company — brand voice, what to avoid, who to send people to.'); const ins=el('textarea','k-ta'); ins.value=st.instructions||''; c4.appendChild(ins);
    box.appendChild(btn('Save policies',async()=>{ try{ await api('/api/spaces/'+space.id,{method:'PATCH',body:{settings:{disabledTools:TOOLS.map(([k])=>k).filter(k=>!boxes[k].checked),agentMode:mode.value,protectedPaths:prot.value.split('\n').map(s=>s.trim()).filter(Boolean),maskPrivate:mk.checked,publicShares:ps.checked,retentionDays:Number(days.value)||0,instructions:ins.value}}}); toast('Policies saved — they apply to every member now.'); }catch(e){ toast(e.message); } },'pri'));
  }
  async function pApprovals(box){
    box.appendChild(el('div','k-muted','Big or risky things go through an approval: a production deploy, a payments change, deleting data, a new tool. Members ask; admins approve or reject — and it is all in the audit log.'));
    const c=el('div','k-card'); c.style.margin='14px 0'; const ti=el('input','k-in'); ti.placeholder='What needs approval?'; const why=el('textarea','k-ta'); why.placeholder='Why, and what could go wrong'; why.style.margin='10px 0';
    c.append(ti,why,btn('Ask for approval',async()=>{ if(!ti.value.trim()) return; await putItem('approval',nid(),{title:ti.value.trim(),reason:why.value.trim(),status:'waiting'}); ti.value=''; why.value=''; draw(); toast('Sent to the admins'); },'pri')); box.appendChild(c);
    const list=el('div'); box.appendChild(list);
    async function draw(){ list.innerHTML=''; const all=await items('approval'); if(!all.length) list.appendChild(el('div','empty','No approvals yet.'));
      all.forEach(a=>{ const d=a.data, row=el('div','row'); const g=el('div','grow'); g.appendChild(el('b',null,d.title)); g.appendChild(el('div','k-muted','asked by '+(d.byName||'')+' · '+ago(d.at)+(d.decidedBy?' · '+d.status+' by '+d.decidedBy:''))); if(d.reason) g.appendChild(el('div',null,d.reason)).style.marginTop='6px'; row.appendChild(g);
        row.appendChild(el('span','role',{waiting:'⏳ waiting',approved:'✅ approved',rejected:'⛔ rejected'}[d.status]||d.status));
        if(isAdmin() && d.status==='waiting'){ row.appendChild(btn('Approve',async()=>{ await putItem('approval',a.id,{...d,status:'approved',decidedBy:cc.me.name||cc.me.email,decidedAt:Date.now()}); draw(); },'pri sm')); row.appendChild(btn('Reject',async()=>{ await putItem('approval',a.id,{...d,status:'rejected',decidedBy:cc.me.name||cc.me.email,decidedAt:Date.now()}); draw(); },'sm')); }
        list.appendChild(row); }); }
    draw();
  }
  async function pAudit(box,acts){
    acts.appendChild(Object.assign(el('a','k-btn sm','⬇ Download CSV'),{href:'/api/spaces/'+space.id+'/audit.csv'}));
    box.appendChild(el('div','k-muted','Who did what, when — in the organization and every teamspace. The AI’s use is logged by tool only, never the content of chats.'));
    const tb=el('table','table'); tb.style.marginTop='14px'; tb.innerHTML='<tr><th>When</th><th>Who</th><th>Action</th><th>Where</th><th>Detail</th></tr>'; box.appendChild(tb);
    for(const r of await items('audit')){ const tr=document.createElement('tr'); [new Date(r.data.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}),r.data.whoName,r.data.action,r.data.space,r.data.detail].forEach(v=>tr.appendChild(el('td',null,v||''))); tb.appendChild(tr); }
  }
  function pData(box){
    const c=el('div','k-card'); c.style.marginBottom='14px'; c.appendChild(el('b',null,'Export everything')); c.appendChild(el('div','k-muted k-small','All members, teamspaces, pages, tasks, knowledge, rules, approvals and the audit log — as one JSON file.')).style.margin='4px 0 12px';
    c.appendChild(Object.assign(el('a','k-btn pri','⬇ Export organization data'),{href:'/api/spaces/'+space.id+'/export'})); box.appendChild(c);
    if(data.myRole!=='owner') return;
    const d=el('div','k-card'); d.style.borderColor='#5a2020'; d.appendChild(el('b',null,'Delete the organization')); d.appendChild(el('div','k-muted k-small','Deletes the organization, all its teamspaces and everything in them. This cannot be undone.')).style.margin='4px 0 12px';
    const r=el('div','bar'); r.style.margin='0'; const inp=el('input','k-in'); inp.style.flex='1'; inp.placeholder='Type the organization name to confirm';
    r.append(inp,btn('Delete forever',async()=>{ if(inp.value.trim()!==space.name) return toast('Type the exact name first.'); try{ await api('/api/spaces/'+space.id,{method:'DELETE'}); store('cc_org_cur',null); openSpace(null); toast('Organization deleted.'); }catch(e){ toast(e.message); } })); d.appendChild(r); box.appendChild(d);
  }
  boot();
})();
