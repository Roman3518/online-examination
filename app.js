let TOKEN=localStorage.getItem("tok"),ME=null,S={tab:"quizzes",mode:"student",msg:""},T=null;
const $=id=>document.getElementById(id),V=id=>$(id).value.trim();
const E=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const D=t=>new Date(t*1000).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
async function api(m,p,b){
  let r;
  try{r=await fetch(p,{method:m,headers:{"Content-Type":"application/json",...(TOKEN?{Authorization:"Bearer "+TOKEN}:{})},body:b?JSON.stringify(b):undefined})}
  catch(e){throw new Error("Cannot reach the server. Start it with 'python server.py' and open http://localhost:8000 in your browser.")}
  if(r.status===401&&ME){logout(true);throw new Error("Session expired.")}
  const t=await r.text();
  if(p.includes(".csv")&&r.ok)return t;
  let j=null;try{j=t?JSON.parse(t):null}catch(e){}
  if(j===null)throw new Error(t.trim().startsWith("<")||r.status===404||r.status===405||r.status===501
    ?"This page is not connected to the exam server. Open it through server.py (http://localhost:8000 or your Render link), not as a file or a static host such as GitHub Pages."
    :"The server is not responding properly (HTTP "+r.status+"). If it is hosted, wait a few seconds for it to wake up and try again.");
  if(!r.ok)throw new Error(j.error||"Something went wrong.");
  return j}
const go=(fn)=>async(...a)=>{try{S.msg="";await fn(...a)}catch(e){S.msg=e.message;if(!ME)authView();else if(Q)quiz();else if(ME.role==="admin")admin();else studentHome()}};
function initials(n){const p=(n||"").trim().split(/\s+/);return((p[0]?.[0]||"")+(p[1]?.[0]||"")).toUpperCase()||"?"}
function shell(body){return`<div class="top"><div><h1>Online Examination System</h1><div class="row" style="gap:10px"><span class="badge"><span class="av">${initials(ME.name)}</span><b>${E(ME.name)}</b><span>${E(ME.role)}</span></span><button class="g" onclick="logout()">Log out</button></div></div></div><main>${body}</main><footer>Online Examination System</footer>`}
function show(html){S.last=html;$("app").innerHTML=html}
// ---------- auth ----------
async function boot(){if(TOKEN){try{ME=await api("GET","/api/me")}catch(e){TOKEN=null}}ME?home():authView()}
function authView(){const reg=S.mode==="register",adm=S.mode==="admin";
 show(`<div class="authpage">
 <div class="auth-brand"><div class="auth-brand-inner"><div class="brand-logo">🎓 Online Examination System</div>
 <h1>Ace every test, right from your dashboard.</h1>
 <p>Timed and untimed quizzes, instant auto-grading, and a full answer review — built for your coursework.</p>
 <ul class="brand-points">
 <li><i>⏱</i> Timed quizzes with auto-submit</li>
 <li><i>✓</i> Instant scoring and pass/fail</li>
 <li><i>📊</i> Detailed answer-by-answer review</li>
 </ul></div></div>
 <div class="auth-formside"><div class="auth-card"><div class="card"><h1>${adm?"Admin login":reg?"Create student account":"Student login"}</h1><p class="mu">${adm?"Manage quizzes, students and results.":"Enter your details to continue."}</p>
 ${reg?'<label>Full name</label><input id="n" autocomplete="name">':""}<label>Email</label><input id="e" type="email" autocomplete="username"><label>Password</label><input id="p" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')doAuth()">
 <div class="err">${E(S.msg)}</div><button onclick="doAuth()" style="width:100%">${reg?"Register":"Log in"}</button>
 <div style="margin-top:12px;text-align:center" class="mu">${adm?'<a href="#" onclick="mode(\'student\')">Student login</a>':(reg?'<a href="#" onclick="mode(\'student\')">I already have an account</a>':'<a href="#" onclick="mode(\'register\')">Register as a student</a>')+' · <a href="#" onclick="mode(\'admin\')">Admin login</a>'}</div></div></div></div>
 </div>`)}
function mode(m){S.mode=m;S.msg="";authView();return false}
const doAuth=go(async()=>{const reg=S.mode==="register";
 if(reg){await api("POST","/api/register",{name:V("n"),email:V("e"),password:$("p").value});S.mode="student"}
 const r=await api("POST","/api/login",{email:V("e"),password:$("p").value,role:S.mode==="admin"?"admin":"student"});
 TOKEN=r.token;localStorage.setItem("tok",TOKEN);ME=r.user;S.tab="quizzes";home()});
function logout(quiet){clearInterval(T);if(!quiet&&TOKEN)api("POST","/api/logout").catch(()=>{});TOKEN=ME=null;localStorage.removeItem("tok");S.mode="student";authView()}
const home=go(()=>ME.role==="admin"?admin():studentHome());
// ---------- student ----------
async function studentHome(){const [qs,at]=await Promise.all([api("GET","/api/quizzes"),api("GET","/api/my/attempts")]);
 const pend=qs.filter(z=>!z.attempt_id).length;
 show(shell(`<div class="hero"><div><h2>Welcome back, ${E(ME.name.split(" ")[0])}</h2><p>${pend?`You have ${pend} quiz${pend>1?"zes":""} waiting to be attempted.`:"You're all caught up — no pending quizzes."}</p></div>
 <div class="tiles"><div class="tile"><b>${at.length}</b>Attempted</div><div class="tile"><b>${pend}</b>Pending</div></div></div>
 <div class="err">${E(S.msg)}</div><div class="card"><h2>Available quizzes</h2>${qs.map(z=>`<div class="qitem"><div class="qicon">${E(z.title[0])}</div><div style="flex:1"><b>${E(z.title)}</b><div class="mu">${z.n} questions · ${z.minutes?z.minutes+" min timer":"No time limit"}</div></div>
 ${z.attempt_id?`<button class="g" onclick="review(${z.attempt_id})">View result</button>`:`<button onclick="begin(${z.id})">Start quiz</button>`}</div>`).join("")||'<p class="mu">No quizzes are published yet. Check back soon.</p>'}</div>
 <div class="card"><h2>My results</h2><div class="tw"><table><tr><th>Quiz</th><th>Score</th><th>Submitted</th><th></th></tr>${at.map(a=>`<tr><td>${E(a.title)}</td><td>${a.score}/${a.total}</td><td>${D(a.submitted_at)}</td><td><button class="g" onclick="review(${a.id})">Review</button></td></tr>`).join("")||'<tr><td colspan="4" class="mu">You have not attempted a quiz yet.</td></tr>'}</table></div></div>`))}
let Q=null;
const begin=go(async id=>{const z=await api("GET",`/api/quizzes/${id}/start`);Q={z,ans:{},flag:{},i:0,end:z.seconds_left==null?null:Date.now()+z.seconds_left*1000,busy:false};
 clearInterval(T);if(Q.end)T=setInterval(tick,500);quiz()});
function tick(){const el=$("tm");if(!el||!Q)return;const s=Math.max(0,Math.ceil((Q.end-Date.now())/1000));el.textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;el.className="timer"+(s<60?" low":"");if(s<=0){clearInterval(T);send(true)}}
function quiz(){const z=Q.z,k=z.questions[Q.i];
 show(shell(`<div class="card row"><h2 style="margin:0">${E(z.title)}</h2>${Q.end?'<div class="timer" id="tm"></div>':'<span class="mu">No time limit</span>'}</div>
 <div class="card"><div class="pal">${z.questions.map((x,j)=>`<button class="${Q.ans[x.id]!=null?"ans":""} ${j===Q.i?"cur":""} ${Q.flag[x.id]?"flag":""}" onclick="Q.i=${j};quiz()" aria-label="Question ${j+1}">${j+1}</button>`).join("")}</div>
 <div class="mu" style="margin-top:8px">Blue: answered · Red outline: flagged for review</div></div>
 <div class="card"><h3>Question ${Q.i+1} of ${z.questions.length}</h3><p class="qtext">${E(k.text)}</p>
 <div class="opt-grid">${k.opts.map((o,j)=>`<label class="opt ${Q.ans[k.id]===j?"sel":""}"><input type="radio" name="o" ${Q.ans[k.id]===j?"checked":""} onchange="Q.ans[${k.id}]=${j};quiz()"><span class="optletter">${"ABCD"[j]}</span><span>${E(o)}</span></label>`).join("")}</div>
 <div class="row" style="margin-top:10px"><div><button class="g" ${Q.i?"":"disabled"} onclick="Q.i--;quiz()">Previous</button><button class="g" ${Q.i<z.questions.length-1?"":"disabled"} onclick="Q.i++;quiz()">Next</button>
 <button class="g" onclick="Q.flag[${k.id}]=!Q.flag[${k.id}];quiz()">${Q.flag[k.id]?"Remove flag":"Flag for review"}</button></div><button onclick="send(false)">Submit quiz</button></div><div class="err">${E(S.msg)}</div></div>`));tick()}
const send=go(async auto=>{if(Q.busy)return;const n=Q.z.questions.length,a=Object.keys(Q.ans).length;
 if(!auto&&!confirm(`You answered ${a} of ${n} questions${Object.values(Q.flag).some(Boolean)?" and flagged some for review":""}. Submit now? You cannot change answers afterwards.`))return;
 Q.busy=true;clearInterval(T);const r=await api("POST",`/api/quizzes/${Q.z.id}/submit`,{answers:Q.ans});Q=null;review(r.attempt_id,auto)});
const review=go(async(id,auto)=>{const r=await api("GET","/api/attempts/"+id);
 show(shell(`<div class="card"><div class="row"><h2 style="margin:0">${E(r.title)}</h2><button class="g" onclick="home()">${ME.role==="admin"?"Back to results":"Back to quizzes"}</button></div>
 ${auto?'<p class="mu">Time ran out, so your quiz was submitted automatically.</p>':""}${ME.role==="admin"?`<p class="mu">Student: ${E(r.student)}</p>`:""}
 <div class="score-wrap" style="margin-top:10px"><div class="score-big ${r.passed?"":"fail"}"><b>${r.pct}%</b><span class="pill ${r.passed?"ok":"bad"}">${r.passed?"Pass":"Fail"}</span></div>
 <div class="tiles" style="margin:0;flex:1;min-width:180px"><div class="tile"><b>${r.score}/${r.total}</b>Questions correct</div></div></div></div>
 ${r.items.map((k,i)=>`<div class="card"><h3>${i+1}. ${E(k.text)}</h3>${k.opts.map((o,j)=>`<div class="opt ${j===k.correct?"ok":j===k.chosen?"bad":""}"><span class="optletter">${j===k.correct?"✔":j===k.chosen?"✘":"ABCD"[j]}</span><span>${E(o)}${j===k.chosen?' <span class="mu">(your answer)</span>':""}</span></div>`).join("")}${k.chosen<0?'<div class="mu">Not answered</div>':""}</div>`).join("")}`))});
// ---------- admin ----------
const tabs=()=>`<div class="tabs">${[["quizzes","Quizzes"],["students","Students"],["results","Results"]].map(([k,l])=>`<button class="${S.tab===k?"on":""}" onclick="S.msg='';S.tab='${k}';S.edit=null;admin()">${l}</button>`).join("")}</div>`;
async function admin(){const body=S.edit?await editView():S.tab==="quizzes"?await quizzesView():S.tab==="students"?await studentsView():await resultsView();show(shell(tabs()+`<div class="err">${E(S.msg)}</div>`+body))}
async function quizzesView(){const zs=await api("GET","/api/admin/quizzes");
 return`<div class="card"><h2>Create a quiz</h2><div class="row" style="align-items:flex-end"><div style="flex:2;min-width:180px"><label>Title</label><input id="qt"></div><div style="flex:1;min-width:110px"><label>Time limit (minutes)</label><input id="qm" type="number" min="1" placeholder="Untimed"></div><div style="flex:1;min-width:90px"><label>Pass mark %</label><input id="qp" type="number" value="40" min="0" max="100"></div><button onclick="newQuiz()" style="margin-bottom:10px">Create quiz</button></div></div>
 ${zs.map(z=>`<div class="card row"><div><b>${E(z.title)}</b> <span class="pill ${z.published?"ok":""}">${z.published?"Published":"Draft"}</span><div class="mu">${z.n} questions · ${z.minutes?z.minutes+" min":"Untimed"} · pass ${z.pass_pct}% · ${z.attempts} attempts</div></div>
 <div><button class="g" onclick="S.edit=${z.id};admin()">Edit</button><button class="g" onclick="pub(${z.id},${!z.published})">${z.published?"Unpublish":"Publish"}</button><button class="d" onclick="delQuiz(${z.id})">Delete</button></div></div>`).join("")||'<p class="mu">No quizzes yet. Create one above.</p>'}`}
const newQuiz=go(async()=>{await api("POST","/api/admin/quizzes",{title:V("qt"),minutes:V("qm"),pass_pct:V("qp")});admin()});
const pub=go(async(id,p)=>{await api("PUT","/api/admin/quizzes/"+id,{published:p});admin()});
const delQuiz=go(async id=>{if(confirm("Delete this quiz with its questions and all student attempts?")){await api("DELETE","/api/admin/quizzes/"+id);admin()}});
let QS=[],EQ=null;
async function editView(){const [zs,qs]=await Promise.all([api("GET","/api/admin/quizzes"),api("GET",`/api/admin/quizzes/${S.edit}/questions`)]);const z=zs.find(x=>x.id===S.edit);QS=qs;const e=qs.find(x=>x.id===EQ);
 return`<div class="card"><div class="row"><h2 style="margin:0">Quiz settings</h2><button class="g" onclick="S.edit=null;EQ=null;admin()">Back to quizzes</button></div>
 <div class="row" style="align-items:flex-end;margin-top:8px"><div style="flex:2;min-width:180px"><label>Title</label><input id="et" value="${E(z.title)}"></div><div style="flex:1;min-width:110px"><label>Time limit (minutes, blank = untimed)</label><input id="em" type="number" min="1" value="${z.minutes||""}"></div><button onclick="saveQuiz()" style="margin-bottom:10px">Save settings</button></div></div>
 ${qs.map((k,i)=>`<div class="card"><b>${i+1}. ${E(k.text)}</b>${k.opts.map((o,j)=>`<div class="mu">${j===k.correct?"✔":"•"} ${E(o)}</div>`).join("")}<button class="g" onclick="EQ=${k.id};admin()">Edit</button><button class="d" onclick="delQ(${k.id})">Remove</button></div>`).join("")||'<p class="mu">No questions yet. Add the first one below.</p>'}
 <div class="card"><h2>${e?"Edit question":"Add a question"}</h2><label>Question</label><textarea id="qq" rows="2">${E(e?.text)}</textarea>
 ${[0,1,2,3].map(i=>`<label>Option ${i+1}</label><input id="o${i}" value="${E(e?.opts[i])}">`).join("")}<label>Correct answer</label><select id="ca">${[0,1,2,3].map(i=>`<option value="${i}" ${e?.correct===i?"selected":""}>Option ${i+1}</option>`).join("")}</select>
 <button onclick="saveQ()">${e?"Update question":"Add question"}</button>${e?'<button class="g" onclick="EQ=null;admin()">Cancel</button>':""}</div>`}
const saveQuiz=go(async()=>{await api("PUT","/api/admin/quizzes/"+S.edit,{title:V("et"),minutes:V("em")});admin()});
const saveQ=go(async()=>{const b={text:V("qq"),opts:[0,1,2,3].map(i=>V("o"+i)),correct:+$("ca").value};
 await api(EQ?"PUT":"POST",EQ?"/api/admin/questions/"+EQ:`/api/admin/quizzes/${S.edit}/questions`,b);EQ=null;admin()});
const delQ=go(async id=>{await api("DELETE","/api/admin/questions/"+id);admin()});
async function studentsView(){const ss=await api("GET","/api/admin/students");
 return`<div class="card"><h2>Student accounts (${ss.length})</h2><div class="tw"><table><tr><th>Name</th><th>Email</th><th>Attempts</th><th></th></tr>${ss.map(s=>`<tr><td>${E(s.name)}</td><td>${E(s.email)}</td><td>${s.attempts}</td><td><button class="g" onclick="resetPw(${s.id})">Reset password</button><button class="d" onclick="delStu(${s.id})">Remove</button></td></tr>`).join("")||'<tr><td colspan="4" class="mu">No students have registered yet.</td></tr>'}</table></div></div>`}
const resetPw=go(async id=>{const p=prompt("New password (at least 6 characters):");if(p){await api("POST",`/api/admin/students/${id}/password`,{password:p});alert("Password updated.")}});
const delStu=go(async id=>{if(confirm("Remove this student and all their attempts?")){await api("DELETE","/api/admin/students/"+id);admin()}});
let F={quiz:"",name:""};
const qs_=()=>`?quiz_id=${F.quiz}&name=${encodeURIComponent(F.name)}`;
async function resultsView(){const [zs,r]=await Promise.all([api("GET","/api/admin/quizzes"),api("GET","/api/admin/results"+qs_())]);const s=r.stats;
 return`<div class="card"><div class="row" style="align-items:flex-end"><div style="flex:1;min-width:160px"><label>Quiz</label><select id="fq" onchange="F.quiz=this.value;admin()"><option value="">All quizzes</option>${zs.map(z=>`<option value="${z.id}" ${String(z.id)===F.quiz?"selected":""}>${E(z.title)}</option>`).join("")}</select></div>
 <div style="flex:1;min-width:160px"><label>Student name or email</label><input id="fn" value="${E(F.name)}" onkeydown="if(event.key==='Enter'){F.name=this.value;admin()}"></div><button class="g" style="margin-bottom:10px" onclick="F.name=V('fn');admin()">Filter</button><button class="g" style="margin-bottom:10px" onclick="csv()">Export CSV</button></div></div>
 <div class="tiles"><div class="tile"><b>${s.count}</b>Attempts</div><div class="tile"><b>${s.avg}%</b>Average</div><div class="tile"><b>${s.high}%</b>Highest</div><div class="tile"><b>${s.low}%</b>Lowest</div></div>
 <div class="card"><div class="tw"><table><tr><th>Student</th><th>Quiz</th><th>Score</th><th>%</th><th>Result</th><th>Submitted</th><th></th></tr>${r.rows.map(x=>`<tr><td>${E(x.student)}<div class="mu">${E(x.email)}</div></td><td>${E(x.quiz)}</td><td>${x.score}/${x.total}</td><td>${x.pct}%</td><td><span class="pill ${x.passed?"ok":"bad"}">${x.passed?"Pass":"Fail"}</span></td><td>${D(x.submitted_at)}</td><td><button class="g" onclick="review(${x.id})">View</button><button class="d" onclick="delAt(${x.id})">Delete</button></td></tr>`).join("")||'<tr><td colspan="7" class="mu">No attempts match these filters.</td></tr>'}</table></div></div>`}
const delAt=go(async id=>{if(confirm("Delete this attempt? The student will be able to retake the quiz.")){await api("DELETE","/api/admin/attempts/"+id);admin()}});
const csv=go(async()=>{const t=await api("GET","/api/admin/results.csv"+qs_());const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([t],{type:"text/csv"}));a.download="results.csv";a.click()});
boot();
