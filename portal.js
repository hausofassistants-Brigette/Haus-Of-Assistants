import { createClient as createSupabaseClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg=window.HOA_CONFIG||{};
const ready=cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY &&
  !cfg.SUPABASE_URL.includes("YOUR_PROJECT") && !cfg.SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SB_");
if(!ready){
  document.getElementById("login-msg").textContent="Connect your Supabase URL and publishable key in config.js before using the live portal.";
}
const supabase=ready?createSupabaseClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;

let session=null, me=null, role=null, currentSection="overview", tasks=[], messages=[], files=[], invoices=[], clients=[], channel=null;

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const fmtDate=d=>d?new Date(d).toLocaleDateString("en-AU",{day:"2-digit",month:"short",year:"numeric"}):"—";
const fmtMoney=n=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(n||0));
function flash(msg,ok=false){$("global-msg").innerHTML=`<div class="notice" style="${ok?"border-color:#477a4a":""}">${esc(msg)}</div>`;setTimeout(()=>$("global-msg").innerHTML="",4000);}
function showModal(html){$("modal-body").innerHTML=html;$("modal").classList.remove("hidden");}
$("modal-close").onclick=()=>$("modal").classList.add("hidden");

async function signIn(e){
 e.preventDefault(); if(!supabase)return;
 $("login-msg").textContent="Signing in…";
 const {error}=await supabase.auth.signInWithPassword({email:$("login-email").value.trim(),password:$("login-password").value});
 if(error){$("login-msg").textContent=error.message;return;}
 $("login-msg").textContent="";
 await boot();
}
$("login-form").addEventListener("submit",signIn);

$("forgot-btn").onclick=async()=>{
 if(!supabase)return;
 const email=$("login-email").value.trim(); if(!email){$("login-msg").textContent="Enter your email address first.";return;}
 const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
 $("login-msg").textContent=error?error.message:"Password reset instructions have been sent if that email is registered.";
};

$("logout").onclick=async()=>{if(supabase)await supabase.auth.signOut();location.reload()};
$("mobile-menu").onclick=()=>document.querySelector(".sidebar").classList.toggle("open");

document.querySelectorAll("#nav button[data-section]").forEach(b=>b.onclick=()=>go(b.dataset.section));
document.querySelectorAll("[data-section-jump]").forEach(b=>b.onclick=()=>go(b.dataset.sectionJump));
function go(sec){
 currentSection=sec;
 document.querySelectorAll(".section").forEach(x=>x.classList.add("hidden"));
 $("section-"+sec).classList.remove("hidden");
 document.querySelectorAll("#nav button").forEach(x=>x.classList.toggle("active",x.dataset.section===sec));
 $("page-title").textContent=sec.charAt(0).toUpperCase()+sec.slice(1);
 if(sec==="tasks")renderTasks(); if(sec==="chat")renderChat(); if(sec==="files")renderFiles(); if(sec==="invoices")renderInvoices(); if(sec==="clients")renderClients();
}

async function boot(){
 if(!supabase)return;
 try{
 const {data}=await supabase.auth.getSession(); session=data.session;
 if(!session){$("login-view").classList.remove("hidden");$("app-view").classList.add("hidden");return;}
 const {data:p,error}=await supabase.from("profiles").select("*").eq("id",session.user.id).single();
 if(error||!p){$("login-msg").textContent="Your account exists but no portal profile is available yet. Ask the admin to finish setup.";await supabase.auth.signOut();return;}
 me=p;role=p.role;
 $("login-view").classList.add("hidden");$("app-view").classList.remove("hidden");
 $("side-name").textContent=p.full_name||session.user.email;
 $("side-role").textContent=role==="admin"?"Administrator":"Client";
 $("top-company").textContent=p.company_name||"Haus Of Assistants";
 $("welcome-title").textContent=`Hi, ${p.full_name?.split(" ")[0]||"there"}.`;
 $("welcome-copy").textContent=role==="admin"?"Manage clients, tasks, chat, files and invoices from one place.":"Submit tasks, message Haus Of Assistants, share files and view invoices.";
$("clients-nav").style.display=role==="admin"?"block":"none";
document.querySelectorAll(".admin-only").forEach(x=>x.style.display=role==="admin"?"inline-block":"none");
await loadAll();
subscribeRealtime();
go("overview");
 }catch(err){
   console.error("Portal boot error",err);
   $("login-view").classList.remove("hidden");
   $("app-view").classList.add("hidden");
   $("login-msg").textContent=err?.message||"The portal could not finish loading. Check your Supabase setup.";
 }
}
async function loadAll(){
 await Promise.all([loadTasks(),loadMessages(),loadFiles(),loadInvoices()]);
 if(role==="admin")await loadClients();
 renderOverview(); renderProfile();
}
async function loadTasks(){let q=supabase.from("tasks").select("*").order("created_at",{ascending:false});if(role!=="admin")q=q.eq("client_id",me.client_id);const r=await q;tasks=r.data||[];if(r.error)flash(r.error.message)}
async function loadMessages(){let q=supabase.from("messages").select("*").order("created_at",{ascending:true});if(role!=="admin")q=q.eq("client_id",me.client_id);const r=await q;messages=r.data||[]}
async function loadFiles(){let q=supabase.from("files").select("*").order("created_at",{ascending:false});if(role!=="admin")q=q.eq("client_id",me.client_id);const r=await q;files=r.data||[]}
async function loadInvoices(){let q=supabase.from("invoices").select("*").order("issue_date",{ascending:false});if(role!=="admin")q=q.eq("client_id",me.client_id);const r=await q;invoices=r.data||[]}
async function loadClients(){const r=await supabase.from("profiles").select("*").eq("role","client").order("created_at",{ascending:false});clients=r.data||[]}

function renderOverview(){
 const completed=tasks.filter(t=>t.status==="Completed").length, open=tasks.filter(t=>t.status!=="Completed").length;
 $("stats").innerHTML=[["Open tasks",open],["Completed",completed],["Messages",messages.length],["Outstanding invoices",invoices.filter(i=>i.status!=="Paid").length]].map(x=>`<div class="stat"><b>${x[1]}</b><span>${x[0]}</span></div>`).join("");
 $("recent-tasks").innerHTML=tasks.slice(0,5).map(t=>`<div class="list-item"><div><strong>${esc(t.title)}</strong><div class="muted small">${esc(t.description||"")}</div></div><span class="badge ${String(t.priority).toLowerCase()}">${esc(t.status)}</span></div>`).join("")||"<div class='muted'>No tasks yet.</div>";
 $("recent-messages").innerHTML=messages.slice(-5).reverse().map(m=>`<div class="list-item"><div><strong>${m.sender_id===session.user.id?"You":(role==="admin"?"Client":"Haus Of Assistants")}</strong><div class="muted small">${esc(m.body)}</div></div><span class="muted small">${fmtDate(m.created_at)}</span></div>`).join("")||"<div class='muted'>No messages yet.</div>";
}

function renderTasks(){
 const search=($("task-search").value||"").toLowerCase(), st=$("task-status-filter").value, pr=$("task-priority-filter").value;
 const rows=tasks.filter(t=>(!search||(t.title+" "+(t.description||"")).toLowerCase().includes(search))&&(!st||t.status===st)&&(!pr||t.priority===pr));
 $("tasks-table").innerHTML=`<table class="table"><thead><tr><th>Task</th><th>Priority</th><th>Status</th><th>Due</th><th>Hours</th><th>Actions</th></tr></thead><tbody>${rows.map(t=>`<tr><td><strong>${esc(t.title)}</strong><div class="muted small">${esc(t.description||"")}</div>${role==="admin"?`<div class="muted small">${esc(t.client_name||"")}</div>`:""}</td><td><span class="badge ${t.priority.toLowerCase()}">${esc(t.priority)}</span></td><td>${esc(t.status)}</td><td>${fmtDate(t.due_date)}</td><td>${Number(t.actual_hours||0).toFixed(2)}</td><td><div class="table-actions"><button class="mini" data-edit-task="${t.id}">Edit</button></div></td></tr>`).join("")||"<tr><td colspan='6' class='muted'>No tasks found.</td></tr>"}</tbody></table>`;
 document.querySelectorAll("[data-edit-task]").forEach(b=>b.onclick=()=>openTask(b.dataset.editTask));
}
$("task-search").oninput=renderTasks;$("task-status-filter").onchange=renderTasks;$("task-priority-filter").onchange=renderTasks;

function openTask(id){
 const t=tasks.find(x=>x.id===id)||{id:"",title:"",description:"",priority:"Normal",status:"Not Started",due_date:"",actual_hours:0,client_id:role==="admin"?(clients[0]?.client_id||""):me.client_id};
 const clientOptions=role==="admin"?`<label>Client<select id="m-client">${clients.map(c=>`<option value="${c.client_id}" ${c.client_id===t.client_id?"selected":""}>${esc(c.full_name)}${c.company_name?" — "+esc(c.company_name):""}</option>`).join("")}</select></label>`:"";
 showModal(`<h2>${id?"Edit":"New"} Task</h2><form id="task-form">${clientOptions}<label>Title<input id="m-title" required value="${esc(t.title)}"></label><label>Description<textarea id="m-desc">${esc(t.description||"")}</textarea></label><label>Priority<select id="m-priority">${["Urgent","High","Normal","Low"].map(x=>`<option ${x===t.priority?"selected":""}>${x}</option>`).join("")}</select></label><label>Status<select id="m-status">${["Not Started","In Progress","Completed"].map(x=>`<option ${x===t.status?"selected":""}>${x}</option>`).join("")}</select></label><label>Due date<input id="m-due" type="date" value="${t.due_date||""}"></label><label>Actual hours<input id="m-hours" type="number" step=".25" min="0" value="${t.actual_hours||0}"></label><button class="primary" type="submit">Save Task</button></form>`);
 $("task-form").onsubmit=async e=>{e.preventDefault();const payload={title:$("m-title").value.trim(),description:$("m-desc").value,priority:$("m-priority").value,status:$("m-status").value,due_date:$("m-due").value||null,actual_hours:Number($("m-hours").value||0)};if(role==="admin")payload.client_id=$("m-client").value;else payload.client_id=me.client_id;let r=id?await supabase.from("tasks").update(payload).eq("id",id):await supabase.from("tasks").insert(payload);if(r.error){flash(r.error.message);return}$("modal").classList.add("hidden");await loadTasks();renderTasks();renderOverview();};
}
$("new-task-btn").onclick=()=>openTask("");

function renderChat(){
 $("chat-messages").innerHTML=messages.map(m=>`<div class="bubble ${m.sender_id===session.user.id?"mine":""}"><div>${esc(m.body)}</div><div class="meta">${m.sender_id===session.user.id?"You":(role==="admin"?"Client":"Haus Of Assistants")} · ${new Date(m.created_at).toLocaleString("en-AU")}</div></div>`).join("")||"<div class='muted'>No messages yet. Start the conversation below.</div>";
 const el=$("chat-messages");el.scrollTop=el.scrollHeight;
}
$("chat-form").onsubmit=async e=>{e.preventDefault();const body=$("chat-input").value.trim();if(!body)return;const clientId=role==="admin"?await chooseClientId():me.client_id;if(!clientId)return;const r=await supabase.from("messages").insert({client_id:clientId,sender_id:session.user.id,body});if(r.error)flash(r.error.message);else{$("chat-input").value="";await loadMessages();renderChat();renderOverview();}};
async function chooseClientId(){return new Promise(resolve=>{showModal(`<h2>Choose client</h2><form id="choose-client">${clients.map(c=>`<label style="display:flex;gap:8px"><input type="radio" name="cid" value="${c.client_id}"> ${esc(c.full_name)}${c.company_name?" — "+esc(c.company_name):""}</label>`).join("")}<button class="primary" type="submit">Open Chat</button></form>`);$("choose-client").onsubmit=e=>{e.preventDefault();const v=new FormData(e.currentTarget).get("cid");$("modal").classList.add("hidden");resolve(v)}})}

function renderFiles(){
 $("files-list").innerHTML=files.map(f=>`<div class="file-card"><strong>${esc(f.name)}</strong><small>${(Number(f.size_bytes||0)/1024).toFixed(1)} KB · ${fmtDate(f.created_at)}</small><div class="table-actions" style="margin-top:10px"><button class="mini" data-download="${f.id}">Download</button>${role==="admin"?`<button class="mini" data-delete-file="${f.id}">Delete</button>`:""}</div></div>`).join("")||"<div class='muted'>No files yet.</div>";
 document.querySelectorAll("[data-download]").forEach(b=>b.onclick=()=>downloadFile(b.dataset.download));
 document.querySelectorAll("[data-delete-file]").forEach(b=>b.onclick=()=>deleteFile(b.dataset.deleteFile));
}
$("file-input").onchange=async e=>{const clientId=role==="admin"?await chooseClientId():me.client_id;if(!clientId){e.target.value="";return}for(const file of e.target.files){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const path=`${clientId}/${crypto.randomUUID()}-${safe}`;const up=await supabase.storage.from("client-files").upload(path,file,{upsert:false});if(up.error){flash(up.error.message);continue}const ins=await supabase.from("files").insert({client_id:clientId,name:file.name,path,content_type:file.type,size_bytes:file.size,uploaded_by:session.user.id});if(ins.error)flash(ins.error.message)}e.target.value="";await loadFiles();renderFiles();};
async function downloadFile(id){const f=files.find(x=>x.id===id);if(!f)return;const r=await supabase.storage.from("client-files").createSignedUrl(f.path,300);if(r.error){flash(r.error.message);return}window.open(r.data.signedUrl,"_blank")}
async function deleteFile(id){if(!confirm("Delete this file?"))return;const f=files.find(x=>x.id===id);if(!f)return;await supabase.storage.from("client-files").remove([f.path]);const r=await supabase.from("files").delete().eq("id",id);if(r.error)flash(r.error.message);else{await loadFiles();renderFiles()}}

function renderInvoices(){
 $("invoices-table").innerHTML=`<table class="table"><thead><tr><th>Invoice</th><th>Issue</th><th>Due</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>${invoices.map(i=>`<tr><td><strong>${esc(i.invoice_number)}</strong><div class="muted small">${esc(i.description||"")}</div></td><td>${fmtDate(i.issue_date)}</td><td>${fmtDate(i.due_date)}</td><td>${fmtMoney(i.amount)}</td><td><span class="badge">${esc(i.status)}</span></td><td>${i.pdf_url?`<a class="mini" href="${esc(i.pdf_url)}" target="_blank">View</a>`:"—"}</td></tr>`).join("")||"<tr><td colspan='6' class='muted'>No invoices yet.</td></tr>"}</tbody></table>`;
}
$("new-invoice-btn").onclick=async()=>{
 if(role!=="admin")return;const client=await chooseClient();if(!client)return;
 showModal(`<h2>New Invoice</h2><form id="invoice-form"><label>Invoice number<input id="i-num" required value="HOA-${Date.now().toString().slice(-6)}"></label><label>Description<input id="i-desc"></label><label>Amount (AUD)<input id="i-amount" type="number" step=".01" required></label><label>Issue date<input id="i-issue" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>Due date<input id="i-due" type="date"></label><label>Status<select id="i-status"><option>Outstanding</option><option>Paid</option><option>Overdue</option><option>Draft</option></select></label><label>Invoice PDF URL (optional)<input id="i-url" type="url"></label><button class="primary" type="submit">Create Invoice</button></form>`);
 $("invoice-form").onsubmit=async e=>{e.preventDefault();const r=await supabase.from("invoices").insert({client_id:client,invoice_number:$("i-num").value,description:$("i-desc").value,amount:Number($("i-amount").value),issue_date:$("i-issue").value,due_date:$("i-due").value||null,status:$("i-status").value,pdf_url:$("i-url").value||null});if(r.error)flash(r.error.message);else{$("modal").classList.add("hidden");await loadInvoices();renderInvoices();renderOverview()}};
};
async function chooseClient(){return new Promise(resolve=>{showModal(`<h2>Choose client</h2><form id="choose-client">${clients.map(c=>`<label style="display:flex;gap:8px"><input type="radio" name="cid" value="${c.client_id}"> ${esc(c.full_name)}${c.company_name?" — "+esc(c.company_name):""}</label>`).join("")}<button class="primary" type="submit">Continue</button></form>`);$("choose-client").onsubmit=e=>{e.preventDefault();const v=new FormData(e.currentTarget).get("cid");$("modal").classList.add("hidden");resolve(v)}})}

function renderClients(){
 $("clients-table").innerHTML=`<table class="table"><thead><tr><th>Client</th><th>Company</th><th>Package</th><th>Hours</th><th>Status</th><th>Actions</th></tr></thead><tbody>${clients.map(c=>`<tr><td><strong>${esc(c.full_name)}</strong><div class="muted small">${esc(c.email||"")}</div></td><td>${esc(c.company_name||"—")}</td><td>${esc(c.package_name||"—")}</td><td>${esc(c.hours_per_week||0)}</td><td>${esc(c.status||"Active")}</td><td><button class="mini" data-edit-client="${c.client_id}">Manage</button></td></tr>`).join("")||"<tr><td colspan='6' class='muted'>No clients yet.</td></tr>"}</tbody></table>`;
 document.querySelectorAll("[data-edit-client]").forEach(b=>b.onclick=()=>editClient(b.dataset.editClient));
}
$("new-client-btn").onclick=()=>showCreateClient();
function showCreateClient(){showModal(`<h2>Create client</h2><div class="notice">A secure temporary password will be generated by the backend. Do not store passwords in this dashboard.</div><form id="client-form"><label>Client name<input id="c-name" required></label><label>Email<input id="c-email" type="email" required></label><label>Company name<input id="c-company"></label><label>Phone<input id="c-phone"></label><label>Package<select id="c-package"><option>Essential</option><option>Professional</option><option>Premium</option></select></label><label>Hours per week<input id="c-hours" type="number" min="0" step=".5" value="3"></label><button class="primary" type="submit">Create Client</button></form>`);$("client-form").onsubmit=createClientAccount}
async function createClientAccount(e){
  e.preventDefault();
  if(role!=="admin"){flash("Only an administrator can create clients.");return;}
  const payload={email:$("c-email").value.trim().toLowerCase(),full_name:$("c-name").value.trim(),company_name:$("c-company").value.trim(),phone:$("c-phone").value.trim(),package_name:$("c-package").value,hours_per_week:Number($("c-hours").value)};
  if(!payload.email||!payload.full_name){flash("Client name and email are required.");return;}
  const button=document.querySelector('#client-form button[type="submit"]');
  if(button){button.disabled=true;button.textContent="Creating…";}
  try{
    const {data,error}=await supabase.functions.invoke("create-user",{body:payload});
    if(error){
      console.error("create-user error",error);
      let detail=error.message||"The server could not create the client.";
      const ctx=error.context;
      if(ctx && typeof ctx.text==="function"){try{const raw=await ctx.text();if(raw){try{const body=JSON.parse(raw);detail=body.details||body.error||body.message||detail;}catch{detail=raw;}}}catch{}}
      if(data && typeof data==="object") detail=data.details||data.error||detail;
      flash(`Create client failed: ${detail}`);
      return;
    }
    if(!data?.success){flash(`Create client failed: ${data?.details||data?.error||"The server did not confirm creation."}`);return;}
    $("modal-body").innerHTML=`<h2>Client created</h2><p>Give these login details to the client securely. The temporary password is shown only once.</p><div class="notice"><strong>Email:</strong> ${esc(data.email||payload.email)}<br><strong>Temporary password:</strong> ${esc(data.temp_password)}</div><button class="primary" id="close-created">Done</button>`;
    $("close-created").onclick=async()=>{$("modal").classList.add("hidden");await loadClients();renderClients();};
  }catch(err){console.error("Unexpected create-user error",err);flash(`Create client failed: ${err?.message||"Unexpected error."}`);}
  finally{if(button){button.disabled=false;button.textContent="Create Client";}}
}
function editClient(id){const c=clients.find(x=>x.client_id===id);if(!c)return;showModal(`<h2>Manage client</h2><form id="edit-client"><label>Full name<input id="ec-name" value="${esc(c.full_name||"")}"></label><label>Company<input id="ec-company" value="${esc(c.company_name||"")}"></label><label>Phone<input id="ec-phone" value="${esc(c.phone||"")}"></label><label>Package<select id="ec-package">${["Essential","Professional","Premium"].map(x=>`<option ${x===c.package_name?"selected":""}>${x}</option>`).join("")}</select></label><label>Hours/week<input id="ec-hours" type="number" step=".5" value="${c.hours_per_week||0}"></label><label>Status<select id="ec-status">${["Active","Paused","Closed"].map(x=>`<option ${x===c.status?"selected":""}>${x}</option>`).join("")}</select></label><button class="primary">Save changes</button></form>`);$("edit-client").onsubmit=async e=>{e.preventDefault();const r=await supabase.from("profiles").update({full_name:$("ec-name").value,company_name:$("ec-company").value,phone:$("ec-phone").value,package_name:$("ec-package").value,hours_per_week:Number($("ec-hours").value),status:$("ec-status").value}).eq("id",id);if(r.error)flash(r.error.message);else{$("modal").classList.add("hidden");await loadClients();renderClients()}}}

function renderProfile(){ $("profile-name").value=me.full_name||"";$("profile-business").value=me.company_name||"";$("profile-phone").value=me.phone||"";}
$("profile-form").onsubmit=async e=>{e.preventDefault();const r=await supabase.from("profiles").update({full_name:$("profile-name").value,company_name:$("profile-business").value,phone:$("profile-phone").value}).eq("id",me.id);if(r.error)flash(r.error.message);else{me={...me,full_name:$("profile-name").value,company_name:$("profile-business").value,phone:$("profile-phone").value};$("side-name").textContent=me.full_name;flash("Profile saved.",true)}};
$("password-form").onsubmit=async e=>{e.preventDefault();if($("new-password").value!==$("confirm-password").value){flash("Passwords do not match.");return}const r=await supabase.auth.updateUser({password:$("new-password").value});if(r.error)flash(r.error.message);else{e.currentTarget.reset();flash("Password updated.",true)}};

function subscribeRealtime(){
 if(channel) supabase.removeChannel(channel);
 channel=supabase.channel("hoa-portal-"+me.id)
 .on("postgres_changes",{event:"*",schema:"public",table:"messages"},async()=>{await loadMessages();renderChat();renderOverview()})
 .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},async()=>{await loadTasks();renderTasks();renderOverview()})
 .on("postgres_changes",{event:"*",schema:"public",table:"invoices"},async()=>{await loadInvoices();renderInvoices();renderOverview()})
 .subscribe();
}
supabase?.auth.onAuthStateChange((_event,s)=>{session=s;if(!s){location.reload()}});
boot();
