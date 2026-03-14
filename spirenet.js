if (localStorage.getItem("spirenet_usb_verified") !== "true") {
  window.location.href = "index.html";
}

const APP_NAME = "spirenet";
const DB_NAME = "spirenet_cli_db_v9";
const DB_VERSION = 1;

const terminal = document.getElementById("terminal");
const input = document.getElementById("hiddenInput");
const tap = document.getElementById("tapCatcher");
const hint = document.getElementById("hint");

/* =========================
   utils
========================= */

function lc(s){
  return (s ?? "").toString().toLowerCase();
}

function nowIso(){
  return new Date().toISOString();
}

function safeName(s){
  return /^[a-z0-9_-]+$/.test(s);
}

function escapeHtml(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function splitCmd(line){
  const t=line.trim();
  if(!t) return {cmd:"",args:[]};
  const p=t.split(" ");
  return {cmd:p[0],args:p.slice(1)};
}

function joinRest(a){
  return a.join(" ").trim();
}

/* =========================
   indexeddb
========================= */

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);

    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains("kv")){
        db.createObjectStore("kv");
      }
    };

    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function kvGet(k){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("kv","readonly");
    const st=tx.objectStore("kv");
    const r=st.get(k);
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  });
}

async function kvSet(k,v){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("kv","readwrite");
    const st=tx.objectStore("kv");
    const r=st.put(v,k);
    r.onsuccess=()=>resolve(true);
    r.onerror=()=>reject(r.error);
  });
}

/* =========================
   state
========================= */

const state={
  transcript:[],
  current:"",
  currentUser:"operator",
  adminUnlocked:localStorage.getItem("spirenet_role")==="admin",
  customers:[],
  jobs:[],
  receipts:[],
  rootId:null,
  cwdId:null,
  cwdPath:"/spirenet",
  activeFileId:null,
  activeFileName:null,
  nodes:[],
  edit:null
};

/* =========================
   terminal
========================= */

function addLine(s){
  state.transcript.push(lc(s));
}

function addRawLine(s){
  state.transcript.push(s);
}

function addPromptEcho(s){
  addRawLine("> "+lc(s));
}

function render(){
  terminal.textContent=
    state.transcript.join("\n")+
    "\n> "+state.current+"_";
  terminal.scrollTop=terminal.scrollHeight;
}

function focusInput(){
  input.focus();
  setTimeout(()=>input.focus(),30);
  setTimeout(()=>input.focus(),120);
  setTimeout(()=>{
    if(document.activeElement===input){
      hint.style.display="none";
    }
  },80);
}

tap.addEventListener("touchstart",focusInput,{passive:true});
tap.addEventListener("pointerdown",focusInput,{passive:true});
terminal.addEventListener("touchstart",focusInput,{passive:true});
terminal.addEventListener("pointerdown",focusInput,{passive:true});

input.addEventListener("input",()=>{
  state.current=lc(input.value);
  if(input.value!==state.current) input.value=state.current;
  render();
});

input.addEventListener("keydown",async e=>{
  if(e.key==="Enter"){
    e.preventDefault();

    const line=lc(state.current);
    state.current="";
    input.value="";

    if(line.trim().length){
      addPromptEcho(line);
      await handleLine(line);
    }

    render();
  }
});

/* =========================
   node helpers
========================= */

function nodeById(id){
  return state.nodes.find(n=>n.id===id)||null;
}

function childrenOf(dirId){
  return state.nodes
    .filter(n=>n.parentId===dirId)
    .sort((a,b)=>{
      if(a.type!==b.type) return a.type==="dir"?-1:1;
      return a.name.localeCompare(b.name);
    });
}

function childByName(dirId,name){
  return state.nodes.find(
    n=>n.parentId===dirId && n.name===name
  )||null;
}

function pathOf(id){
  const n=nodeById(id);
  if(!n) return "/spirenet";
  if(n.id===state.rootId) return "/spirenet";

  const parts=[];
  let cur=n;

  while(cur && cur.parentId){
    parts.push(cur.name);
    cur=nodeById(cur.parentId);
    if(cur && cur.id===state.rootId) break;
  }

  return "/spirenet/"+parts.reverse().join("/");
}

/* =========================
   persistence
========================= */

async function saveAll(){
  await kvSet("spirenet_state",{
    currentUser:state.currentUser,
    rootId:state.rootId,
    cwdId:state.cwdId,
    nodes:state.nodes,
    customers:state.customers,
    jobs:state.jobs,
    receipts:state.receipts
  });
}

async function loadAll(){
  const saved=await kvGet("spirenet_state");

  if(saved && saved.nodes){
    state.currentUser=saved.currentUser||"operator";
    state.rootId=saved.rootId;
    state.cwdId=saved.cwdId;
    state.nodes=saved.nodes||[];
    state.customers=saved.customers||[];
    state.jobs=saved.jobs||[];
    state.receipts=saved.receipts||[];
    state.cwdPath=pathOf(state.cwdId||state.rootId);
    return;
  }

  const root={
    id:crypto.randomUUID(),
    parentId:null,
    name:"spirenet",
    type:"dir",
    content:null,
    createdAt:nowIso()
  };

  const admin={
    id:crypto.randomUUID(),
    parentId:root.id,
    name:"admin",
    type:"dir",
    content:null,
    createdAt:nowIso()
  };

  const adminRole={
    id:crypto.randomUUID(),
    parentId:admin.id,
    name:"admin_role",
    type:"file",
    content:localStorage.getItem("spirenet_role")||"operator",
    createdAt:nowIso()
  };

  state.nodes=[root,admin,adminRole];

  state.rootId=root.id;
  state.cwdId=root.id;
  state.cwdPath="/spirenet";

  await saveAll();
}

/* =========================
   commands
========================= */

const COMMANDS=[
["help","list commands"],
["cmmdhelp","describe commands"],
["status","show status"],
["whoami","show current user"],
["pwd","show cwd"],
["ls","list directory"],
["cd <path>","change directory"],
["mkdir <name>","create directory"],
["touch <file>","create file"],
["cat <file>","show file"],
["write <file> <text>","overwrite file"],
["append <file> <text>","append file"],
["edit <file>","enter edit mode"],
["done","exit edit mode"],
["preview <file>","preview file"],
["printpg","print active file"],
["printdir","print entire directory"],
["newcustomer","create customer"],
["customers","list customers"],
["viewcustomer <id>","view customer"],
["setcustomer <id> <field> <value>","edit customer"],
["newjob","create job"],
["jobs","list jobs"],
["viewjob <id>","view job"],
["setjob <id> <field> <value>","edit job"],
["newreceipt","create receipt"],
["receipts","list receipts"],
["viewreceipt <id>","view receipt"],
["setreceipt <id> <field> <value>","edit receipt"],
["jobreceipts <jobid>","receipts for job"],
["jobtotal <jobid>","receipt totals"],
["clear","clear terminal"]
];

/* =========================
   edit mode
========================= */

function handleEditLine(line){

  const t=lc(line).trim();

  if(t==="done"){
    const file=nodeById(state.edit.fileId);

    if(file && file.type==="file"){
      file.content=state.edit.buffer.join("\n");
      saveAll();
      addLine("saved");
    }

    state.edit=null;
    return;
  }

  state.edit.buffer.push(line);
}
function renderTables(text){
  return (text ?? "").toString();
}

function buildPrintDirHtml(){
  const kids=childrenOf(state.cwdId).filter(n=>n.type==="file");

  let body=`directory print

path: ${state.cwdPath}
files: ${kids.length}

`;

  if(kids.length===0){
    body += "(no files in this directory)\n";
  } else {
    kids.forEach((file,index)=>{
      body += `==================================================
file ${index+1}: ${file.name}
==================================================

${renderTables(file.content || "")}

`;
    });
  }

  const safe=escapeHtml(body);

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>print directory</title>
<style>
body{
  font-family:menlo,monospace;
  font-size:12px;
  margin:40px;
  color:#000;
  background:#fff;
}
pre{
  white-space:pre-wrap;
  word-wrap:break-word;
  overflow-wrap:anywhere;
  font-family:menlo,monospace;
  font-size:12px;
}
</style>
</head><body>
<pre>${safe}</pre>
<script>setTimeout(()=>{window.print()},400)<\/script>
</body></html>`;
}

/* =========================
   core command handler
========================= */

async function handleLine(line){

  if(state.edit){
    handleEditLine(line);
    return;
  }

  const {cmd,args}=splitCmd(line);

  if(cmd==="help"){
    addLine("commands:");
    COMMANDS.forEach(c=>addLine(c[0]));
    return;
  }

  if(cmd==="cmmdhelp"){
    addLine("command descriptions:");
    COMMANDS.forEach(([k,d])=>addLine(`${k} : ${d}`));
    return;
  }

  if(cmd==="status"){
    addLine("node authenticated");
    addLine(`role: ${localStorage.getItem("spirenet_role") || "operator"}`);
    addLine(`cwd: ${state.cwdPath}`);
    return;
  }

  if(cmd==="whoami"){
    addLine(state.currentUser);
    return;
  }

  if(cmd==="pwd"){
    addLine(state.cwdPath);
    return;
  }

  if(cmd==="ls"){
    const kids=childrenOf(state.cwdId);

    if(kids.length===0){
      addLine("(empty)");
      return;
    }

    kids.forEach(n=>{
      if(n.type==="dir") addLine("dir "+n.name);
      if(n.type==="file") addLine("file "+n.name);
    });

    return;
  }

  if(cmd==="cd"){
    if(args.length<1){
      addLine("error: missing path");
      return;
    }

    const name=args[0];

    if(name==="/"){
      state.cwdId=state.rootId;
      state.cwdPath="/spirenet";
      await saveAll();
      return;
    }

    if(name===".."){
      const cur=nodeById(state.cwdId);
      if(cur && cur.parentId){
        state.cwdId=cur.parentId;
        state.cwdPath=pathOf(cur.parentId);
        await saveAll();
      }
      return;
    }

    const child=childByName(state.cwdId,name);

    if(!child || child.type!=="dir"){
      addLine("not found");
      return;
    }

    if(pathOf(child.id)==="/spirenet/admin" && !state.adminUnlocked){
      addLine("error: admin barrier locked");
      return;
    }

    state.cwdId=child.id;
    state.cwdPath=pathOf(child.id);
    await saveAll();
    return;
  }

  if(cmd==="mkdir"){
    if(args.length<1){
      addLine("error: missing name");
      return;
    }

    const name=args[0];

    if(!safeName(name)){
      addLine("error: invalid name");
      return;
    }

    if(childByName(state.cwdId,name)){
      addLine("error: already exists");
      return;
    }

    state.nodes.push({
      id:crypto.randomUUID(),
      parentId:state.cwdId,
      name,
      type:"dir",
      content:null,
      createdAt:nowIso()
    });

    await saveAll();
    addLine("ok");
    return;
  }

  if(cmd==="touch"){
    if(args.length<1){
      addLine("error: missing filename");
      return;
    }

    const name=args[0];

    if(childByName(state.cwdId,name)){
      addLine("error: already exists");
      return;
    }

    state.nodes.push({
      id:crypto.randomUUID(),
      parentId:state.cwdId,
      name,
      type:"file",
      content:"",
      createdAt:nowIso()
    });

    await saveAll();
    addLine("file created");
    return;
  }

  if(cmd==="cat"){
    if(args.length<1){
      addLine("missing filename");
      return;
    }

    const f=childByName(state.cwdId,args[0]);

    if(!f || f.type!=="file"){
      addLine("file not found");
      return;
    }

    addLine(f.content || "");
    return;
  }

  if(cmd==="write"){
    if(args.length<2){
      addLine("usage: write <file> <text>");
      return;
    }

    const f=childByName(state.cwdId,args[0]);

    if(!f || f.type!=="file"){
      addLine("file not found");
      return;
    }

    f.content=args.slice(1).join(" ");
    await saveAll();
    addLine("written");
    return;
  }

  if(cmd==="append"){
    if(args.length<2){
      addLine("usage: append <file> <text>");
      return;
    }

    const f=childByName(state.cwdId,args[0]);

    if(!f || f.type!=="file"){
      addLine("file not found");
      return;
    }

    const text=args.slice(1).join(" ");
    if(!f.content) f.content=text;
    else f.content += "\n"+text;

    await saveAll();
    addLine("appended");
    return;
  }

  if(cmd==="edit"){
    if(args.length<1){
      addLine("usage: edit <file>");
      return;
    }

    const name=args[0];
    let f=childByName(state.cwdId,name);

    if(!f){
      f={
        id:crypto.randomUUID(),
        parentId:state.cwdId,
        name,
        type:"file",
        content:"",
        createdAt:nowIso()
      };
      state.nodes.push(f);
      await saveAll();
    }

    if(f.type!=="file"){
      addLine("not a file");
      return;
    }

    state.edit={
      fileId:f.id,
      buffer:(f.content || "").split("\n")
    };

    addLine("editing "+f.name);
    addLine("type lines, then done");
    return;
  }

  if(cmd==="preview"){
    if(args.length<1){
      addLine("usage: preview <file>");
      return;
    }

    const f=childByName(state.cwdId,args[0]);

    if(!f || f.type!=="file"){
      addLine("file not found");
      return;
    }

    addLine("preview:");
    addLine(renderTables(f.content || ""));
    return;
  }

  if(cmd==="printpg"){
    const f=state.activeFileId ? nodeById(state.activeFileId) : null;
    const body=`print page

user: ${state.currentUser}
cwd: ${state.cwdPath}
file: ${(f && f.name) || "(none)"}

file view:
${(f && f.content) || ""}
`;
    const safe=escapeHtml(body);

    const html=`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>print</title>
<style>
body{font-family:menlo,monospace;font-size:12px;margin:40px;color:#000;background:#fff;}
pre{white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;font-family:menlo,monospace;font-size:12px;}
</style></head><body><pre>${safe}</pre>
<script>setTimeout(()=>{window.print()},400)<\/script>
</body></html>`;

    const blob=new Blob([html],{type:"text/html"});
    const url=URL.createObjectURL(blob);
    window.open(url,"_blank");
    addLine("print ready");
    return;
  }

  if(cmd==="printdir"){
    const html=buildPrintDirHtml();
    const blob=new Blob([html],{type:"text/html"});
    const url=URL.createObjectURL(blob);
    window.open(url,"_blank");
    addLine("directory print ready");
    return;
  }

  if(cmd==="newcustomer"){
    const id=crypto.randomUUID().slice(0,8);

    const c={
      id,
      name:"",
      phone:"",
      email:"",
      address:"",
      notes:"",
      createdAt:nowIso()
    };

    state.customers.push(c);
    await saveAll();

    addLine("customer created");
    addLine("id: "+id);
    return;
  }

  if(cmd==="customers"){
    if(state.customers.length===0){
      addLine("no customers");
      return;
    }

    state.customers.forEach(c=>{
      addLine(c.id+" "+(c.name || "(unnamed)"));
    });

    return;
  }

  if(cmd==="viewcustomer"){
    if(args.length<1){
      addLine("usage: viewcustomer <id>");
      return;
    }

    const c=state.customers.find(x=>x.id===args[0]);

    if(!c){
      addLine("customer not found");
      return;
    }

    addLine("customer "+c.id);
    addLine("name: "+c.name);
    addLine("phone: "+c.phone);
    addLine("email: "+c.email);
    addLine("address: "+c.address);
    addLine("notes: "+c.notes);
    return;
  }

  if(cmd==="setcustomer"){
    const id=args[0];
    const field=args[1];
    const value=args.slice(2).join(" ");

    const c=state.customers.find(x=>x.id===id);

    if(!c){
      addLine("customer not found");
      return;
    }

    c[field]=value;
    await saveAll();
    addLine("updated");
    return;
  }

  if(cmd==="newjob"){
    const id=crypto.randomUUID().slice(0,8);

    const job={
      id,
      customer:"",
      address:"",
      technician:"",
      status:"scheduled",
      scheduled_date:"",
      start_time:"",
      end_time:"",
      materials:"",
      labor:"",
      notes:"",
      photos:[],
      signature:"",
      createdAt:nowIso()
    };

    state.jobs.push(job);
    await saveAll();

    addLine("job created");
    addLine("id: "+id);
    return;
  }

  if(cmd==="jobs"){
    if(state.jobs.length===0){
      addLine("no jobs");
      return;
    }

    state.jobs.forEach(j=>{
      addLine(j.id+" "+(j.customer || "(no customer)")+" ["+j.status+"]");
    });

    return;
  }

  if(cmd==="viewjob"){
    if(args.length<1){
      addLine("usage: viewjob <id>");
      return;
    }

    const j=state.jobs.find(x=>x.id===args[0]);

    if(!j){
      addLine("job not found");
      return;
    }

    addLine("job "+j.id);
    addLine("customer: "+j.customer);
    addLine("address: "+j.address);
    addLine("technician: "+j.technician);
    addLine("status: "+j.status);
    addLine("scheduled: "+j.scheduled_date);
    addLine("start: "+j.start_time);
    addLine("end: "+j.end_time);
    addLine("materials: "+j.materials);
    addLine("labor: "+j.labor);
    addLine("notes: "+j.notes);
    return;
  }

  if(cmd==="setjob"){
    const id=args[0];
    const field=args[1];
    const value=args.slice(2).join(" ");

    const j=state.jobs.find(x=>x.id===id);

    if(!j){
      addLine("job not found");
      return;
    }

    j[field]=value;
    await saveAll();
    addLine("job updated");
    return;
  }

  if(cmd==="newreceipt"){
    const id=crypto.randomUUID().slice(0,8);

    const r={
      id,
      vendor:"",
      amount:"",
      date:"",
      job:"",
      category:"",
      notes:"",
      createdAt:nowIso()
    };

    state.receipts.push(r);
    await saveAll();

    addLine("receipt created");
    addLine("id: "+id);
    return;
  }

  if(cmd==="receipts"){
    if(state.receipts.length===0){
      addLine("no receipts");
      return;
    }

    state.receipts.forEach(r=>{
      addLine(
        r.id+" "+
        (r.vendor || "(no vendor)")+
        " $"+(r.amount || "0")+
        " "+(r.job ? "[job "+r.job+"]" : "")
      );
    });

    return;
  }

  if(cmd==="viewreceipt"){
    if(args.length<1){
      addLine("usage: viewreceipt <id>");
      return;
    }

    const r=state.receipts.find(x=>x.id===args[0]);

    if(!r){
      addLine("receipt not found");
      return;
    }

    addLine("receipt "+r.id);
    addLine("vendor: "+r.vendor);
    addLine("amount: "+r.amount);
    addLine("date: "+r.date);
    addLine("job: "+r.job);
    addLine("category: "+r.category);
    addLine("notes: "+r.notes);
    return;
  }

  if(cmd==="setreceipt"){
    const id=args[0];
    const field=args[1];
    const value=args.slice(2).join(" ");

    const r=state.receipts.find(x=>x.id===id);

    if(!r){
      addLine("receipt not found");
      return;
    }

    r[field]=value;
    await saveAll();
    addLine("receipt updated");
    return;
  }

  if(cmd==="jobreceipts"){
    if(args.length<1){
      addLine("usage: jobreceipts <jobid>");
      return;
    }

    const jobid=args[0];
    const list=state.receipts.filter(r=>r.job===jobid);

    if(list.length===0){
      addLine("no receipts for job "+jobid);
      return;
    }

    list.forEach(r=>{
      addLine(r.id+" "+(r.vendor || "(no vendor)")+" $"+(r.amount || "0"));
    });

    return;
  }

  if(cmd==="jobtotal"){
    if(args.length<1){
      addLine("usage: jobtotal <jobid>");
      return;
    }

    const jobid=args[0];
    const list=state.receipts.filter(r=>r.job===jobid);

    if(list.length===0){
      addLine("no receipts for job "+jobid);
      return;
    }

    let total=0;

    list.forEach(r=>{
      const amt=parseFloat(r.amount);
      if(!isNaN(amt)) total+=amt;
    });

    addLine("job "+jobid+" receipt total: $"+total.toFixed(2));
    return;
  }

  addLine("unknown command");
}

/* =========================
   boot
========================= */

(async function boot(){
  await loadAll();

  addLine(APP_NAME+" ready");
  addLine(`role: ${localStorage.getItem("spirenet_role") || "operator"}`);
  addLine('type "help" to list commands');

  if(state.adminUnlocked){
    addLine("admin barrier unlocked");
  }

  render();

  setTimeout(()=>{
    try{input.focus();}catch(e){}
  },700);
})();
