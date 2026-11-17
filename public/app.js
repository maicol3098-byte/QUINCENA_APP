"use strict";
/* ---------- state ---------- */
let C=norm({}), D={cards:{}}, T=[], loaded=false, stale=false;
const ui={view:'home',mode:'period',off:0,desk:false,qa:blank(),edit:null,filter:{q:'',a:'',c:'',from:'',to:''},bank:{},pay:{},paste:{},pasteOpen:'',openAcc:'',openAt:0,dd:'',plan:{},sv:{from:'',to:''},busy:false,auth:{mode:'in',email:'',name:'',pass:'',remember:true,err:'',first:false,signup:false,busy:false},pw:{cur:'',next:''},nu:{email:'',name:'',pass:'',role:'user'},users:null,signupOpen:false,reset:{},restoreText:'',confirm:'',recent:[],fresh:null,toast:''};
function blank(){return{t:'expense',amt:'',a:'',to:'',toAmt:'',c:'',f:'',ff:'',d:'',n:''}}
function norm(c){c=c||{};c.settings=Object.assign({base:'CRC',fx:500,paydays:[15,30],noSpend:0},c.settings||{});
  ['accounts','cats','funds'].forEach(k=>{if(!Array.isArray(c[k]))c[k]=[]});return c}
const clone=o=>JSON.parse(JSON.stringify(o));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num=v=>{const n=parseFloat(String(v==null?'':v).replace(/[,\s₡$]/g,''));return isFinite(n)?n:0};
const r2=n=>Math.round(n*100)/100;
const $=id=>document.getElementById(id);

/* ---------- dates ---------- */
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const pd=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const today=()=>iso(new Date());
const addDays=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return iso(d)};
const dayDiff=(a,b)=>Math.round((pd(b)-pd(a))/864e5);
const nice=s=>pd(s).toLocaleDateString('en-US',{month:'short',day:'numeric'});
function monthOf(s){const d=pd(s);return{start:iso(new Date(d.getFullYear(),d.getMonth(),1)),end:iso(new Date(d.getFullYear(),d.getMonth()+1,0))}}
function paydays(){return(C.settings.paydays||[]).map(Number).filter(x=>x>=1&&x<=31)}
function periodOf(s){const P=paydays();if(!P.length){const m=monthOf(s);return{start:m.start,end:m.end,next:addDays(m.end,1)}}
  const d=pd(s),st=[];for(let k=-1;k<=1;k++){const y=d.getFullYear(),m=d.getMonth()+k,dim=new Date(y,m+1,0).getDate();P.forEach(p=>st.push(iso(new Date(y,m,Math.min(p,dim)))))}
  const u=[...new Set(st)].sort();let i=0;for(let j=0;j<u.length;j++)if(u[j]<=s)i=j;
  return{start:u[i],end:addDays(u[i+1],-1),next:u[i+1]}}
function nextDay(dom,from){dom=+dom;if(!dom)return null;const d=pd(from);for(let k=0;k<2;k++){const y=d.getFullYear(),m=d.getMonth()+k,dim=new Date(y,m+1,0).getDate(),c=iso(new Date(y,m,Math.min(dom,dim)));if(c>=from)return c}return null}
function range(off){off=off||0;const t=today();if(ui.mode==='month'){const d=pd(t);return monthOf(iso(new Date(d.getFullYear(),d.getMonth()+off,1)))}let p=periodOf(t);for(let i=0;i<-off;i++)p=periodOf(addDays(p.start,-1));return p}
function startDate(){let d=C.settings.start||today();T.forEach(x=>{if(x.d<d)d=x.d});return d>today()?today():d}
function minOff(){return offFor(startDate(),true)}
function offFor(date,raw){const t=today();if(!raw){const st=startDate();if(date<st)date=st}if(date>=t)return 0;if(ui.mode==='month'){const a=pd(t),b=pd(date);return Math.min(0,(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth())}let p=periodOf(t),n=0;while(p.start>date&&n<600){p=periodOf(addDays(p.start,-1));n++}return -n}

/* ---------- money ---------- */
const SYM={CRC:'₡',USD:'$',EUR:'€',MXN:'MX$',COP:'COL$',GBP:'£'};
const symOf=cur=>SYM[cur]||cur+' ';
function fmtN(n,cur){n=Math.abs(r2(n||0));const dec=(cur==='USD'||Math.abs(n-Math.round(n))>0.004)?2:0;return n.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec})}
function fmt(n,cur){cur=cur||C.settings.base;return(r2(n||0)<0?'−':'')+symOf(cur)+fmtN(n,cur)}
const N=(k,v,cur)=>{cur=cur||C.settings.base;if(cur!=='USD')v=Math.round(v);return`${r2(v)<0?'−':''}<span class="cur">${symOf(cur)}</span><span data-k="${k}" data-num="${Math.abs(r2(v))}" data-cur="${cur}">${fmtN(v,cur)}</span>`};
const fxOf=cur=>cur===C.settings.base?1:(+C.settings.fx||1);
const acc=id=>C.accounts.find(a=>a.id===id);
const cat=id=>C.cats.find(a=>a.id===id);
const fund=id=>C.funds.find(a=>a.id===id);
const curOf=id=>(acc(id)||{}).cur||C.settings.base;
const toBase=(amt,id)=>r2(amt*fxOf(curOf(id)));
const isCard=a=>a&&a.kind==='card';

/* ---------- derived ---------- */
function balances(upTo){const b={};C.accounts.forEach(a=>b[a.id]=isCard(a)?-(+a.open||0):(+a.open||0));
  T.forEach(x=>{if(upTo&&x.d>upTo)return;if(x.t==='expense'&&x.a in b)b[x.a]-=x.amt;else if((x.t==='income'||x.t==='adjust')&&x.a in b)b[x.a]+=x.amt;
    else if(x.t==='transfer'){if(x.a in b)b[x.a]-=x.amt;if(x.to in b)b[x.to]+=(x.toAmt!=null?x.toAmt:x.amt)}});
  for(const k in b)b[k]=r2(b[k]);return b}
function fundBals(upTo){const b={};C.funds.forEach(f=>b[f.id]=+f.open||0);
  T.forEach(x=>{if(upTo&&x.d>upTo)return;if(x.t==='fund'){if(x.f in b)b[x.f]+=x.amt;if(x.ff in b)b[x.ff]-=x.amt}
    else if(x.f&&x.f in b)b[x.f]+=fundDelta(x)});
  for(const k in b)b[k]=r2(b[k]);return b}
const isSav=id=>{const a=acc(id);return !!(a&&!isCard(a)&&a.savings)};
function fundDelta(x){if(x.fd!=null)return x.fd;if(x.t==='expense')return isSav(x.a)?-x.base:0;if(x.t==='income')return isSav(x.a)?x.base:0;
  if(x.t==='transfer'){const o=isSav(x.a),i=isSav(x.to);return i&&!o?r2((x.toAmt!=null?x.toAmt:x.amt)*fxOf(curOf(x.to))):o&&!i?-x.base:0}return 0}
function fundRole(o){if(o.t==='expense')return isSav(o.a)?'out':'tag';if(o.t==='income')return isSav(o.a)?'in':'';if(o.t==='transfer'){const f=isSav(o.a),t=isSav(o.to);return t&&!f?'in':f&&!t?'out':''}return''}
function savePlan(s){const P=Math.max(1,paydays().length||1),planned=C.funds.filter(f=>+f.monthly>0),srcs=C.accounts.filter(a=>!isCard(a)&&!a.savings),dsts=C.accounts.filter(a=>!isCard(a)&&a.savings);
  const from=acc(ui.sv.from)||srcs.find(a=>s.bal[a.id]>0)||srcs[0],to=acc(ui.sv.to)||dsts[0],done={};
  T.forEach(x=>{if(x.t==='transfer'&&x.f&&inR(x,s.p)){const d=fundDelta(x);if(d>0)done[x.f]=(done[x.f]||0)+d}});
  const val=f=>ui.plan[f.id]!=null?ui.plan[f.id]:Math.max(0,r2(f.monthly/P-(done[f.id]||0)));
  const tot=planned.reduce((t,f)=>t+num(val(f)),0);
  return{P,planned,srcs,dsts,from,to,done,val,tot,after:from?r2(s.bal[from.id]-tot/fxOf(from.cur)):0}}
const inR=(x,r)=>x.d>=r.start&&x.d<=r.end;
function spent(r){const m={};let fromFunds=0;T.forEach(x=>{if(x.t==='expense'&&inR(x,r)){if(x.f)fromFunds+=x.base;else m[x.c||'']=(m[x.c||'']||0)+x.base}});return{m,fromFunds}}
function budgetOf(c){const b=+c.budget||0;return ui.mode==='month'?b:b/Math.max(1,paydays().length||1)}
function draftSum(id){return -effSum(id)}
function stats(off){off=off||0;const r=range(off),past=off<0,t=past?r.end:today(),bal=balances(past?r.end:null),fb=fundBals(past?r.end:null),sp=spent(r);
  const exp=C.cats.filter(c=>c.kind==='expense');
  let budget=0,used=0;exp.forEach(c=>{budget+=budgetOf(c);used+=sp.m[c.id]||0});used+=sp.m['']||0;
  const len=dayDiff(r.start,r.end)+1,done=Math.min(len,Math.max(0,dayDiff(r.start,t)+1)),elapsed=done/len;
  let avail=0,saved=0,owed=0,drafted=0;
  C.accounts.forEach(a=>{const v=bal[a.id]*fxOf(a.cur);if(isCard(a)){owed+=-v;drafted+=past?0:draftSum(a.id)*fxOf(a.cur)}else if(a.savings)saved+=v;else avail+=v});
  const funds=Object.values(fb).reduce((s,v)=>s+v,0);
  return{t,r,bal,fb,sp,budget,used,left:budget-used,len,done,elapsed,avail,saved,owed,drafted,funds,drift:r2(funds-saved),p:periodOf(today()),past}}

function flags(s){const F=[],t=s.t;const add=(lv,tag,html,go)=>F.push({lv,tag,html,go});
  C.cats.filter(c=>c.kind==='expense'&&+c.budget>0).forEach(c=>{const b=budgetOf(c),u=s.sp.m[c.id]||0;
    if(u>b+0.5)add('bad','Over',`<b>${esc(c.name)}</b> is ${fmt(u-b)} over its ${ui.mode==='month'?'monthly':'payday'} budget`);
    else if(u/b>s.elapsed+0.2&&u/b>0.5)add('warn','Fast',`<b>${esc(c.name)}</b> is running ahead: ${Math.round(u/b*100)}% used with ${Math.round(s.elapsed*100)}% of the ${ui.mode==='month'?'month':'period'} gone`)});
  if(s.left<0)add('bad','Over',`You have spent <b>${fmt(-s.left)}</b> more than this ${ui.mode==='month'?'month':'period'}'s total budget`);
  if(s.past)return F;
  C.accounts.forEach(a=>{const v=s.bal[a.id];
    if(!isCard(a)&&v<-0.5)add('bad','Negative',`<b>${esc(a.name)}</b> shows a balance of ${fmt(v,a.cur)}`,'payday');
    const df=draftDiff(a.id,s.bal);if(df!=null&&Math.abs(df)>=1)add('warn','Draft',`<b>${esc(a.name)}</b> is ${fmt(Math.abs(df),a.cur)} away from the bank balance`,'payday');
    if(isCard(a)){
      const pay=nextDay(a.pay,t),cut=nextDay(a.cut,t);
      if(pay&&-v>0.5&&dayDiff(t,pay)<=5)add(dayDiff(t,pay)<=1?'bad':'warn','Due',`<b>${esc(a.name)}</b> payment is due ${when(pay)}: ${fmt(-v,a.cur)} owed`,'payday');
      if(cut&&dayDiff(t,cut)<=3)add('','Closing',`<b>${esc(a.name)}</b> statement closes ${when(cut)}`)}});
  const m=monthOf(t),paid=new Set(T.filter(x=>x.t==='expense'&&inR(x,m)).map(x=>x.c));
  C.cats.filter(c=>c.kind==='bill'&&+c.due&&!paid.has(c.id)).forEach(c=>{const dim=pd(m.end).getDate(),due=iso(new Date(pd(t).getFullYear(),pd(t).getMonth(),Math.min(+c.due,dim))),n=dayDiff(t,due);
    if(n<0)add('bad','Late',`<b>${esc(c.name)}</b> was due ${nice(due)} and is not recorded as paid`);else if(n<=4)add('warn','Due',`<b>${esc(c.name)}</b> is due ${when(due)} (${fmt(+c.budget||0)})`)});
  if(C.funds.length&&Math.abs(s.drift)>=1)add('warn','Drift',s.drift>0?`Funds add up to <b>${fmt(s.drift)}</b> more than your savings accounts hold`:`Savings accounts hold <b>${fmt(-s.drift)}</b> that is not assigned to any fund`,'funds');
  const old=C.accounts.filter(a=>!isCard(a)&&a.checked&&dayDiff(a.checked,t)>20&&Math.abs(s.bal[a.id])>0.5);
  if(old.length)add('','Check',`${old.length} account${old.length>1?'s':''} not checked against the bank in over 20 days: ${old.map(a=>esc(a.name)).join(', ')}`,'payday');
  const n=dayDiff(t,s.p.next);if(n<=2)add('ok','Payday',`Payday ${when(s.p.next)}. Your review is ready.`,'payday');
  const o={bad:0,warn:1,'':2,ok:3};return F.sort((a,b)=>o[a.lv]-o[b.lv])}
function when(d){const n=dayDiff(today(),d);return n===0?'today':n===1?'tomorrow':n<0?Math.abs(n)+' days ago':'in '+n+' days ('+nice(d)+')'}

/* ---------- server storage ---------- */
let me=null,rev=0,needSync=false,dirtyC=0,dirtyD=0,tC,tD;
async function api(method,url,body){let r;
  try{r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'quincena'},body:body===undefined?undefined:JSON.stringify(body)})}
  catch(e){if(!stale){stale=true;render()}throw{status:0,message:'You seem to be offline.'}}
  let j=null;try{j=await r.json()}catch(e){}
  if(stale){stale=false;render()}
  if(r.status===401&&me){me=null;loaded=false;ui.auth.mode='in';ui.auth.err='Your session ended. Sign in again.';render();throw{status:401,message:'Signed out'}}
  if(!r.ok)throw{status:r.status,message:(j&&j.error)||'The request failed.',body:j};
  if(method!=='GET'&&j&&j.rev){if(j.rev>rev+1)needSync=true;rev=Math.max(rev,j.rev)}
  return j}
function fail(e){if(e&&e.status===401)return;toast(e&&e.status===0?'You are offline. That change was not saved.':(e&&e.message)||'Could not save. Try again.')}
function saveCfg(){dirtyC++;clearTimeout(tC);tC=setTimeout(async()=>{const n=dirtyC;try{await api('PUT','/api/config',C);if(dirtyC===n)dirtyC=0}catch(e){fail(e)}},500)}
function saveDr(){dirtyD++;clearTimeout(tD);tD=setTimeout(async()=>{const n=dirtyD;try{await api('PUT','/api/drafts',D);if(dirtyD===n)dirtyD=0}catch(e){fail(e)}},500)}
async function putTx(x){const id=x.id||uid(),body=clone(x);delete body.id;body.ts=Date.now();
  try{await api('PUT','/api/tx/'+encodeURIComponent(id),body)}catch(e){fail(e);return null}
  const row=Object.assign({id},body),i=T.findIndex(y=>y.id===id);if(i>=0)T[i]=row;else T.push(row);sortT();render();return id}
async function delTx(id){try{await api('DELETE','/api/tx/'+encodeURIComponent(id))}catch(e){return fail(e)}T=T.filter(x=>x.id!==id);render()}
function sortT(){T.sort((a,b)=>a.d<b.d?1:a.d>b.d?-1:(b.ts||0)-(a.ts||0))}
async function loadState(){const s=await api('GET','/api/state');C=norm(s.config||{});D=s.drafts&&s.drafts.cards?s.drafts:{cards:{}};T=s.tx||[];sortT();rev=s.rev;needSync=false;loaded=true;initUi();render();
  if(C.settings.fxAuto&&C.settings.fxDate!==today())acts.fxFetch({quiet:'1'})}
async function sync(){if(!me||!loaded||dirtyC||dirtyD||imp.state==='writing'||ui.edit||document.hidden)return;
  try{const r=await api('GET','/api/rev');if(r.rev!==rev||needSync)await loadState()}catch(e){}}
async function boot(){try{const v=localStorage.getItem('quincena-desk');ui.desk=v!=null?v==='1':!!(window.matchMedia&&matchMedia('(min-width:901px)').matches)}catch(e){}
  window.addEventListener('hashchange',route);window.addEventListener('resize',moveInd);window.addEventListener('focus',sync);document.addEventListener('visibilitychange',sync);setInterval(sync,20000);
  try{const r=await api('GET','/api/me');await enter(r.user)}
  catch(e){const b=e.body||{};ui.auth.first=!!b.firstUser;ui.auth.signup=!!b.signup;ui.auth.mode=b.firstUser?'up':'in';if(e.status===0)ui.auth.err='The server cannot be reached. Check your connection.';render()}}
async function enter(user){me=user;ui.auth.pass='';ui.auth.err='';ui.users=null;shell();route();try{await loadState()}catch(e){fail(e)}
  if(me&&me.mustChange){location.hash='setup';toast('Choose your own password under Your account.')}}
function initUi(){if(!ui.qa.d)ui.qa.d=today();if(!ui.dd){const p=periodOf(today()),n=dayDiff(p.start,today());ui.dd=n<=3&&addDays(p.start,-1)>=startDate()?addDays(p.start,-1):today()}const first=C.accounts.find(a=>!isCard(a)&&!a.savings)||C.accounts[0];if(first&&!ui.qa.a)ui.qa.a=first.id}

/* ---------- sign-in screen ---------- */
function paintAuth(){const a=ui.auth,ae=document.activeElement,fid=ae&&ae.id,ss=ae&&ae.selectionStart,up=a.mode==='up';document.body.classList.remove('desk-open');
  $('app').innerHTML=`<div class="authwrap"><form class="authcard" id="authForm" novalidate>
  <div class="brand"><b>Quincena</b></div>
  <h1>${up?(a.first?'Set up the first account':'Create your account'):'Welcome back'}</h1>
  <p class="muted">${up?(a.first?'This account will be the administrator and can add other people later.':'Your budget, accounts and funds are private to you.'):'Sign in to pick up where you left off.'}</p>
  ${up?`<label class="f">Your name<input id="auth-name" type="text" autocomplete="name" data-b="auth.name" value="${esc(a.name)}"></label>`:''}
  <label class="f">Email<input id="auth-email" type="email" autocomplete="username" data-b="auth.email" value="${esc(a.email)}"></label>
  <label class="f">Password<input id="auth-pass" type="password" autocomplete="${up?'new-password':'current-password'}" data-b="auth.pass" value="${esc(a.pass)}">${up?'<span class="hint">At least 8 characters.</span>':''}</label>
  <label class="check"><input id="auth-rem" type="checkbox" data-b="auth.remember" ${a.remember?'checked':''}><span>Keep me signed in on this device<small>${a.remember?'Stays signed in for 30 days.':'Signs out when you close the browser.'}</small></span></label>
  ${a.err?`<div class="autherr" role="alert">${esc(a.err)}</div>`:''}
  <button class="btn pri" type="submit" ${a.busy?'disabled':''}>${a.busy?'One moment…':up?'Create account':'Sign in'}</button>
  ${a.signup||a.first?`<p class="muted small" style="text-align:center;margin:0">${up?(a.first?'':'Already have an account? <button type="button" class="link" data-act="authMode" data-v="in">Sign in</button>'):'New here? <button type="button" class="link" data-act="authMode" data-v="up">Create an account</button>'}</p>`:'<p class="muted small" style="text-align:center;margin:0">Accounts are created by an administrator.</p>'}
  </form></div>`;
  if(fid){const n=$(fid);if(n){n.focus();try{if(ss!=null)n.setSelectionRange(ss,ss)}catch(e){}}}}
async function authSubmit(){const a=ui.auth;if(a.busy)return;if(!a.email.trim()||!a.pass){a.err='Enter your email and password.';return render()}
  a.busy=true;a.err='';render();
  try{const r=await api('POST',a.mode==='up'?'/api/auth/register':'/api/auth/login',{email:a.email,password:a.pass,name:a.name,remember:!!a.remember});a.busy=false;await enter(r.user)}
  catch(e){a.busy=false;a.err=e.message||'That did not work. Try again.';render()}}

/* ---------- account, users, backup ---------- */
function accountSec(){const p=ui.pw;return sec('Your account',`<span class="aside">${esc(me.email)}${me.role==='admin'?' · administrator':''}</span>`,`<div class="form">
  <label class="f">Name<input id="acc-name" type="text" value="${esc(me.name||'')}" data-me="name"></label>
  <div class="g2"><label class="f">Current password<input id="pw-cur" type="password" autocomplete="current-password" data-b="pw.cur" value="${esc(p.cur)}"></label>
  <label class="f">New password<input id="pw-next" type="password" autocomplete="new-password" data-b="pw.next" value="${esc(p.next)}"></label></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="changePass">Change password</button><span class="lead"></span><button class="btn" data-act="logout">Sign out</button><button class="btn danger" data-act="logoutAll">Sign out on every device</button></div>
  <p class="muted small" style="margin:0">Changing your password signs out your other devices.</p></div>`)}
async function loadUsers(){try{const r=await api('GET','/api/users');ui.users=r.users;ui.signupOpen=r.signup;render()}catch(e){ui.users=[];fail(e)}}
function usersSec(){if(me.role!=='admin')return'';if(ui.users===null){ui.users=[];loadUsers()}const n=ui.nu,ago=d=>d?new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'never';
  return sec('People',`<span class="aside">${ui.signupOpen?'anyone with the link can create an account':'only you can add people'}</span>`,`<div class="scroll"><table style="min-width:760px"><tr><th>Person</th><th>Role</th><th>Last sign-in</th><th class="r">Movements</th><th>New temporary password</th><th></th></tr>
  ${ui.users.map(u=>`<tr><td><b>${esc(u.name||u.email)}</b>${u.id===me.id?' <span class="tag">you</span>':''}${u.disabled?' <span class="tag warn">disabled</span>':''}${u.must_change?' <span class="tag">temporary password</span>':''}<div class="m">${esc(u.email)}</div></td>
  <td><select id="ur-${u.id}" data-urole="${u.id}">${opt('user','Member',u.role)}${opt('admin','Administrator',u.role)}</select></td><td class="small">${ago(u.last_login)}</td><td class="r fig">${u.movements}</td>
  <td><div style="display:flex;gap:6px"><input id="rp-${u.id}" type="text" data-b="reset.${u.id}" value="${esc(ui.reset[u.id]||'')}" placeholder="8+ characters" autocomplete="off"><button class="btn sm" data-act="userReset" data-id="${u.id}">Set</button></div></td>
  <td class="r" style="white-space:nowrap">${u.id===me.id?'':`<button class="btn sm" data-act="userToggle" data-id="${u.id}" data-on="${u.disabled?'1':''}">${u.disabled?'Enable':'Disable'}</button> <button class="btn sm danger" data-act="userDel" data-id="${u.id}">${ui.confirm==='user'+u.id?'Confirm delete':'Delete'}</button>`}</td></tr>`).join('')}</table></div>
  <h2 style="margin:16px 0 8px;font-size:14px">Add someone</h2>
  <div class="g2" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));align-items:end"><label class="f">Email<input id="nu-email" type="text" data-b="nu.email" value="${esc(n.email)}" autocomplete="off"></label><label class="f">Name<input id="nu-name" type="text" data-b="nu.name" value="${esc(n.name)}" autocomplete="off"></label>
  <label class="f">Temporary password<input id="nu-pass" type="text" data-b="nu.pass" value="${esc(n.pass)}" autocomplete="off"></label><label class="f">Role<select id="nu-role" data-b="nu.role">${opt('user','Member',n.role)}${opt('admin','Administrator',n.role)}</select></label>
  <button class="btn pri" data-act="userAdd">Create account</button></div>
  <p class="muted small">Give them the temporary password yourself. They are asked to choose their own the first time they sign in. Each person only ever sees their own money.</p>`)}
function backupSec(){return sec('Backup and restore','',`<div class="form"><div><button class="btn" data-act="backup">Download a backup</button> <span class="muted small">Everything of yours in one file: settings, drafts and every movement.</span></div>
  <label class="f">Restore from a backup file<input id="restoreFile" type="file" accept=".json,application/json"></label>
  <label class="f">Or paste backup text<textarea id="restoreText" rows="3" data-b="restoreText" placeholder="Paste what “Copy a backup” gave you in the earlier version of Quincena">${esc(ui.restoreText)}</textarea></label>
  <div><button class="btn danger" data-act="restoreText" ${ui.restoreText.trim()?'':'disabled'}>${ui.confirm==='restore'?'Confirm: replace everything':'Restore from the pasted text'}</button> <span class="muted small">Restoring replaces all of your current data.</span></div></div>`)}
async function doRestore(text){let j;try{j=JSON.parse(text)}catch(e){return toast('That is not a backup file.')}
  const body={config:j.config||j.C,drafts:j.drafts||j.D,movements:j.movements||j.tx||j.T||[]};if(!body.config||!Array.isArray(body.movements))return toast('That is not a Quincena backup.');
  try{await api('POST','/api/restore',body);ui.restoreText='';ui.off=0;await loadState();toast(body.movements.length+' movements restored')}catch(e){fail(e)}}

/* ---------- rendering ---------- */
const VIEWS=[['home','Home'],['payday','Payday'],['movements','Movements'],['funds','Funds'],['setup','Setup']];
function shell(){$('app').innerHTML=`<header class="top"><div class="brand"><b>Quincena</b><small id="sub"></small></div>
  <nav class="tabs" id="tabs" aria-label="Sections">${VIEWS.map(v=>`<button data-act="go" data-v="${v[0]}">${v[1]}</button>`).join('')}<i class="ind" id="ind"></i></nav>
  <button class="add" id="addBtn" data-act="toggleDesk" aria-expanded="false"><span class="plus" aria-hidden="true">+</span><span id="addLb">Add</span></button>
  <button class="who" data-act="go" data-v="setup" title="${esc(me?me.email:'')}" aria-label="Your account">${esc(((me&&(me.name||me.email))||'?').trim()[0].toUpperCase())}</button></header>
  <div class="shell" id="shell"><main id="main"></main><aside id="desk" aria-label="Add a movement"><div class="slip" id="deskIn"></div></aside></div>
  <div class="scrim" id="scrim" data-act="toggleDesk"></div>
  <div class="modal" id="modal" data-act="closeEdit"><div class="sheet" id="modalIn" data-stop="1"></div></div><div class="toast" id="toast" role="status"></div>`}
function route(){const h=location.hash.replace('#','');ui.view=VIEWS.some(v=>v[0]===h)?h:'home';render()}
function moveInd(){const b=document.querySelector('#tabs button.on'),i=$('ind');if(b&&i){i.style.width=b.offsetWidth+'px';i.style.top=b.offsetTop+'px';i.style.height=b.offsetHeight+'px';i.style.transform='translateX('+b.offsetLeft+'px)'}}
let raf=0,lastView='',enterAt=-1e9,entering=false;const seen=new Set();
function render(){if(imp.state==='writing'){if(!impT)impT=setTimeout(()=>{impT=0;paint()},700);return}if(raf)return;raf=requestAnimationFrame(()=>{raf=0;paint()})}
function paint(){if(!me)return paintAuth();const ae=document.activeElement,fid=ae&&ae.id,ss=ae&&ae.selectionStart,raw=ae&&ae.value,isTxt=ae&&((ae.tagName==='INPUT'&&ae.type==='text')||ae.tagName==='TEXTAREA');
  if(loaded)ui.off=Math.max(minOff(),Math.min(0,ui.off));const sNow=stats(0),s=ui.view==='home'&&ui.off?stats(ui.off):sNow,main=$('main');
  $('sub').textContent=nice(today())+' · payday '+when(s.p.next);
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.v===ui.view));moveInd();
  entering=loaded&&ui.view!==lastView;
  const body=!loaded?'<p class="muted">Loading…</p>':({home,payday,movements,funds,setup})[ui.view](s);
  main.innerHTML=(stale?'<div class="note">You are offline. Changes will not be saved until the connection is back.</div>':'')+body;
  if(entering){lastView=ui.view;enterAt=performance.now();main.classList.remove('enter');void main.offsetWidth;main.classList.add('enter')}
  const el=performance.now()-enterAt;if(el<1600)main.style.setProperty('--el',(-el)+'ms');else main.classList.remove('enter');
  $('shell').classList.toggle('open',ui.desk);document.body.classList.toggle('desk-open',ui.desk);$('addBtn').setAttribute('aria-expanded',ui.desk);$('addLb').textContent=ui.desk?'Close':'Add';
  $('deskIn').innerHTML=loaded?deskHtml(sNow):'';
  if(ui.edit)$('modalIn').innerHTML=editModal();$('modal').classList.toggle('on',!!ui.edit);
  if(ui.toast)$('toast').textContent=ui.toast;$('toast').classList.toggle('on',!!ui.toast);
  if(fid){const n=$(fid);if(n){n.focus();if(isTxt){n.value=raw;try{n.setSelectionRange(ss,ss)}catch(e){}}}}
  animate()}
const prev={},reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
function animate(){document.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k;
  if(el.dataset.w!=null){const w=el.dataset.w+'%';el.style.width=prev[k]!=null?prev[k]:'0%';prev[k]=w;requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.width=w}))}
  else if(el.dataset.num!=null){const to=+el.dataset.num,from=prev[k]!=null?prev[k]:to;prev[k]=to;if(from!==to&&!reduce){const t0=performance.now(),cur=el.dataset.cur,whole=cur!=='USD';
    (function step(now){const p=Math.min(1,(now-t0)/650),e=1-Math.pow(1-p,3);if(!el.isConnected)return;const v=from+(to-from)*e;el.textContent=p<1?fmtN(whole?Math.round(v):v,cur):fmtN(to,cur);if(p<1)requestAnimationFrame(step)})(t0)}}})}
function toast(m){ui.toast=m;render();clearTimeout(toast.t);toast.t=setTimeout(()=>{ui.toast='';render()},3200)}
const opt=(v,l,sel)=>`<option value="${esc(v)}"${String(v)===String(sel||'')?' selected':''}>${esc(l)}</option>`;
const accOpts=(sel,f)=>C.accounts.filter(f||(()=>true)).map(a=>opt(a.id,a.name+(a.cur!==C.settings.base?' ('+a.cur+')':''),sel)).join('');
const fundOpts=(sel,none)=>opt('',none,sel)+C.funds.map(f=>opt(f.id,f.name,sel)).join('');
function catOpts(sel,kinds){return opt('','Choose…',sel)+kinds.map(k=>{const L=C.cats.filter(c=>c.kind===k);return L.length?`<optgroup label="${k==='bill'?'Bills':k==='income'?'Income':'Spending'}">${L.map(c=>opt(c.id,c.name,sel)).join('')}</optgroup>`:''}).join('')}
const sec=(title,aside,body,cls)=>`<section class="sec ${cls||''}"><header class="sh"><h2>${title}</h2>${aside||''}</header>${body}</section>`;

function barRow(k,name,u,b,pace){const pct=b>0?Math.min(100,u/b*100):(u>0?100:0),cls=u>b+0.5?'bad':(b>0&&pace!=null&&u/b>pace+0.2&&u/b>0.5?'warn':'');
  return`<div class="brow ${cls}"><span class="n">${esc(name)}</span><div class="bar"><i data-k="${k}" data-w="${pct.toFixed(1)}"></i>${pace!=null&&b>0?`<em style="left:${(pace*100).toFixed(1)}%" title="Where an even pace would put you today"></em>`:''}</div><span class="a"><b>${fmt(u)}</b> / ${fmt(b)}${cls==='bad'?' · over':cls==='warn'?' · fast':''}</span></div>`}

function home(s){if(!C.accounts.length)return sec('Nothing set up yet','',`<p class="muted">Add your accounts, cards, categories and funds to start.</p><button class="btn pri" data-act="go" data-v="setup">Open Setup</button>`);
  const F=flags(s),pct=s.budget>0?s.used/s.budget:0;
  const lab=ui.mode==='month'?pd(s.t).toLocaleDateString('en-US',s.past?{month:'long',year:'numeric'}:{month:'long'}):nice(s.r.start)+' – '+nice(s.r.end)+(s.r.end.slice(0,4)!==today().slice(0,4)?', '+s.r.end.slice(0,4):'');
  const exp=C.cats.filter(c=>c.kind==='expense');
  const m=monthOf(s.t),paid={};T.forEach(x=>{if(x.t==='expense'&&inR(x,m))paid[x.c]=(paid[x.c]||0)+x.base});
  const bills=C.cats.filter(c=>c.kind==='bill'),billTot=bills.reduce((a,c)=>a+(+c.budget||0),0),billPaid=bills.reduce((a,c)=>a+(paid[c.id]||0),0);
  let nsd='';if(+C.settings.noSpend&&T.some(x=>inR(x,m))){const days=new Set(T.filter(x=>x.t==='expense'&&inR(x,m)&&(cat(x.c)||{}).kind!=='bill').map(x=>x.d));const el=pd(s.t).getDate(),free=el-[...days].filter(d=>d<=s.t).length;
    nsd=`<div class="cell"><div class="l">No-spend days</div><div class="v">${free}<span class="muted" style="font-size:.55em"> of ${+C.settings.noSpend}</span></div><div class="s">${free>=+C.settings.noSpend?'Monthly goal reached':'This month so far'}</div></div>`}
  const ticks=Array.from({length:s.len},(_,i)=>`<span class="${i<s.done-1?'past':i===s.done-1?'now':''}"></span>`).join('');
  const flagRows=F.map(f=>{const key=f.tag+f.html,fresh=!entering&&!seen.has(key);return`<div class="flag ${f.lv}${fresh?' thump':''}"><span class="stamp">${f.tag}</span><span>${f.html}</span>${f.go?`<button class="link go" data-act="go" data-v="${f.go}">Open</button>`:''}</div>`}).join('');
  seen.clear();F.forEach(f=>seen.add(f.tag+f.html));
  return`<section class="hero"><div class="hrow"><div class="rg" role="group" aria-label="Range"><button data-act="mode" data-v="period" class="${ui.mode==='period'?'on':''}">By payday</button><button data-act="mode" data-v="month" class="${ui.mode==='month'?'on':''}">By month</button></div>
    <div class="nav"><button class="nb" data-act="shift" data-v="-1" aria-label="Earlier" ${ui.off<=minOff()?'disabled title="Nothing recorded before '+nice(startDate())+'"':''}>‹</button><input type="date" id="jump" class="jump" aria-label="Jump to a date" min="${startDate()}" max="${today()}" value="${s.past?s.r.start:today()}"><button class="nb" data-act="shift" data-v="1" aria-label="Later" ${ui.off>=0?'disabled':''}>›</button>${ui.off?'<button class="nb txt" data-act="shift" data-v="0">Back to now</button>':''}</div></div>
    <div class="kick">${s.past?(s.left<0?'Overspent':'Left unspent'):'Left to spend'} · ${lab}</div><div class="big ${s.left<0?'neg':''}">${N('left',s.left)}</div>
    <div class="meter" role="img" aria-label="${Math.round(pct*100)}% of the budget used"><i class="${pct>1?'over':''}" data-k="meter" data-w="${Math.min(100,pct*100).toFixed(1)}"></i></div>
    <div class="days" aria-hidden="true">${ticks}</div>
    <div class="sub"><span><b>${fmt(s.used)}</b> spent of ${fmt(s.budget)}</span><span><b>${Math.round(pct*100)}%</b> of the money, <b>${Math.round(s.elapsed*100)}%</b> of the days</span><span>${s.past?'closed':Math.max(0,s.len-s.done)+' day'+(s.len-s.done===1?'':'s')+' left'}</span>${s.sp.fromFunds?`<span>${fmt(s.sp.fromFunds)} more paid from funds</span>`:''}</div></section>
  <div class="strip">
    <div class="cell"><div class="l">${s.past?'Available at close':'Available now'}</div><div class="v">${N('avail',s.avail)}</div><div class="s">Everyday accounts and cash</div></div>
    <div class="cell"><div class="l">Owed on cards</div><div class="v">${N('owed',s.owed+s.drafted)}</div><div class="s">${s.past?'At the end of '+nice(s.r.end):s.drafted?fmt(s.drafted)+' still in drafts':'Nothing in drafts'}</div></div>
    <div class="cell"><div class="l">After cards</div><div class="v ${s.avail-s.owed-s.drafted<0?'neg':''}">${N('after',s.avail-s.owed-s.drafted)}</div><div class="s">Available minus card debt</div></div>
    <div class="cell"><div class="l">In funds</div><div class="v">${N('funds',s.funds)}</div><div class="s">${Math.abs(s.drift)<1?'Matches savings accounts':'Off by '+fmt(Math.abs(s.drift))}</div></div>${nsd}
  </div>
  ${sec('Needs attention',`<span class="aside">${F.filter(f=>f.lv==='bad'||f.lv==='warn').length||'nothing'} to resolve</span>`,flagRows||'<div class="flag ok"><span class="stamp">Clear</span><span>No budget, card or bill needs you right now.</span></div>')}
  ${sec('Budgets','<span class="aside">the mark shows an even pace for today</span>',(exp.map(c=>barRow('b-'+c.id,c.name,s.sp.m[c.id]||0,budgetOf(c),s.elapsed)).join('')||'<p class="muted">Add spending categories in Setup.</p>')+(s.sp.m['']?barRow('b-none','Uncategorized',s.sp.m[''],0,null):''))}
  ${sec('Spending against budget',`<span class="aside">${lab}</span>`,paceChart(s))}
  <div class="grid2">
  ${sec('Bills this month',`<span class="aside">${fmt(billPaid)} of ${fmt(billTot)}</span>`,`<div class="bills">${bills.map(c=>`<div class="${paid[c.id]?'done':''}" title="${fmt(+c.budget||0)}${c.due?' · due day '+c.due:''}"><span class="box">${paid[c.id]?'✓':''}</span>${esc(c.name)}</div>`).join('')||'<span class="muted">No bills yet.</span>'}</div>`)}
  ${sec('Cards','<button class="link sp" data-act="go" data-v="payday">Drafts</button>',C.accounts.filter(isCard).map(a=>{const o=-s.bal[a.id],cut=nextDay(a.cut,s.t),pay=nextDay(a.pay,s.t),dr=draftSum(a.id);
    return`<div class="row"><div><div class="t">${esc(a.name)}</div><div class="m">${cut?'closes '+nice(cut):'no cut day'} · ${pay?'pay by '+nice(pay):'no pay day'}</div></div><span class="lead"></span><div class="v">${fmt(o,a.cur)}${dr?`<div class="m">+ ${fmt(dr,a.cur)} drafted</div>`:''}</div></div>`}).join('')||'<p class="muted">No cards yet.</p>')}
  </div>
  ${sec('Accounts','',C.accounts.filter(a=>!isCard(a)).map(a=>`<div class="row"><div><span class="t">${esc(a.name)}</span> ${a.savings?'<span class="tag">savings</span>':''}<div class="m">${a.checked?'checked '+nice(a.checked):'not checked yet'}</div></div><span class="lead"></span><div class="v ${s.bal[a.id]<0?'neg':''}">${fmt(s.bal[a.id],a.cur)}</div></div>`).join(''))}`}

function deskHtml(s){if(!C.accounts.length)return'<header class="sh"><h2>Add a movement</h2></header><p class="muted">Set up an account first.</p>';
  const rec=ui.recent.map(id=>T.find(x=>x.id===id)).filter(Boolean).slice(0,5);
  return`<header class="sh"><h2>Add a movement</h2><button class="link sp" data-act="toggleDesk">Hide</button></header>${txForm(ui.qa,'qa')}${impact(s)}
  <button class="btn pri" data-act="addTx" style="width:100%;margin-top:14px;padding:12px;border-radius:14px">Add</button>
  ${rec.length?`<div style="margin-top:18px"><h2 style="margin-bottom:6px;font-size:14px">Just added</h2>${rec.map(txRow).join('')}</div>`:''}`}

function paceChart(s){const W=640,H=170,px=8,py=16,n=s.len,days=[];let cum=0;const by={};
  T.forEach(x=>{if(x.t==='expense'&&inR(x,s.r)&&!x.f&&(cat(x.c)||{}).kind!=='bill')by[x.d]=(by[x.d]||0)+x.base});
  for(let i=0;i<Math.min(s.done,n);i++){cum+=by[addDays(s.r.start,i)]||0;days.push(cum)}
  const max=Math.max(s.budget,cum,1),X=i=>px+(n>1?i/(n-1):0)*(W-2*px),Y=v=>H-py-(v/max)*(H-2*py);
  const pts=days.map((v,i)=>X(i).toFixed(1)+','+Y(v).toFixed(1));
  const area=days.length?`M${X(0)},${Y(0)} L${pts.join(' L')} L${X(days.length-1)},${Y(0)} Z`:'';
  const lx=days.length?X(days.length-1):X(0),ly=days.length?Y(cum):Y(0),col=cum>s.budget?'var(--red)':'var(--accent)';
  return`<div class="scroll"><svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:320px" role="img" aria-label="Cumulative spending compared with an even pace to ${fmt(s.budget)}">
  ${[0,.5,1].map(f=>`<line x1="${px}" x2="${W-px}" y1="${Y(max*f)}" y2="${Y(max*f)}" stroke="var(--rule)" stroke-width="1"/><text x="${px}" y="${Y(max*f)-4}" font-size="10" fill="var(--muted)">${fmt(max*f)}</text>`).join('')}
  <line x1="${X(0)}" y1="${Y(0)}" x2="${X(n-1)}" y2="${Y(s.budget)}" stroke="var(--muted)" stroke-dasharray="2 6" stroke-width="1.5" stroke-linecap="round"/>
  <text x="${W-px}" y="${Math.max(11,Y(s.budget)-6)}" text-anchor="end" font-size="10" fill="var(--muted)">even pace to ${fmt(s.budget)}</text>
  ${area?`<path d="${area}" fill="var(--accent)" opacity=".13"/><polyline class="draw" pathLength="1" points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${lx}" cy="${ly}" r="4.5" fill="var(--paper)" stroke="${col}" stroke-width="2"/><text x="${Math.min(W-px,Math.max(60,lx))}" y="${Math.max(11,ly-10)}" text-anchor="${lx>W/2?'end':'start'}" font-size="11" font-weight="600" fill="var(--ink)">${fmt(cum)} ${s.past?'total':'today'}</text>`:''}
  <text x="${px}" y="${H-2}" font-size="10" fill="var(--muted)">${nice(s.r.start)}</text><text x="${W-px}" y="${H-2}" text-anchor="end" font-size="10" fill="var(--muted)">${nice(s.r.end)}</text></svg></div>`}

function txForm(o,p){const types=[['expense','Spend'],['income','Income'],['transfer','Transfer'],['fund','Fund']];const a=acc(o.a),to=acc(o.to),xc=o.t==='transfer'&&a&&to&&a.cur!==to.cur,role=fundRole(o);
  return`<div class="form"><div class="seg" role="group" aria-label="Type">${types.map(t=>`<button data-act="set" data-path="${p}.t" data-val="${t[0]}" class="${o.t===t[0]?'on':''}">${t[1]}</button>`).join('')}</div>
  <label class="f">Amount${o.t!=='fund'&&a?' in '+a.cur:''}<input id="${p}-amt" class="amt" type="text" inputmode="decimal" placeholder="0" data-b="${p}.amt" value="${esc(o.amt)}" autocomplete="off"></label>
  ${o.t==='fund'?`<div class="g2"><label class="f">From fund<select id="${p}-ff" data-b="${p}.ff">${fundOpts(o.ff,'Choose…')}</select></label><label class="f">To fund<select id="${p}-f" data-b="${p}.f">${fundOpts(o.f,'Choose…')}</select></label></div>`
  :`<div class="g2"><label class="f">${o.t==='transfer'?'From':o.t==='income'?'Into':'Paid with'}<select id="${p}-a" data-b="${p}.a">${accOpts(o.a)}</select></label>
  ${o.t==='transfer'?`<label class="f">To<select id="${p}-to" data-b="${p}.to">${opt('','Choose…',o.to)}${accOpts(o.to,x=>x.id!==o.a)}</select></label>`
  :`<label class="f">Category<select id="${p}-c" data-b="${p}.c">${catOpts(o.c,o.t==='income'?['income']:['expense','bill'])}</select></label>`}</div>
  ${xc?`<label class="f">Amount that arrives in ${to.cur}<input id="${p}-toAmt" type="text" inputmode="decimal" data-b="${p}.toAmt" value="${esc(o.toAmt)}" placeholder="${r2(num(o.amt)*fxOf(a.cur)/fxOf(to.cur))}"></label>`:''}
  ${role?`<label class="f">${role==='in'?'Into which fund':role==='out'?'From which fund':'Covered by a fund (optional)'}<select id="${p}-f" data-b="${p}.f">${fundOpts(o.f,role==='tag'?'No fund':'Choose…')}</select></label>`:''}`}
  <div class="g2"><label class="f">Date<input id="${p}-d" type="date" data-b="${p}.d" value="${esc(o.d)}"></label>
  <label class="f">Note<input id="${p}-n" type="text" data-b="${p}.n" value="${esc(o.n)}" placeholder="What was it?"></label></div></div>`}
function buildTx(o){const amt=num(o.amt);if(!amt||(amt<0&&o.t!=='expense'))return'Enter an amount above zero.';if(!o.d)return'Pick a date.';
  const x={t:o.t,d:o.d,amt:r2(amt),n:(o.n||'').trim()};
  if(o.t==='fund'){if(!fund(o.f)||!fund(o.ff))return'Choose the fund to take from and the fund to move it to.';if(o.f===o.ff)return'Choose two different funds.';x.f=o.f;x.ff=o.ff;x.base=x.amt;return x}
  if(!acc(o.a))return'Choose an account.';x.a=o.a;x.base=toBase(x.amt,o.a);
  if(o.t==='transfer'){if(!acc(o.to)||o.to===o.a)return'Choose where the money goes.';x.to=o.to;if(curOf(o.a)!==curOf(o.to))x.toAmt=r2(num(o.toAmt)||x.amt*fxOf(curOf(o.a))/fxOf(curOf(o.to)))}
  else if(o.c)x.c=o.c;
  const role=fundRole(o);if(role==='in'||role==='out'){if(!fund(o.f))return'Choose the fund. '+(role==='in'?acc(o.t==='transfer'?o.to:o.a).name:acc(o.a).name)+' holds fund money.';x.f=o.f}else if(role==='tag'&&fund(o.f))x.f=o.f;
  return x}
function impact(s){const o=ui.qa,amt=num(o.amt);if(!(amt>0))return'<div class="impact muted">Type an amount to see what it does to your budget and balances before you add it.</div>';
  const L=[],a=acc(o.a),bal=id=>s.bal[id];
  if(o.t==='expense'){const c=cat(o.c),b=toBase(amt,o.a);
    if(c&&c.kind==='expense'&&!o.f){const bud=budgetOf(c),u=s.sp.m[c.id]||0,p1=bud?Math.min(100,u/bud*100):0,p2=bud?Math.min(100,(u+b)/bud*100):100;
      L.push(`<div><b>${esc(c.name)}</b> <span class="fig">${fmt(u)} → <b class="${u+b>bud?'neg':''}">${fmt(u+b)}</b> / ${fmt(bud)}</span><div class="bar"><i class="ghost ${u+b>bud?'bad':''}" data-k="ig" data-w="${p2.toFixed(1)}"></i><i data-k="ib" data-w="${p1.toFixed(1)}"></i></div>${u+b>bud?`<span class="neg">Puts it ${fmt(u+b-bud)} over.</span>`:`<span class="muted">${fmt(bud-u-b)} would be left.</span>`}</div>`);
      L.push(`<div>Left to spend <span class="fig">${fmt(s.left)} → <b class="${s.left-b<0?'neg':''}">${fmt(s.left-b)}</b></span></div>`)}
    else if(c&&c.kind==='bill')L.push(`<div><b>${esc(c.name)}</b> will be marked as paid this month${+c.budget?` (planned ${fmt(+c.budget)})`:''}.</div>`);
    if(a)L.push(isCard(a)?`<div>${esc(a.name)} owed <span class="fig">${fmt(-bal(a.id),a.cur)} → <b>${fmt(-bal(a.id)+amt,a.cur)}</b></span></div>`:`<div>${esc(a.name)} <span class="fig">${fmt(bal(a.id),a.cur)} → <b class="${bal(a.id)-amt<0?'neg':''}">${fmt(bal(a.id)-amt,a.cur)}</b></span></div>`)}
  else if(o.t==='income'){if(a)L.push(`<div>${esc(a.name)} <span class="fig">${fmt(bal(a.id),a.cur)} → <b>${fmt(bal(a.id)+amt,a.cur)}</b></span></div>`);}
  else if(o.t==='transfer'){const to=acc(o.to);if(a)L.push(`<div>${esc(a.name)} <span class="fig">${fmt(isCard(a)?-bal(a.id):bal(a.id),a.cur)} → <b class="${!isCard(a)&&bal(a.id)-amt<0?'neg':''}">${fmt(isCard(a)?-bal(a.id)+amt:bal(a.id)-amt,a.cur)}</b></span></div>`);
    if(to&&a){const ta=a.cur!==to.cur?(num(o.toAmt)||amt*fxOf(a.cur)/fxOf(to.cur)):amt;L.push(isCard(to)?`<div>${esc(to.name)} owed <span class="fig">${fmt(-bal(to.id),to.cur)} → <b>${fmt(-bal(to.id)-ta,to.cur)}</b></span></div>`:`<div>${esc(to.name)} <span class="fig">${fmt(bal(to.id),to.cur)} → <b>${fmt(bal(to.id)+ta,to.cur)}</b></span></div>`)}
    }
  else{if(fund(o.ff))L.push(`<div>${esc(fund(o.ff).name)} <span class="fig">${fmt(s.fb[o.ff])} → <b>${fmt(s.fb[o.ff]-amt)}</b></span></div>`);if(fund(o.f))L.push(`<div>${esc(fund(o.f).name)} <span class="fig">${fmt(s.fb[o.f])} → <b>${fmt(s.fb[o.f]+amt)}</b></span></div>`);
}
  if(o.t!=='fund'){const x=buildTx(o);if(typeof x==='string'){if(/fund/.test(x))L.push(`<div class="neg">${esc(x)}</div>`)}else if(x.f&&fund(x.f)){const d=fundDelta(x),nm=esc(fund(x.f).name);
    L.push(d?`<div>Fund <b>${nm}</b> <span class="fig">${fmt(s.fb[x.f])} → <b>${fmt(s.fb[x.f]+d)}</b></span></div>`:`<div class="muted">Covered by ${nm}, so it stays out of your budget. The fund itself goes down when you pay from savings.</div>`)}}
  return`<div class="impact" aria-live="polite">${L.join('')||'<span class="muted">Choose the details to see the effect.</span>'}</div>`}
function txRow(x){const a=acc(x.a),c=cat(x.c),sv=x.t==='expense'?-x.amt:x.amt,io=x.t==='expense'||x.t==='income',sign=io?(sv<0?'−':'+'):'';
  const title=x.n||(c?c.name:x.t==='transfer'?'Transfer':x.t==='fund'?'Fund move':x.t==='adjust'?'Balance correction':'Uncategorized');
  const meta=[nice(x.d),x.t==='transfer'?(a?a.name:'?')+' → '+((acc(x.to)||{}).name||'?'):x.t==='fund'?[fund(x.ff)&&fund(x.ff).name,fund(x.f)&&fund(x.f).name].filter(Boolean).join(' → '):(a?a.name:''),c&&x.n?c.name:'',x.t!=='fund'&&x.f&&fund(x.f)?'fund: '+fund(x.f).name:''].filter(Boolean).join(' · ');
  const fresh=ui.fresh&&ui.fresh.id===x.id&&Date.now()-ui.fresh.t<1100;
  return`<button class="li${fresh?' fresh':''}" data-act="edit" data-id="${x.id}"><div><div class="t">${esc(title)}</div><div class="m">${esc(meta)}</div></div><span class="lead"></span><div class="v ${(io&&sv>0)||(x.t==='adjust'&&x.amt>0)?'pos':''}">${sign}${fmt(io?Math.abs(x.amt):x.amt,x.t==='fund'?null:curOf(x.a))}</div></button>`}
function editModal(){const e=ui.edit;return`<header class="sh"><h2>Edit movement</h2><button class="link sp" data-act="closeEdit" data-force="1">Close</button></header>
  ${e.t==='adjust'?`<p class="muted">Balance correction of ${fmt(e.amtRaw,curOf(e.a))} on ${esc((acc(e.a)||{}).name)}.</p>`:txForm(e,'edit')}
  <div style="display:flex;gap:8px;margin-top:16px">${e.t==='adjust'?'':'<button class="btn pri" data-act="saveEdit">Save</button>'}<button class="btn danger" data-act="delTx" data-id="${e.id}">${ui.confirm==='tx'+e.id?'Confirm delete':'Delete'}</button></div>`}

function lineForm(id,l){const k=l.k||'out',o={amt:String(l.amt==null?'':l.amt),d:l.d||ui.dd||today(),n:l.n||'',c:l.c||'',f:l.f||'',ff:'',toAmt:''};
  if(k==='in'){o.t='income';o.a=id}else if(k.startsWith('to:')){o.t='transfer';o.a=id;o.to=k.slice(3);o.c=''}
  else if(k.startsWith('from:')){o.t='transfer';o.a=k.slice(5);o.to=id;o.c='';if(curOf(o.a)!==curOf(id)){o.toAmt=o.amt;o.amt=String(r2(num(l.amt)*fxOf(curOf(id))/fxOf(curOf(o.a))))}}
  else{o.t='expense';o.a=id}return o}
function lineEff(l){const a=num(l.amt),k=l.k||'out';return k==='in'||k.startsWith('from:')?a:-a}
function effSum(id){const d=D.cards[id];return d?r2((d.lines||[]).reduce((s,l)=>s+lineEff(l),0)):0}
function draftDiff(id,bal){const a=acc(id),d=D.cards[id];if(!a||!d||d.target===''||d.target==null)return null;return r2((isCard(a)?-num(d.target):num(d.target))-(bal[id]+effSum(id)))}
let memoKey='',memoMap={};
function memo(n){n=(n||'').trim().toLowerCase();if(!n)return null;const key=T.length+':'+(T[0]?T[0].id:'');
  if(key!==memoKey){memoKey=key;memoMap={};for(let i=T.length-1;i>=0;i--){const x=T[i];if(x.n&&x.c&&cat(x.c)&&(x.t==='expense'||x.t==='income')){const k=x.n.trim().toLowerCase(),v={c:x.c,f:x.f||'',t:x.t};memoMap[k]=v;const w=k.split(/\s+/)[0];if(w.length>=4)memoMap['~'+w]=v}}}
  const hit=memoMap[n]||memoMap['~'+n.split(/\s+/)[0]];if(hit)return hit;
  const c=C.cats.find(c=>c.name.length>=3&&n.includes(c.name.toLowerCase()));return c?{c:c.id,f:'',t:c.kind==='income'?'income':'expense'}:null}
function applyMemo(l){if(l.c||!l.n)return;const k=l.k||'out';if(k!=='out'&&k!=='in')return;const m=memo(l.n);if(m&&(m.t==='income')===(k==='in')){l.c=m.c;if(!l.f&&m.f&&fund(m.f))l.f=m.f}}
function parseAmt(t){t=String(t).replace(/[^\d.,-]/g,'');if(!/\d/.test(t))return NaN;const neg=t.includes('-');t=t.replace(/-/g,'');const lc=t.lastIndexOf(','),ld=t.lastIndexOf('.');let dec=-1;
  if(lc>=0&&ld>=0)dec=Math.max(lc,ld);else{const i=Math.max(lc,ld);if(i>=0){const after=t.length-i-1,cnt=(t.match(/[.,]/g)||[]).length;if(cnt===1&&after!==3)dec=i}}
  const whole=(dec>=0?t.slice(0,dec):t).replace(/[.,]/g,''),fr=dec>=0?t.slice(dec+1):'',v=parseFloat(whole+(fr?'.'+fr:''));return neg?-v:v}
function parsePaste(text){const out=[],yr=today().slice(0,4);String(text||'').split(/\r?\n/).forEach(raw=>{let line=raw.trim();if(!line)return;let d='',m=line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if(m)d=m[0];else{m=line.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);if(m&&+m[1]>=1&&+m[1]<=31&&+m[2]>=1&&+m[2]<=12){const y=m[3]?(m[3].length===2?'20'+m[3]:m[3]):yr;d=y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');if(!m[3]&&d>today())d=(+y-1)+d.slice(4)}else m=null}
  if(m)line=line.replace(m[0],'  ');
  const cells=line.split(/\t|;|\s{2,}/).map(c=>c.trim()).filter(Boolean),money=c=>/^[-+(]?\s*[₡$¢]?\s*[\d.,]*\d\)?\s*(CRC|USD)?$/i.test(c)&&!/^\d{7,}$/.test(c);
  let amt=NaN,ai=-1,desc;if(cells.length>1)for(let i=0;i<cells.length;i++)if(money(cells[i])){const v=parseAmt(cells[i]);if(v){amt=v;ai=i;break}}
  if(ai>=0)desc=cells.filter((c,i)=>i!==ai&&!money(c)&&!/^(CRC|USD|₡|\$)$/i.test(c)).join(' ');else{const t=line.match(/[-+]?[₡$]?\s?\d[\d.,]*/g);if(t){const last=t[t.length-1];amt=parseAmt(last);desc=line.slice(0,line.lastIndexOf(last)).trim()}else desc=line}
  if(!(Math.abs(amt)>0))return;const l={n:desc.replace(/\s+/g,' ').slice(0,80),amt:Math.abs(r2(amt)),k:'out',c:'',f:''};if(d)l.d=d;out.push(l)});return out}

function payday(s){const all=C.accounts,order=[...all.filter(a=>!isCard(a)&&!a.savings),...all.filter(isCard),...all.filter(a=>!isCard(a)&&a.savings)];
  let payTot=0;all.filter(isCard).forEach(a=>payTot+=(-s.bal[a.id]+draftSum(a.id))*fxOf(a.cur));
  const step=(n,title,aside,body)=>`<section class="sec"><header class="sh"><span class="no">${n}</span><h2>${title}</h2>${aside||''}</header>${body}</section>`;
  const done=order.filter(a=>a.checked&&dayDiff(a.checked,s.t)<=3).length;
  return`<div class="strip"><div class="cell"><div class="l">Cards to pay</div><div class="v">${N('p-pay',payTot)}</div><div class="s">Posted plus drafted, USD at ₡${esc(C.settings.fx)}</div></div>
  <div class="cell"><div class="l">Available now</div><div class="v">${N('p-av',s.avail)}</div><div class="s">Everyday accounts and cash</div></div>
  <div class="cell"><div class="l">After paying</div><div class="v ${s.avail-payTot<0?'neg':''}">${N('p-af',s.avail-payTot)}</div><div class="s">What the next two weeks start with</div></div></div>
  ${step(1,'Match each account with the bank',`<span class="aside">${done} of ${order.length} checked</span>`,`<div class="g2" style="grid-template-columns:minmax(150px,200px) 1fr;align-items:end;margin-bottom:10px"><label class="f">Date for new lines<input id="dd" type="date" data-b="dd" max="${today()}" value="${esc(ui.dd||today())}"></label><p class="muted small" style="margin:0">Lines without their own date are filed on this day, so spending you write up on payday still counts in the period it happened.</p></div>
  ${order.map(a=>accRow(a,s)).join('')}`)}
  ${saveStep(s,step)}
  ${step(3,'Bills still open this month','',(()=>{const m=monthOf(s.t),paid=new Set(T.filter(x=>x.t==='expense'&&inR(x,m)).map(x=>x.c)),open=C.cats.filter(c=>c.kind==='bill'&&!paid.has(c.id));
    return open.length?open.map(c=>`<div class="row"><div><div class="t">${esc(c.name)}</div><div class="m">${c.due?'due day '+esc(c.due):'no due day set'}</div></div><span class="lead"></span><div class="v">${fmt(+c.budget||0)}</div><button class="btn sm" data-act="payBill" data-id="${c.id}">${ui.openAcc?'Add line':'Add'}</button></div>`).join(''):'<p class="muted">Every bill is recorded for this month.</p>'})())}`}
function accRow(a,s){const d=D.cards[a.id]||{},n=(d.lines||[]).length,df=draftDiff(a.id,s.bal),open=ui.openAcc===a.id,recent=a.checked&&dayDiff(a.checked,s.t)<=3;
  const st=df!=null&&Math.abs(df)>=1?`<span class="tag warn">${fmt(Math.abs(df),a.cur)} off</span>`:df!=null?'<span class="tag ok">matches</span>':recent?'<span class="tag ok">checked</span>':'';
  return`<div class="acc${open?' open':''}"><button class="li" data-act="openAcc" data-id="${a.id}" aria-expanded="${open}"><div><div class="t">${esc(a.name)} ${isCard(a)?'<span class="tag">card</span>':a.savings?'<span class="tag">savings</span>':''}</div><div class="m">${a.checked?'checked '+nice(a.checked):'not checked yet'}${n?' · '+n+' line'+(n>1?'s':'')+' drafted':''}</div></div><span class="lead"></span>${st}<div class="v">${fmt(isCard(a)?-s.bal[a.id]:s.bal[a.id],a.cur)}</div><span class="chev" aria-hidden="true">›</span></button>
  ${open?`<div class="subcard accbody${Date.now()-ui.openAt<450?' in':''}">${reconCard(a,s)}</div>`:''}</div>`}
function draftTotals(id){const a=acc(id),bal=balances(),df=draftDiff(id,bal),exp=bal[id]+effSum(id);
  return`<span>${isCard(a)?'Owed':'Balance'} after these lines <b>${fmt(isCard(a)?-exp:exp,a.cur)}</b></span>${df==null?'<span class="muted">Type the bank balance to compare</span>':Math.abs(df)<1?'<span class="tag ok">matches the bank</span>':`<span class="tag warn">${fmt(Math.abs(df),a.cur)} ${df<0?'of spending still missing':'more in the bank than listed'}</span>`}${a.cur!==C.settings.base?`<span class="muted small">≈ ${fmt(Math.abs(exp)*fxOf(a.cur))}</span>`:''}`}
function reconCard(a,s){const id=a.id,d=D.cards[id]||{target:'',lines:[]},L=d.lines||[],owed=-s.bal[id],p=ui.pay[id]||{},from=p.from||a.payFrom||(C.accounts.find(x=>!isCard(x)&&!x.savings)||{}).id||'',df=draftDiff(id,s.bal),nPost=L.filter(l=>num(l.amt)>0).length;
  const others=C.accounts.filter(x=>x.id!==id),m=monthOf(ui.dd||s.t),paid=new Set(T.filter(x=>x.t==='expense'&&inR(x,m)).map(x=>x.c)),drafted=new Set();Object.values(D.cards).forEach(c=>(c.lines||[]).forEach(l=>l.c&&drafted.add(l.c)));
  const bills=a.savings?[]:C.cats.filter(c=>c.kind==='bill'&&!paid.has(c.id)&&!drafted.has(c.id));
  return`<label class="f">${isCard(a)?'Amount owed in the bank app':'Balance in the bank app'}<input id="dt-in-${id}" type="text" inputmode="decimal" data-dr="${id}.target" data-n="1" value="${esc(d.target==null?'':d.target)}" placeholder="${isCard(a)?'what the card says you owe':'what the account says you have'}"></label>
  ${bills.length?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;align-items:center"><span class="muted small">Open bills, tap to add:</span>${bills.map(c=>`<button class="btn sm" style="background:var(--paper)" data-act="billLine" data-id="${id}" data-c="${c.id}">${esc(c.name)} ${+c.budget?fmt(+c.budget):''}</button>`).join('')}</div>`:''}
  ${L.length?`<div class="scroll" style="margin-top:12px"><table style="min-width:640px"><tr><th style="width:128px">Date</th><th>What</th><th style="width:104px">Amount</th><th style="width:124px">Type</th><th>Category</th><th>Fund</th><th></th></tr>
  ${L.map((l,i)=>{const k=l.k||'out',role=fundRole(lineForm(id,l)),tr=k!=='out'&&k!=='in';return`<tr><td><input id="dl-${id}-${i}-d" type="date" data-dr="${id}.lines.${i}.d" value="${esc(l.d||ui.dd||today())}" max="${today()}" style="padding:7px 8px;border-radius:10px;font-size:13px"></td><td><input id="dl-${id}-${i}-n" type="text" data-dr="${id}.lines.${i}.n" value="${esc(l.n||'')}" placeholder="what was it?"></td><td><input id="dl-${id}-${i}-a" type="text" inputmode="decimal" data-dr="${id}.lines.${i}.amt" data-n="1" value="${esc(l.amt==null?'':l.amt)}"></td>
  <td><select id="dl-${id}-${i}-k" data-dr="${id}.lines.${i}.k">${opt('out',isCard(a)?'Charge':'Spend',k)}${opt('in',isCard(a)?'Refund':'Income',k)}<optgroup label="Transfer to">${others.map(x=>opt('to:'+x.id,'→ '+x.name,k)).join('')}</optgroup><optgroup label="${isCard(a)?'Payment from':'Transfer from'}">${others.filter(x=>!isCard(x)).map(x=>opt('from:'+x.id,'← '+x.name,k)).join('')}</optgroup></select></td>
  <td>${tr?'':`<select id="dl-${id}-${i}-c" data-dr="${id}.lines.${i}.c">${catOpts(l.c,k==='in'?['income']:['expense','bill'])}</select>`}</td><td>${role?`<select id="dl-${id}-${i}-f" data-dr="${id}.lines.${i}.f">${fundOpts(l.f,role==='tag'?'No':'Choose…')}</select>`:''}</td>
  <td><button class="btn sm" data-act="rmLine" data-id="${id}" data-i="${i}" aria-label="Remove line">×</button></td></tr>`}).join('')}</table></div>`:''}
  <div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap"><button class="link" data-act="addLine" data-id="${id}">+ Line</button><button class="link" data-act="togglePaste" data-id="${id}">${ui.pasteOpen===id?'Hide paste box':'Paste from the bank'}</button></div>
  ${ui.pasteOpen===id?`<div style="margin-top:10px"><textarea id="paste-${id}" data-b="paste.${id}" rows="4" placeholder="Paste rows copied from your bank: one movement per line, with its amount and, if it has one, its date">${esc(ui.paste[id]||'')}</textarea><button class="btn sm" data-act="paste" data-id="${id}" style="margin-top:6px;background:var(--paper)">Turn into lines</button></div>`:''}
  <div class="totals" id="dt-${id}">${draftTotals(id)}</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><button class="btn pri" data-act="post" data-id="${id}" ${nPost?'':'disabled'}>Post ${nPost||''} line${nPost===1?'':'s'}</button>
  ${!nPost&&df!=null&&Math.abs(df)>=1?`<button class="btn" style="background:var(--paper)" data-act="adjust" data-id="${id}">Record ${fmt(Math.abs(df),a.cur)} as a correction</button>`:''}
  ${a.interest&&df!=null&&df>=1?`<button class="btn" style="background:var(--paper)" data-act="intLine" data-id="${id}">Add ${fmt(df,a.cur)} as interest</button>`:''}
  ${!nPost&&(df==null||Math.abs(df)<1)?`<button class="btn" style="background:var(--paper)" data-act="checked" data-id="${id}">Mark checked</button>`:''}
  ${isCard(a)?`<label class="f" style="flex:1;min-width:120px">Pay from<select id="pf-${id}" data-b="pay.${id}.from">${accOpts(from,x=>!isCard(x))}</select></label>
  ${isSav(from)?`<label class="f" style="flex:1;min-width:120px">From which fund<select id="pfu-${id}" data-b="pay.${id}.f">${fundOpts(p.f,'Choose…')}</select></label>`:''}
  <label class="f" style="width:110px">Amount ${a.cur}<input id="pa-${id}" type="text" inputmode="decimal" data-b="pay.${id}.amt" value="${esc(p.amt!=null?p.amt:(owed>0?owed:''))}"></label>
  <button class="btn" style="background:var(--paper)" data-act="payCard" data-id="${id}">Record payment</button>`:''}</div>`}
function saveStep(s,step){const v=savePlan(s);
  if(!v.planned.length||!v.from||!v.to)return step(3,'Move money into savings','','<p class="muted">In Setup, give a fund a monthly plan and mark at least one account as holding fund money.</p>');
  return step(3,'Move money into savings',`<span class="aside">monthly plan split across ${v.P} payday${v.P>1?'s':''}</span>`,`<p class="muted small" style="margin:0 0 12px">Each amount is recorded as a transfer into savings and credited to its fund, so funds and savings always match.</p>
  <div class="g2" style="margin-bottom:12px"><label class="f">Take it from<select id="sv-from" data-b="sv.from">${accOpts(v.from.id,a=>!isCard(a)&&!a.savings)}</select></label><label class="f">Put it in<select id="sv-to" data-b="sv.to">${accOpts(v.to.id,a=>!isCard(a)&&a.savings)}</select></label></div>
  <div class="scroll"><table><tr><th>Fund</th><th class="r">Has now</th><th class="r">Moved this payday</th><th>Move now</th></tr>${v.planned.map(f=>`<tr><td><b>${esc(f.name)}</b></td><td class="r fig">${fmt(s.fb[f.id])}</td><td class="r fig">${v.done[f.id]?fmt(v.done[f.id]):'<span class="muted">nothing yet</span>'}</td><td><input id="pl-${f.id}" type="text" inputmode="decimal" data-b="plan.${f.id}" value="${esc(v.val(f))}"></td></tr>`).join('')}</table></div>
  <div class="totals"><span>Total <b>${fmt(v.tot)}</b></span><span>${esc(v.from.name)} after <b class="${v.after<0?'neg':''}">${fmt(v.after,v.from.cur)}</b></span><button class="btn pri" data-act="moveSavings" ${v.tot>0&&v.after>=-0.5&&!ui.busy?'':'disabled'}>Record ${fmt(v.tot)} in transfers</button>${v.tot<=0?'<span class="tag ok">this payday is done</span>':v.after<-0.5?`<span class="tag warn">${esc(v.from.name)} does not have enough</span>`:''}</div>`)}
function movements(s){const f=ui.filter,q=f.q.toLowerCase();const L=T.filter(x=>(!f.from||x.d>=f.from)&&(!f.to||x.d<=f.to)&&(!f.a||x.a===f.a||x.to===f.a)&&(!f.c||x.c===f.c)&&(!q||((x.n||'')+' '+((cat(x.c)||{}).name||'')).toLowerCase().includes(q)));
  let out=0,inc=0;L.forEach(x=>{if(x.t==='expense')out+=x.base;if(x.t==='income')inc+=x.base});
  return sec('Movements',`<span class="aside">${L.length} shown · out ${fmt(out)} · in ${fmt(inc)}</span>`,`<div class="g2" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:8px"><input id="fq" type="text" placeholder="search notes" data-b="filter.q" value="${esc(f.q)}" aria-label="Search notes"><select id="fa" data-b="filter.a" aria-label="Account">${opt('','All accounts',f.a)}${accOpts(f.a)}</select><select id="fc" data-b="filter.c" aria-label="Category">${catOpts(f.c,['expense','bill','income']).replace('Choose…','All categories')}</select>
  <label class="f">From<input id="ffrom" type="date" data-b="filter.from" value="${esc(f.from)}"></label><label class="f">To<input id="fto" type="date" data-b="filter.to" value="${esc(f.to)}"></label></div>
  <div class="chips" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn sm" data-act="span" data-v="period">This payday</button><button class="btn sm" data-act="span" data-v="month">This month</button><button class="btn sm" data-act="span" data-v="all">All time</button></div>
  ${L.slice(0,300).map(txRow).join('')||'<p class="muted">Nothing here yet. Press Add to write your first movement.</p>'}${L.length>300?'<p class="muted small">Showing the latest 300. Filter to find older ones.</p>':''}`)}

function funds(s){return`<div class="strip"><div class="cell"><div class="l">In funds</div><div class="v">${N('fd-t',s.funds)}</div><div class="s">What you have promised to goals</div></div><div class="cell"><div class="l">In savings accounts</div><div class="v">${N('fd-s',s.saved)}</div><div class="s">What the bank actually holds</div></div>
  <div class="cell"><div class="l">Difference</div><div class="v ${Math.abs(s.drift)<1?'':'neg'}">${N('fd-d',Math.abs(s.drift))}</div><div class="s">${Math.abs(s.drift)<1?'They match':s.drift>0?'Missing from savings':'Not assigned to a fund'}</div></div></div>
  ${interestSec()}
  ${sec('Funds','<span class="aside">a fund grows when you transfer into savings and shrinks when you pay from savings</span>',C.funds.map(f=>{const v=s.fb[f.id],g=+f.goal||0,pct=g>0?Math.max(0,Math.min(100,v/g*100)):0,left=g-v,mo=+f.monthly>0&&left>0?Math.ceil(left/f.monthly):null;
    return`<div class="brow"><span class="n">${esc(f.name)} ${v<0?'<span class="tag warn">lent out</span>':g&&v>=g?'<span class="tag ok">reached</span>':''}</span><div>${g?`<div class="bar"><i data-k="fb-${f.id}" data-w="${pct.toFixed(1)}"></i></div>`:''}<div class="m" style="margin-top:4px">${g?`${Math.round(pct)}% of ${fmt(g)}${left>0?' · '+fmt(left)+' to go':''}${mo?' · about '+mo+' month'+(mo>1?'s':'')+' at '+fmt(+f.monthly)+'/mo':''}`:(v<0?'money owed back to you':'no goal set')}</div></div><span class="a"><b class="${v<0?'neg':''}" style="font-size:14px">${fmt(v)}</b></span></div>`}).join('')||'<p class="muted">Add funds in Setup.</p>')}`}

function setup(){const inp=(path,v,n,w)=>`<input id="s-${path.replace(/\./g,'-')}" type="text" ${n?'inputmode="decimal" data-n="1"':''} data-cfg="${path}" value="${esc(v==null?'':v)}"${w?` style="width:${w}px"`:''}>`;
  const del=(k,i)=>`<button class="btn sm danger" data-act="del" data-k="${k}" data-i="${i}">${ui.confirm===k+i?'Confirm':'×'}</button>`;
  const addB=(k,kind)=>`<button class="link sp" data-act="addRow" data-k="${k}"${kind?` data-kind="${kind}"`:''}>+ Add</button>`;
  const catTable=(kind,title,amtLabel,due)=>sec(title,addB('cats',kind),`<div class="scroll"><table style="min-width:${due?380:300}px"><tr><th>Name</th><th>${amtLabel}</th>${due?'<th>Due day</th>':''}<th></th></tr>
    ${C.cats.map((c,i)=>c.kind!==kind?'':`<tr><td>${inp('cats.'+i+'.name',c.name)}</td><td>${inp('cats.'+i+'.budget',c.budget,1,120)}</td>${due?`<td>${inp('cats.'+i+'.due',c.due,1,60)}</td>`:''}<td class="r">${del('cats',i)}</td></tr>`).join('')}</table></div>`);
  return sec('Accounts and cards',addB('accounts'),`<div class="scroll"><table style="min-width:860px"><tr><th>Name</th><th>Type</th><th>Currency</th><th>Starting balance (cards: owed)</th><th>Holds fund money</th><th>Earns interest</th><th>Cut day</th><th>Pay day</th><th></th></tr>
  ${C.accounts.map((a,i)=>`<tr><td>${inp('accounts.'+i+'.name',a.name)}</td><td><select id="s-ak-${i}" data-cfg="accounts.${i}.kind">${['bank','cash','certificate','card'].map(k=>opt(k,k==='card'?'Credit card':k[0].toUpperCase()+k.slice(1),a.kind)).join('')}</select></td>
  <td><select id="s-ac-${i}" data-cfg="accounts.${i}.cur">${[...new Set([C.settings.base,'USD','CRC',a.cur])].map(c=>opt(c,c,a.cur)).join('')}</select></td><td>${inp('accounts.'+i+'.open',a.open,1,130)}</td>
  <td>${isCard(a)?'':`<input id="s-as-${i}" type="checkbox" data-cfg="accounts.${i}.savings" ${a.savings?'checked':''} aria-label="Holds fund money">`}</td><td>${isCard(a)?'':`<input id="s-ai-${i}" type="checkbox" data-cfg="accounts.${i}.interest" ${a.interest?'checked':''} aria-label="Earns interest">`}</td><td>${isCard(a)?inp('accounts.'+i+'.cut',a.cut,1,56):''}</td><td>${isCard(a)?inp('accounts.'+i+'.pay',a.pay,1,56):''}</td><td class="r">${del('accounts',i)}</td></tr>`).join('')}</table></div>
  <p class="muted small">Cut day is when the statement closes. Pay day is the bank's due date. Both are days of the month and only drive reminders.</p>`)+
  `<div class="grid2">${catTable('expense','Spending categories','Monthly budget')}${catTable('bill','Bills and subscriptions','Monthly amount',1)}${catTable('income','Income','Expected per month')}
  ${sec('Funds',addB('funds'),`<div class="scroll"><table style="min-width:480px"><tr><th>Name</th><th>Goal</th><th>Starting amount</th><th>Monthly plan</th><th></th></tr>
  ${C.funds.map((f,i)=>`<tr><td>${inp('funds.'+i+'.name',f.name)}</td><td>${inp('funds.'+i+'.goal',f.goal,1,100)}</td><td>${inp('funds.'+i+'.open',f.open,1,100)}</td><td>${inp('funds.'+i+'.monthly',f.monthly,1,90)}</td><td class="r">${del('funds',i)}</td></tr>`).join('')}</table></div>`)}
  ${sec('Preferences','',`<div class="form"><div class="g2"><label class="f">Main currency<select id="s-base" data-cfg="settings.base">${['CRC','USD','EUR','MXN','COP','GBP'].map(c=>opt(c,c,C.settings.base)).join('')}</select></label>
  <label class="f">Exchange rate (main currency per 1 USD)${inp('settings.fx',C.settings.fx,1)}</label></div>
  <div class="g2"><label class="f">Paydays (days of the month, comma separated)<input id="s-pd" type="text" data-cfg="settings.paydays" data-list="1" value="${esc((C.settings.paydays||[]).join(', '))}"></label>
  <label class="f">No-spend days goal per month${inp('settings.noSpend',C.settings.noSpend,1)}</label></div>
  <label class="f">Tracking since (Home will not go back further than this)<input id="s-start" type="date" data-cfg="settings.start" max="${today()}" value="${esc(startDate())}"></label>
  <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><button class="btn" data-act="fxFetch">Use today's reference rate</button><label class="check" style="margin:0"><input id="s-fxauto" type="checkbox" data-cfg="settings.fxAuto" ${C.settings.fxAuto?'checked':''}><span>Update it automatically each day</span></label><span class="muted small">${C.settings.fxDate?'Last fetched '+nice(C.settings.fxDate)+'. ':''}Central bank sell rate for the dollar, in colones.</span></div></div>`)}</div>${importSec()}${accountSec()}${usersSec()}${backupSec()}`}

/* ---------- history import from the Google Sheet ---------- */
const imp={state:'idle',msg:'',data:null,done:0,total:0};let impT=0;
const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,ene:1,abr:4,ago:8,dic:12,set:9};
function sheetNum(v){if(v==null)return NaN;const s=String(v).replace(/[₡$\s,]/g,'');if(s===''||s==='-')return 0;const n=parseFloat(s);return isFinite(n)?n:NaN}
function sheetDate(s,mq,yr,prev){s=String(s||'').trim();let r,mo=0,d=0,y=+yr>1990?+yr:0;
  if(r=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)){mo=+r[1];d=+r[2];y=+r[3];if(y<100)y+=2000}
  else if(r=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)){y=+r[1];mo=+r[2];d=+r[3]}
  else if(r=s.match(/^(\d{1,2})\/(\d{1,2})$/)){mo=+r[1];d=+r[2]}
  else if(r=s.match(/^([A-Za-zñ]{3,})[-\s.](\d{1,2})$/)){mo=MON[r[1].slice(0,3).toLowerCase()]||0;d=+r[2]}
  else if(r=s.match(/^(\d{1,2})[-\s.]([A-Za-zñ]{3,})$/)){mo=MON[r[2].slice(0,3).toLowerCase()]||0;d=+r[1]}
  else return prev||'';
  if(!mo&&+mq>=1&&+mq<=12)mo=+mq;if(!y)y=prev?+prev.slice(0,4):+today().slice(0,4);
  if(!(mo>=1&&mo<=12&&d>=1&&d<=31))return prev||'';
  return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0')}
function mapSheet(vals,dash,sf,cfg0){const cfg=clone(cfg0),warn=[],tx=[],lc=s=>String(s||'').trim().toLowerCase(),slug=s=>lc(s).replace(/[^a-z0-9]+/g,'')||uid();
  const accBy={},fundBy={},sheetCur={},sheetFund={};cfg.accounts.forEach(a=>accBy[lc(a.name)]=a);cfg.funds.forEach(f=>fundBy[lc(f.name)]=f);
  const getAcc=n=>{const k=lc(n);if(!accBy[k]){const a={id:'a'+slug(n),name:String(n).trim(),kind:'bank',cur:cfg.settings.base,open:0};cfg.accounts.push(a);accBy[k]=a;warn.push('Account "'+a.name+'" was not in the app and has been added.')}return accBy[k]};
  const getFund=n=>{const k=lc(n);if(!k)return null;if(!fundBy[k]){const f={id:'f'+slug(n),name:String(n).trim(),goal:'',open:0,monthly:''};cfg.funds.push(f);fundBy[k]=f}return fundBy[k]};
  const getCat=(n,kind)=>{const k=lc(n);if(!k)return null;let c=cfg.cats.find(c=>lc(c.name)===k&&c.kind===kind)||cfg.cats.find(c=>lc(c.name)===k&&(kind==='income')===(c.kind==='income'));if(!c){c={id:'c'+slug(n)+kind[0],name:String(n).trim(),kind,budget:''};cfg.cats.push(c)}return c};
  (dash||[]).forEach(r=>{const n=String((r||[])[1]||'').trim();if(!n||/^total$/i.test(n))return;const a=getAcc(n);a.open=sheetNum(r[6])||0;const c=sheetNum(r[12]);if(isFinite(c))sheetCur[a.id]=c});
  (sf||[]).forEach(r=>{const n=String((r||[])[1]||'').trim();if(!n||/total/i.test(n))return;const f=getFund(n);f.open=sheetNum(r[7])||0;const g=sheetNum(r[3]);if(g>0&&!+f.goal)f.goal=g;const t=sheetNum(r[11]);if(isFinite(t))sheetFund[f.id]=t});
  const R=[];let prev='';(vals||[]).forEach((r,i)=>{r=r||[];const type=lc(r[1]),an=String(r[5]||'').trim(),amt=sheetNum(r[4]),d=sheetDate(r[0],r[8],r[9],prev);if(d)prev=d;
    if(!type||!an)return;if(!isFinite(amt)||!d){warn.push('Row '+(i+11)+' skipped: '+(d?'the amount "'+r[4]+'" is not a number':'no date could be read')+'.');return}if(!amt)return;
    R.push({i:i+11,d,type,sub:String(r[2]||'').trim(),amt:r2(amt),a:getAcc(an),n:String(r[6]||'').trim(),used:false})});
  // an annual sheet: a handful of rows typed with another year are typos for the sheet's own year
  const yc={};R.forEach(r=>{const y=r.d.slice(0,4);yc[y]=(yc[y]||0)+1});const dom=Object.keys(yc).sort((a,b)=>yc[b]-yc[a])[0],off=R.filter(r=>r.d.slice(0,4)!==dom);
  if(dom&&off.length&&off.length<=R.length*0.1){const ys=[...new Set(off.map(r=>r.d.slice(0,4)))].sort().join(', ');off.forEach(r=>{r.d=dom+r.d.slice(4)});warn.unshift(off.length+' row'+(off.length>1?'s were':' was')+' dated '+ys+' in the sheet and '+(off.length>1?'were':'was')+' read as '+dom+' (rows '+off.slice(0,6).map(r=>r.i).join(', ')+(off.length>6?', …':'')+').')}
  const fxA=a=>a.cur===cfg.settings.base?1:(+cfg.settings.fx||1),put=(r,o)=>{o.id='s'+r.i;o.d=o.d||r.d;o.base=r2(Math.abs(o.amt)*fxA(r.a))*(o.amt<0?-1:1);o.n=o.n!=null?o.n:r.n;o.src='sheet';tx.push(o)};
  let nPair=0,nSave=0;
  // two rows with opposite amounts and no category are a move between accounts
  R.forEach((r,k)=>{if(r.used||r.type!=='expense'||r.sub)return;for(let j=k+1;j<Math.min(R.length,k+4);j++){const s=R[j];if(!s.used&&s.type==='expense'&&!s.sub&&s.a!==r.a&&Math.abs(s.amt+r.amt)<0.01){const from=r.amt>0?r:s,to=r.amt>0?s:r;r.used=s.used=true;nPair++;put(r,{t:'transfer',a:from.a.id,to:to.a.id,amt:Math.abs(r.amt),n:r.n||s.n||'Moved between accounts'});break}}});
  // an "Expense / Savings" row is the other side of the deposits into funds around it
  const eq=(a,b)=>Math.abs(a-b)<0.5;
  R.forEach((S,k)=>{if(S.used||S.type!=='expense'||lc(S.sub)!=='savings'||!(S.amt>0))return;const ok=c=>!c.used&&c.type==='saving'&&c.amt>0;let pick=null;
    const same=R.filter(c=>ok(c)&&c.d===S.d);if(same.length&&eq(same.reduce((t,c)=>t+c.amt,0),S.amt))pick=same;
    const run=(step,dateOnly)=>{let sum=0;const got=[];for(let j=k+step,n=0;j>=0&&j<R.length&&n<40;j+=step,n++){const c=R[j];if(!ok(c)||(dateOnly&&c.d!==S.d))continue;sum+=c.amt;got.push(c);if(eq(sum,S.amt))return got;if(sum>S.amt+0.5)return null}return null};
    if(!pick)pick=run(-1,true)||run(1,true)||run(-1,false)||run(1,false);
    if(!pick){warn.push('Row '+S.i+': '+fmt(S.amt)+' sent to savings on '+nice(S.d)+' has no matching fund deposits, so it is kept as a "Savings" expense.');return}
    S.used=true;nSave++;pick.forEach(c=>{c.used=true;const f=getFund(c.sub);const o={t:'transfer',a:S.a.id,to:c.a.id,amt:c.amt,n:c.n||S.n||''};if(f){o.f=f.id;o.fd=c.amt}put(c,o)})});
  R.forEach(r=>{if(r.used)return;
    if(r.type==='saving'){const f=getFund(r.sub),o=r.amt>0?{t:'income',a:r.a.id,amt:r.amt}:{t:'expense',a:r.a.id,amt:-r.amt};if(f){o.f=f.id;o.fd=r.amt}else warn.push('Row '+r.i+': a Saving row with no fund name.');
      if(r.amt>0&&/inter[eé]s|ganancia|rendimiento/i.test(r.n))o.c=getCat('Interes','income').id;put(r,o)}
    else if(r.type==='income'){const c=getCat(r.sub,'income'),o={t:'income',a:r.a.id,amt:r.amt};if(c)o.c=c.id;put(r,o)}
    else{const c=getCat(r.sub,r.type==='bill'?'bill':'expense'),o={t:'expense',a:r.a.id,amt:r.amt};if(c)o.c=c.id;put(r,o)}});
  const ab={},fb={};cfg.accounts.forEach(a=>ab[a.id]=a.kind==='card'?-(+a.open||0):(+a.open||0));cfg.funds.forEach(f=>fb[f.id]=+f.open||0);
  tx.forEach(x=>{if(x.t==='expense')ab[x.a]-=x.amt;else if(x.t==='income')ab[x.a]+=x.amt;else{ab[x.a]-=x.amt;ab[x.to]+=x.amt}if(x.f&&x.fd!=null)fb[x.f]+=x.fd});
  const ds=tx.map(x=>x.d).sort();if(ds.length)cfg.settings.start=ds[0];
  return{cfg,tx,warn,nPair,nSave,first:ds[0]||'',last:ds[ds.length-1]||'',
    accs:cfg.accounts.filter(a=>a.id in sheetCur).map(a=>({name:a.name,sheet:sheetCur[a.id],calc:r2(ab[a.id]),cur:a.cur})),
    funds:cfg.funds.filter(f=>f.id in sheetFund).map(f=>({name:f.name,sheet:sheetFund[f.id],calc:r2(fb[f.id])}))}}
function impError(e){return(e&&e.message)||'That file could not be read. Download the spreadsheet again as Excel (.xlsx) and retry.'}
async function impRead(file){if(!file||imp.state==='reading'||imp.state==='writing')return;imp.state='reading';imp.msg='';render();
  try{if(!window.XLSX)throw{message:'The spreadsheet reader did not load. Check your connection and reload the page.'};
    const wb=XLSX.read(await file.arrayBuffer()),pad=n=>String(n).padStart(2,'0');
    const grid=(name,r0,r1,c0,c1,dateCol)=>{const key=Object.keys(wb.Sheets).find(k=>k.trim().toLowerCase()===name.toLowerCase()),ws=key&&wb.Sheets[key];if(!ws)throw{message:'The file has no "'+name+'" tab. Download the whole budget spreadsheet as Excel (.xlsx).'};
      const end=XLSX.utils.decode_range(ws['!ref']||'A1').e.r+1,out=[];
      for(let r=r0;r<=Math.min(r1||end,end);r++){const row=[];for(let c=c0;c<=c1;c++){const cell=ws[XLSX.utils.encode_cell({r:r-1,c})];let v='';
        if(cell){if(cell.t==='n'){if(c===dateCol){const p=XLSX.SSF.parse_date_code(cell.v);v=p&&p.y>1990?p.y+'-'+pad(p.m)+'-'+pad(p.d):(cell.w||'')}else v=cell.v}else if(cell.t==='e')v='';else v=cell.w!=null?cell.w:String(cell.v==null?'':cell.v)}row.push(v)}out.push(row)}return out};
    const vals=grid('Transactions',11,0,8,17,8),dash=grid('Account dashboard',10,43,0,12,-1),sf=grid('Sinking funds',16,31,0,11,-1);
    if(!vals.some(r=>r[1]))throw{message:'The Transactions tab has no rows.'};
    imp.data=mapSheet(vals,dash,sf,C);imp.state='preview'}catch(e){imp.state='error';imp.msg=impError(e)}render()}
async function impWrite(){const D0=imp.data;if(!D0||imp.state!=='preview')return;imp.state='writing';imp.done=0;render();
  try{const keep=new Set(D0.tx.map(x=>x.id)),old={};T.forEach(x=>old[x.id]=x);
    const same=x=>{const o=old[x.id];return o&&['t','d','a','to','amt','c','f','fd','n'].every(k=>(o[k]==null?'':o[k])===(x[k]==null?'':x[k]))};
    const dels=T.filter(x=>x.src==='sheet'&&!keep.has(x.id)).map(x=>x.id),puts=D0.tx.filter(x=>!same(x)).map(x=>Object.assign({ts:+x.id.slice(1)||0},x));imp.total=dels.length+puts.length;
    C=norm(D0.cfg);ui.off=0;await api('PUT','/api/config',C);
    for(let i=0;i<Math.max(1,Math.ceil(puts.length/250));i++){const chunk=puts.slice(i*250,i*250+250);await api('POST','/api/tx/bulk',{put:chunk,del:i===0?dels:[]});imp.done+=chunk.length+(i===0?dels.length:0);render()}
    imp.state='done';imp.msg=D0.tx.length+' movements are in, from '+nice(D0.first)+', '+D0.first.slice(0,4)+' to '+nice(D0.last)+', '+D0.last.slice(0,4)+'.';imp.data=null;await loadState()}
  catch(e){imp.state='error';imp.msg='Saving stopped partway ('+imp.done+' of '+imp.total+'). Choose the file and import again to finish; nothing is duplicated.'}
  render()}
function importSec(){const d=imp.data,row=(n,a,b,cur)=>`<tr><td>${esc(n)}</td><td class="r fig">${fmt(a,cur)}</td><td class="r fig">${fmt(b,cur)}</td><td class="r"><span class="tag warn">${fmt(b-a,cur)}</span></td></tr>`;
  let body='';
  if(imp.state==='reading')body='<p class="muted">Reading your sheet…</p>';
  else if(imp.state==='writing')body=`<p>Saving ${imp.done} of ${imp.total}. Keep this page open.</p><div class="bar"><i data-k="imp" data-w="${imp.total?(imp.done/imp.total*100).toFixed(1):0}"></i></div>`;
  else if(imp.state==='done')body=`<div class="flag ok"><span class="stamp">Done</span><span>${esc(imp.msg)}</span></div>`;
  else if(imp.state==='error')body=`<div class="flag bad"><span class="stamp">Stopped</span><span>${esc(imp.msg)}</span></div>`;
  else if(imp.state==='preview'&&d){const ba=d.accs.filter(a=>Math.abs(a.sheet-a.calc)>=1),bf=d.funds.filter(f=>Math.abs(f.sheet-f.calc)>=1);
    body=`<p><b>${d.tx.length} movements</b> from ${nice(d.first)}, ${d.first.slice(0,4)} to ${nice(d.last)}, ${d.last.slice(0,4)}. ${d.nSave} savings transfers and ${d.nPair} moves between accounts were paired up.</p>
    <div class="chips" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><span class="tag ${ba.length?'warn':'ok'}">${d.accs.length-ba.length} of ${d.accs.length} account balances match the sheet</span><span class="tag ${bf.length?'warn':'ok'}">${d.funds.length-bf.length} of ${d.funds.length} funds match the sheet</span></div>
    ${ba.length||bf.length?`<div class="scroll"><table style="min-width:420px"><tr><th>Does not match</th><th class="r">Sheet says</th><th class="r">Import gives</th><th class="r">Difference</th></tr>${ba.map(a=>row(a.name,a.sheet,a.calc,a.cur)).join('')}${bf.map(f=>row('Fund: '+f.name,f.sheet,f.calc)).join('')}</table></div><p class="muted small">A difference usually means a row in the sheet that its own formulas skip, such as an amount typed as text.</p>`:''}
    ${d.warn.length?`<details style="margin:8px 0"><summary class="small muted" style="cursor:pointer">${d.warn.length} note${d.warn.length>1?'s':''} about rows</summary><ul class="small muted" style="margin:6px 0;padding-left:18px">${d.warn.slice(0,25).map(w=>'<li>'+esc(w)+'</li>').join('')}</ul></details>`:''}
    <p class="muted small">Importing sets starting balances to the sheet's beginning balances and replaces anything imported from the sheet before. Movements you added in the app stay as they are.</p>
    <button class="btn pri" data-act="impWrite">Import ${d.tx.length} movements</button>`}
  return sec('History from your Google Sheet','',`<div class="form"><label class="f">Budget spreadsheet, downloaded from Google Sheets as Excel (.xlsx)<input id="impFile" type="file" accept=".xlsx"></label>
  <p class="muted small" style="margin:0">In Google Sheets choose File, Download, Microsoft Excel. Quincena reads the Transactions, Account dashboard and Sinking funds tabs in your browser; the file itself is not uploaded.</p>${body}</div>`)}
/* ---------- interest ---------- */
function intCat(make){let c=C.cats.find(c=>c.kind==='income'&&/^inter/i.test(c.name));if(!c&&make){c={id:uid(),name:'Interest',kind:'income',budget:''};C.cats.push(c);saveCfg()}return c}
function interestSec(){const ic=intCat(),L=ic?T.filter(x=>x.t==='income'&&x.c===ic.id):[],accs=C.accounts.filter(a=>a.interest);if(!L.length&&!accs.length)return'';
  const t=today(),ym=t.slice(0,7),y=t.slice(0,4),by={},mon={};let m=0,yr=0,all=0;L.forEach(x=>{all+=x.base;if(x.d.slice(0,4)===y)yr+=x.base;if(x.d.slice(0,7)===ym)m+=x.base;by[x.a]=(by[x.a]||0)+x.base;mon[x.d.slice(0,7)]=(mon[x.d.slice(0,7)]||0)+x.base});
  const keys=[];for(let i=11;i>=0;i--){const d=pd(t);keys.push(iso(new Date(d.getFullYear(),d.getMonth()-i,1)).slice(0,7))}const max=Math.max(1,...keys.map(k=>mon[k]||0));
  const ids=[...new Set([...accs.map(a=>a.id),...Object.keys(by)])];
  return sec('Interest earned',`<span class="aside">money your accounts paid you for keeping it there</span>`,`<div class="strip" style="margin-bottom:14px"><div class="cell" style="box-shadow:none;background:var(--soft)"><div class="l">This month</div><div class="v">${N('i-m',m)}</div></div><div class="cell" style="box-shadow:none;background:var(--soft)"><div class="l">This year</div><div class="v">${N('i-y',yr)}</div></div><div class="cell" style="box-shadow:none;background:var(--soft)"><div class="l">All time</div><div class="v">${N('i-a',all)}</div></div></div>
  <div class="cols12" role="img" aria-label="Interest by month for the last twelve months">${keys.map(k=>`<div class="colb" title="${fmt(mon[k]||0)}"><div class="colt"><i style="height:${((mon[k]||0)/max*100).toFixed(1)}%"></i></div><span>${pd(k+'-01').toLocaleDateString('en-US',{month:'short'})}</span></div>`).join('')}</div>
  ${ids.map(id=>{const a=acc(id);return a?`<div class="row"><div class="t">${esc(a.name)}</div><span class="lead"></span><div class="v">${fmt(by[id]||0,a.cur)}</div></div>`:''}).join('')}
  ${L.length?'':'<p class="muted small">Nothing recorded yet. On Payday, when one of these accounts holds more than your lines add up to, add the difference as interest.</p>'}`)}

/* ---------- actions ---------- */
function setPath(o,p,v){const ks=p.split('.');for(let i=0;i<ks.length-1;i++){if(o[ks[i]]==null)o[ks[i]]={};o=o[ks[i]]}o[ks[ks.length-1]]=v}
function valOf(el){if(el.type==='checkbox')return el.checked;if(el.dataset.list)return el.value.split(/[,\s]+/).map(Number).filter(x=>x>=1&&x<=31).sort((a,b)=>a-b);if(el.dataset.n)return el.value.trim()===''?'':num(el.value);return el.value}
function ensureDraft(id){if(!D.cards[id])D.cards[id]={target:'',lines:[]};if(!D.cards[id].lines)D.cards[id].lines=[];return D.cards[id]}
function setDesk(v,focus){ui.desk=v;try{localStorage.setItem('quincena-desk',v?'1':'0')}catch(e){}render();if(v&&focus)setTimeout(()=>{const el=$('qa-amt');if(el)el.focus()},120)}
const acts={
  go(d){location.hash=d.v;ui.view=d.v;ui.confirm='';render();window.scrollTo(0,0)},
  mode(d){if(d.v===ui.mode)return;const r=range(ui.off),mid=addDays(r.start,Math.floor(dayDiff(r.start,r.end)/2)),was=ui.off;ui.mode=d.v;ui.off=was?offFor(mid):0;render()},
  shift(d){ui.off=+d.v?Math.max(minOff(),Math.min(0,ui.off+ +d.v)):0;render()},
  span(d){const r=d.v==='all'?{start:'',end:''}:d.v==='month'?monthOf(today()):periodOf(today());ui.filter.from=r.start;ui.filter.to=r.end;render()},
  set(d){setPath(ui,d.path,d.val);render()},
  toggleDesk(){setDesk(!ui.desk,true)},
  async addTx(){const x=buildTx(ui.qa);if(typeof x==='string')return toast(x);const id=await putTx(x);if(!id)return;ui.recent.unshift(id);ui.fresh={id,t:Date.now()};ui.qa.amt='';ui.qa.n='';ui.qa.toAmt='';render();const el=$('qa-amt');if(el)el.focus()},
  edit(d){const x=T.find(y=>y.id===d.id);if(!x)return;ui.confirm='';ui.edit={id:x.id,t:x.t,amt:String(x.amt),amtRaw:x.amt,a:x.a||'',to:x.to||'',toAmt:x.toAmt!=null?String(x.toAmt):'',c:x.c||'',f:x.f||'',ff:x.ff||'',d:x.d,n:x.n||''};render()},
  closeEdit(d,el,e){if(!d.force&&e&&e.target.closest('[data-stop]'))return;ui.edit=null;render()},
  async saveEdit(){const x=buildTx(ui.edit);if(typeof x==='string')return toast(x);x.id=ui.edit.id;const o=T.find(y=>y.id===x.id);if(o&&o.src)x.src=o.src;if(o&&o.fd!=null&&x.f)x.fd=(o.fd<0?-1:1)*Math.abs(x.t==='transfer'&&x.toAmt!=null?x.toAmt*fxOf(curOf(x.to)):x.base);ui.edit=null;await putTx(x);render()},
  async delTx(d){if(ui.confirm!=='tx'+d.id){ui.confirm='tx'+d.id;return render()}ui.confirm='';ui.edit=null;await delTx(d.id);render()},
  impWrite(){impWrite()},
  authMode(d){ui.auth.mode=d.v;ui.auth.err='';render()},
  async logout(){try{await api('POST','/api/auth/logout',{})}catch(e){}me=null;loaded=false;ui.auth.mode='in';ui.auth.err='';render()},
  async logoutAll(){if(ui.confirm!=='outall'){ui.confirm='outall';toast('Press again to sign out everywhere.');return}ui.confirm='';try{await api('POST','/api/auth/logout-all',{})}catch(e){}me=null;loaded=false;ui.auth.mode='in';render()},
  async changePass(){const p=ui.pw;if(!p.cur||!p.next)return toast('Enter your current and new password.');try{await api('POST','/api/auth/password',{current:p.cur,next:p.next});ui.pw={cur:'',next:''};me.mustChange=false;render();toast('Password changed')}catch(e){fail(e)}},
  async userAdd(){const n=ui.nu;try{const r=await api('POST','/api/users',{email:n.email,name:n.name,password:n.pass,role:n.role});ui.users=r.users;ui.nu={email:'',name:'',pass:'',role:'user'};render();toast('Account created')}catch(e){fail(e)}},
  async userToggle(d){try{const r=await api('PATCH','/api/users/'+d.id,{disabled:!d.on});ui.users=r.users;render()}catch(e){fail(e)}},
  async userReset(d){const pw=ui.reset[d.id]||'';try{const r=await api('PATCH','/api/users/'+d.id,{password:pw});ui.users=r.users;delete ui.reset[d.id];render();toast('Temporary password set')}catch(e){fail(e)}},
  async userDel(d){if(ui.confirm!=='user'+d.id){ui.confirm='user'+d.id;return render()}ui.confirm='';try{const r=await api('DELETE','/api/users/'+d.id);ui.users=r.users;render();toast('Account and its data deleted')}catch(e){fail(e)}},
  restoreText(){if(ui.confirm!=='restore'){ui.confirm='restore';return render()}ui.confirm='';doRestore(ui.restoreText)},
  async fxFetch(d){try{const r=await api('GET','/api/fx');C.settings.fx=r.venta;C.settings.fxDate=today();saveCfg();render();if(!(d&&d.quiet))toast('Rate set to '+r.venta+' (sell rate for '+r.date+')')}catch(e){if(!(d&&d.quiet))fail(e)}},

  intLine(d){const a=acc(d.id),df=draftDiff(d.id,balances());if(!a||!(df>=1))return;const dr=ensureDraft(d.id);dr.lines=dr.lines.filter(l=>l.n||num(l.amt)>0);dr.lines.push({n:'Interest',amt:df,k:'in',c:intCat(true).id,f:a.intFund&&fund(a.intFund)?a.intFund:''});saveDr();render()},
  openAcc(d){ui.openAcc=ui.openAcc===d.id?'':d.id;ui.openAt=Date.now();ui.confirm='';render()},
  togglePaste(d){ui.pasteOpen=ui.pasteOpen===d.id?'':d.id;render();if(ui.pasteOpen)setTimeout(()=>{const el=$('paste-'+d.id);if(el)el.focus()},60)},
  paste(d){const L=parsePaste(ui.paste[d.id]);if(!L.length)return toast('No amounts found in what you pasted.');L.forEach(applyMemo);const dr=ensureDraft(d.id);dr.lines=dr.lines.filter(l=>l.n||num(l.amt)>0).concat(L);ui.paste[d.id]='';ui.pasteOpen='';saveDr();render();toast(L.length+' line'+(L.length>1?'s':'')+' added. Check the types and categories.')},
  billLine(d){const c=cat(d.c);if(!c)return;const dr=ensureDraft(d.id);dr.lines=dr.lines.filter(l=>l.n||num(l.amt)>0);dr.lines.push({n:c.name,amt:+c.budget||'',k:'out',c:c.id,f:''});saveDr();render()},
  checked(d){const a=acc(d.id);if(a){a.checked=today();saveCfg();render();toast(a.name+' marked as checked')}},
  async adjust(d){const a=acc(d.id),diff=draftDiff(d.id,balances());if(!a||!diff)return;if(!await putTx({t:'adjust',d:ui.dd||today(),a:a.id,amt:diff,base:toBase(diff,a.id),n:'Balance correction'}))return;a.checked=today();saveCfg();render();toast('Correction recorded on '+a.name)},
  addLine(d){ensureDraft(d.id).lines.push({n:'',amt:'',c:'',f:'',k:'out'});saveDr();render();const i=D.cards[d.id].lines.length-1;setTimeout(()=>{const el=$('dl-'+d.id+'-'+i+'-n');if(el)el.focus()},60)},
  rmLine(d){ensureDraft(d.id).lines.splice(+d.i,1);saveDr();render()},
  async post(d){if(ui.busy)return;const a=acc(d.id),dr=ensureDraft(d.id),L=dr.lines.filter(l=>num(l.amt)>0);if(!L.length)return;const X=[];
    for(const l of L){const x=buildTx(lineForm(d.id,l));if(typeof x==='string')return toast('"'+(l.n||fmt(num(l.amt),a.cur))+'": '+x);X.push(x)}
    const df=draftDiff(d.id,balances()),ic=intCat();if(ic){const il=L.find(l=>l.c===ic.id&&l.f);if(il&&a.intFund!==il.f){a.intFund=il.f;saveCfg()}}ui.busy=true;render();try{for(const x of X)if(!await putTx(x))return}finally{ui.busy=false}
    dr.lines=dr.lines.filter(l=>!(num(l.amt)>0)&&l.n);saveDr();if(df!=null&&Math.abs(df)<1){a.checked=today();saveCfg()}render();toast(X.length+' line'+(X.length>1?'s':'')+' posted to '+a.name+(df!=null&&Math.abs(df)<1?'. It matches the bank.':''))},
  async payCard(d){const a=acc(d.id),p=ui.pay[d.id]||{},owed=-balances()[d.id],amt=num(p.amt!=null?p.amt:owed),from=acc(p.from)||acc(a.payFrom)||C.accounts.find(x=>!isCard(x)&&!x.savings);if(!(amt>0))return toast('Enter the amount you paid.');if(!from)return toast('Choose the account you paid from.');
    const x={t:'transfer',d:ui.dd||today(),a:from.id,to:a.id,n:'Card payment'};if(from.cur===a.cur)x.amt=r2(amt);else{x.toAmt=r2(amt);x.amt=r2(amt*fxOf(a.cur)/fxOf(from.cur))}x.base=toBase(x.amt,from.id);if(isSav(from.id)){if(!fund(p.f))return toast('Choose which fund pays this card.');x.f=p.f}
    if(await putTx(x)){delete ui.pay[d.id];if(a.payFrom!==from.id){a.payFrom=from.id;saveCfg()}const dr=D.cards[d.id];if(dr&&dr.target!==''&&dr.target!=null){const left=r2(num(dr.target)-amt);dr.target=left>=1?left:'';saveDr()}render();toast('Payment recorded for '+a.name)}},
  async moveSavings(){if(ui.busy)return;const v=savePlan(stats());if(!(v.tot>0))return toast('Nothing to move.');if(v.after<-0.5)return toast(v.from.name+' does not have enough for that.');
    ui.busy=true;render();let n=0;try{for(const f of v.planned){const b=r2(num(v.val(f)));if(!(b>0))continue;const x={t:'transfer',d:today(),a:v.from.id,to:v.to.id,f:f.id,amt:r2(b/fxOf(v.from.cur)),base:b,n:'Savings: '+f.name};if(v.from.cur!==v.to.cur)x.toAmt=r2(b/fxOf(v.to.cur));if(!await putTx(x))break;n++}}finally{ui.busy=false;ui.plan={};render()}
    toast(n+' transfer'+(n===1?'':'s')+' into '+v.to.name+' recorded')},
  payBill(d){if(ui.openAcc&&acc(ui.openAcc))return acts.billLine({id:ui.openAcc,c:d.id});const c=cat(d.id);ui.qa=Object.assign(blank(),{t:'expense',c:c.id,amt:String(+c.budget||''),a:ui.qa.a,d:today(),n:c.name});setDesk(true,true)},
  addRow(d){if(d.k==='accounts')C.accounts.push({id:uid(),name:'New account',kind:'bank',cur:C.settings.base,open:0});else if(d.k==='funds')C.funds.push({id:uid(),name:'New fund',goal:'',open:0,monthly:''});else C.cats.push({id:uid(),name:'New',kind:d.kind,budget:''});saveCfg();render()},
  del(d){const k=d.k,i=+d.i,it=C[k][i];if(!it)return;const used=T.filter(x=>k==='accounts'?x.a===it.id||x.to===it.id:k==='funds'?x.f===it.id||x.ff===it.id:x.c===it.id).length;if(used)return toast('"'+it.name+'" is used by '+used+' movement'+(used>1?'s':'')+'. Delete or change those first.');
    if(ui.confirm!==k+i){ui.confirm=k+i;return render()}ui.confirm='';C[k].splice(i,1);saveCfg();render()},
  backup(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({app:'quincena',at:new Date().toISOString(),config:C,drafts:D,movements:T})],{type:'application/json'}));a.download='quincena-backup-'+today()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const f=acts[b.dataset.act];if(f)f(b.dataset,b,e)});
document.addEventListener('input',e=>{const el=e.target,ds=el.dataset;
  if(ds.b){setPath(ui,ds.b,el.type==='checkbox'?el.checked:el.value);if(ds.b==='qa.a'||ds.b==='qa.t')ui.qa.toAmt='';render()}
  else if(ds.cfg){setPath(C,ds.cfg,valOf(el));saveCfg();if(el.tagName==='SELECT'||el.type==='checkbox')render()}
  else if(ds.dr){const id=ds.dr.split('.')[0];ensureDraft(id);setPath(D.cards,ds.dr,valOf(el));saveDr();const box=$('dt-'+id);if(box)box.innerHTML=draftTotals(id);if(el.tagName==='SELECT')render()}});
document.addEventListener('submit',e=>{if(e.target.id==='authForm'){e.preventDefault();authSubmit()}});
document.addEventListener('change',async e=>{const ds=e.target.dataset,el=e.target;
  if(el.id==='impFile'&&el.files[0])return impRead(el.files[0]);
  if(el.id==='restoreFile'&&el.files[0]){ui.restoreText=await el.files[0].text();ui.confirm='';render();return toast('File loaded. Press Restore to replace your data.')}
  if(ds.urole){try{const r=await api('PATCH','/api/users/'+ds.urole,{role:el.value});ui.users=r.users}catch(err){fail(err)}return render()}
  if(ds.me==='name'){try{const r=await api('PATCH','/api/me',{name:el.value});me=r.user;shell();render()}catch(err){fail(err)}return}
  if(ds.dr&&/\.n$/.test(ds.dr)){const p=ds.dr.split('.'),l=((D.cards[p[0]]||{}).lines||[])[+p[2]];if(l){applyMemo(l);saveDr()}}
  if(ds.dr&&/\.k$/.test(ds.dr)){const p=ds.dr.split('.'),l=((D.cards[p[0]]||{}).lines||[])[+p[2]];if(l){l.c='';l.f='';applyMemo(l);saveDr()}}
  if(ds.b==='qa.n'&&!ui.qa.c&&(ui.qa.t==='expense'||ui.qa.t==='income')){const m=memo(ui.qa.n);if(m&&(m.t==='income')===(ui.qa.t==='income')){ui.qa.c=m.c;if(m.f&&fundRole(Object.assign({},ui.qa,{c:m.c}))&&fund(m.f)&&!ui.qa.f)ui.qa.f=m.f;render()}}if(e.target.id==='jump'&&e.target.value){ui.off=offFor(e.target.value);render()}if(ds.cfg||ds.dr)render()});
document.addEventListener('keydown',e=>{const tg=e.target,typing=/INPUT|SELECT|TEXTAREA/.test(tg.tagName||'');
  if(e.key==='Escape'){if(ui.edit){ui.edit=null;render()}else if(ui.desk&&window.matchMedia&&matchMedia('(max-width:900px)').matches)setDesk(false)}
  if(e.key==='n'&&me&&!typing&&!e.metaKey&&!e.ctrlKey&&!ui.edit){e.preventDefault();setDesk(true,true)}
  if(e.key==='Enter'&&tg.tagName==='INPUT'){const id=tg.id||'';if(id.startsWith('dl-')){const m=id.match(/^dl-(.+)-(\d+)-[a-z]$/);if(m){tg.dispatchEvent(new Event('change',{bubbles:true}));acts.addLine({id:m[1]})}}else if(id.startsWith('pw-'))acts.changePass();else if(id.startsWith('qa-'))acts.addTx();else if(id.startsWith('edit-'))acts.saveEdit()}});
boot();
