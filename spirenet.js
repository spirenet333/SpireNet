if (localStorage.getItem("spirenet_usb_verified") !== "true") {
  window.location.href = "index.html";
}

const APP_NAME = "spirenet";
const DB_NAME = "spirenet_cli_db_v7";
const DB_VERSION = 1;

const terminal = document.getElementById("terminal");
const input = document.getElementById("hiddenInput");
const tap = document.getElementById("tapCatcher");
const hint = document.getElementById("hint");

/* =========================
   utils
========================= */
function lc(s) {
  return (s ?? "").toString().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function safeName(s) {
  return /^[a-z0-9_-]+$/.test(s);
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function splitCmd(line) {
  const t = line.trim();
  if (!t) return { cmd: "", args: [] };
  const parts = t.split(" ");
  return { cmd: parts[0], args: parts.slice(1) };
}

function joinRest(args) {
  return args.join(" ").trim();
}

/* =========================
   indexeddb
========================= */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv");
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const st = tx.objectStore("kv");
    const r = st.get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function kvSet(key, val) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    const st = tx.objectStore("kv");
    const r = st.put(val, key);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

/* =========================
   state
========================= */
const state = {
  transcript: [],
  current: "",
  currentUser: "operator",
  adminUnlocked: localStorage.getItem("spirenet_role") === "admin",

  customers: [],
  jobs: [],
  receipts: [],

  rootId: null,
  cwdId: null,
  cwdPath: "/spirenet",

  activeFileId: null,
  activeFileName: null,

  nodes: [],
  forms: [],
  submissions: [],

  currentAnswers: {},
  currentFormInfo: null,
  wizard: null,
  edit: null
};

/* =========================
   terminal
========================= */
function addLine(s) {
  state.transcript.push(lc(s));
}

function addRawLine(s) {
  state.transcript.push(s);
}

function addPromptEcho(s) {
  addRawLine("> " + lc(s));
}

function render() {
  terminal.textContent = state.transcript.join("\n") + "\n> " + state.current + "_";
  terminal.scrollTop = terminal.scrollHeight;
}

function focusInput() {
  input.focus();
  setTimeout(() => input.focus(), 30);
  setTimeout(() => input.focus(), 120);
  setTimeout(() => {
    if (document.activeElement === input) {
      hint.style.display = "none";
    }
  }, 80);
}

tap.addEventListener("touchstart", focusInput, { passive: true });
tap.addEventListener("pointerdown", focusInput, { passive: true });
terminal.addEventListener("touchstart", focusInput, { passive: true });
terminal.addEventListener("pointerdown", focusInput, { passive: true });

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    setTimeout(focusInput, 150);
  }
});

input.addEventListener("input", () => {
  state.current = lc(input.value);
  if (input.value !== state.current) input.value = state.current;
  render();
});

input.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();

    const line = lc(state.current);
    state.current = "";
    input.value = "";

    if (line.trim().length) {
      addPromptEcho(line);
      await handleLine(line);
    }

    render();
  }
});

/* =========================
   node helpers
========================= */
function nodeById(id) {
  return state.nodes.find(n => n.id === id) || null;
}

function childrenOf(dirId) {
  return state.nodes
    .filter(n => n.parentId === dirId)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function visibleChildrenOf(dirId) {
  return childrenOf(dirId).filter(n => {
    if (pathOf(dirId) === "/spirenet" && n.name === "admin" && !state.adminUnlocked) {
      return false;
    }
    return true;
  });
}

function childByName(dirId, name) {
  return state.nodes.find(n => n.parentId === dirId && n.name === name) || null;
}

function pathOf(id) {
  const n = nodeById(id);
  if (!n) return "/spirenet";
  if (n.id === state.rootId) return "/spirenet";

  const parts = [];
  let cur = n;

  while (cur && cur.parentId) {
    parts.push(cur.name);
    cur = nodeById(cur.parentId);
    if (cur && cur.id === state.rootId) break;
  }

  return "/spirenet/" + parts.reverse().join("/");
}

/* =========================
   persistence
========================= */
async function saveAll() {
  await kvSet("spirenet_state", {
    currentUser: state.currentUser,
    rootId: state.rootId,
    cwdId: state.cwdId,
    activeFileId: state.activeFileId,
    activeFileName: state.activeFileName,
    nodes: state.nodes,
    forms: state.forms,
    submissions: state.submissions,
    customers: state.customers,
    jobs: state.jobs,
    receipts: state.receipts
  });
}

async function loadAll() {
  const saved = await kvGet("spirenet_state");

  if (saved && saved.nodes) {
    state.currentUser = saved.currentUser || "operator";
    state.rootId = saved.rootId;
    state.cwdId = saved.cwdId;
    state.activeFileId = saved.activeFileId ?? null;
    state.activeFileName = saved.activeFileName ?? null;
    state.nodes = saved.nodes || [];
    state.forms = saved.forms || [];
    state.submissions = saved.submissions || [];
    state.customers = saved.customers || [];
    state.jobs = saved.jobs || [];
    state.receipts = saved.receipts || [];
    state.cwdPath = pathOf(state.cwdId || state.rootId) || "/spirenet";
    state.adminUnlocked = localStorage.getItem("spirenet_role") === "admin";
    return;
  }

  const root = {
    id: crypto.randomUUID(),
    parentId: null,
    name: "spirenet",
    type: "dir",
    content: null,
    createdAt: nowIso()
  };

  const admin = {
    id: crypto.randomUUID(),
    parentId: root.id,
    name: "admin",
    type: "dir",
    content: null,
    createdAt: nowIso()
  };

  const job = {
    id: crypto.randomUUID(),
    parentId: root.id,
    name: "job",
    type: "dir",
    content: null,
    createdAt: nowIso()
  };

  state.nodes = [root, admin, job];

  state.rootId = root.id;
  state.cwdId = root.id;
  state.cwdPath = "/spirenet";
  state.activeFileId = null;
  state.activeFileName = null;

  await saveAll();
}

/* =========================
   command list
========================= */
const COMMANDS = [
  ["help", "list commands"],
  ["clear", "clear terminal"],
  ["pwd", "show current directory"],
  ["ls", "list files"],
  ["cd <path>", "change directory"],
  ["touch <file>", "create file"],
  ["cat <file>", "show file"],
  ["write <file> <text>", "write file"],
  ["append <file> <text>", "append file"],
  ["newcustomer", "create customer"],
  ["customers", "list customers"],
  ["viewcustomer <id>", "view customer"],
  ["setcustomer <id> <field> <value>", "edit customer"],
  ["newjob", "create job"],
  ["jobs", "list jobs"],
  ["viewjob <id>", "view job"],
  ["setjob <id> <field> <value>", "edit job"],
  ["newreceipt", "create receipt"],
  ["receipts", "list receipts"],
  ["viewreceipt <id>", "view receipt"],
  ["setreceipt <id> <field> <value>", "edit receipt"],
  ["jobreceipts <jobid>", "list receipts for job"],
  ["jobtotal <jobid>", "total receipts for job"]
];
/* =========================
   core command handler
========================= */
async function handleLine(line) {

  const { cmd, args } = splitCmd(line);

  if (cmd === "help") {
    addLine("commands:");
    COMMANDS.forEach(c => addLine(c[0]));
    return;
  }

  if (cmd === "clear") {
    state.transcript = [];
    addLine("cleared");
    return;
  }

  if (cmd === "pwd") {
    addLine(state.cwdPath);
    return;
  }

  if (cmd === "ls") {

    const kids = childrenOf(state.cwdId);

    if (kids.length === 0) {
      addLine("(empty)");
      return;
    }

    kids.forEach(n => {
      if (n.type === "dir") addLine("dir " + n.name);
      if (n.type === "file") addLine("file " + n.name);
    });

    return;
  }

  if (cmd === "cd") {

    if (args.length < 1) {
      addLine("error: missing path");
      return;
    }

    const name = args[0];

    if (name === "/") {
      state.cwdId = state.rootId;
      state.cwdPath = "/spirenet";
      return;
    }

    if (name === "..") {

      const node = nodeById(state.cwdId);

      if (node.parentId) {
        state.cwdId = node.parentId;
        state.cwdPath = pathOf(node.parentId);
      }

      return;
    }

    const child = childByName(state.cwdId, name);

    if (!child || child.type !== "dir") {
      addLine("not found");
      return;
    }

    state.cwdId = child.id;
    state.cwdPath = pathOf(child.id);

    return;
  }

  if (cmd === "touch") {

    if (args.length < 1) {
      addLine("missing filename");
      return;
    }

    const name = args[0];

    state.nodes.push({
      id: crypto.randomUUID(),
      parentId: state.cwdId,
      name,
      type: "file",
      content: "",
      createdAt: nowIso()
    });

    await saveAll();
    addLine("file created");
    return;
  }

  if (cmd === "cat") {

    if (args.length < 1) {
      addLine("missing filename");
      return;
    }

    const f = childByName(state.cwdId, args[0]);

    if (!f || f.type !== "file") {
      addLine("file not found");
      return;
    }

    addLine(f.content || "");
    return;
  }

  if (cmd === "write") {

    if (args.length < 2) {
      addLine("usage: write <file> <text>");
      return;
    }

    const f = childByName(state.cwdId, args[0]);

    if (!f || f.type !== "file") {
      addLine("file not found");
      return;
    }

    f.content = args.slice(1).join(" ");

    await saveAll();
    addLine("written");
    return;
  }

  if (cmd === "append") {

    if (args.length < 2) {
      addLine("usage: append <file> <text>");
      return;
    }

    const f = childByName(state.cwdId, args[0]);

    if (!f || f.type !== "file") {
      addLine("file not found");
      return;
    }

    const text = args.slice(1).join(" ");

    if (!f.content) f.content = text;
    else f.content += "\n" + text;

    await saveAll();
    addLine("appended");
    return;
  }

  /* =========================
     customers
  ========================= */

  if (cmd === "newcustomer") {

    const id = crypto.randomUUID().slice(0,8);

    const c = {
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
    addLine("id: " + id);

    return;
  }

  if (cmd === "customers") {

    if (state.customers.length === 0) {
      addLine("no customers");
      return;
    }

    state.customers.forEach(c=>{
      addLine(c.id + " " + (c.name || "(unnamed)"));
    });

    return;
  }

  if (cmd === "viewcustomer") {

    const c = state.customers.find(x=>x.id===args[0]);

    if (!c) {
      addLine("customer not found");
      return;
    }

    addLine("customer " + c.id);
    addLine("name: " + c.name);
    addLine("phone: " + c.phone);
    addLine("email: " + c.email);
    addLine("address: " + c.address);
    addLine("notes: " + c.notes);

    return;
  }

  if (cmd === "setcustomer") {

    const id=args[0];
    const field=args[1];
    const value=args.slice(2).join(" ");

    const c = state.customers.find(x=>x.id===id);

    if(!c){
      addLine("customer not found");
      return;
    }

    c[field]=value;

    await saveAll();
    addLine("updated");

    return;
  }

  /* =========================
     jobs
  ========================= */

  if (cmd === "newjob") {

    const id = crypto.randomUUID().slice(0,8);

    const job={
      id,
      customer:"",
      address:"",
      technician:"",
      status:"scheduled",
      notes:"",
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
      addLine(j.id+" "+(j.customer||"(no customer)")+" ["+j.status+"]");
    });

    return;
  }

  if(cmd==="viewjob"){

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

  /* =========================
     receipts
  ========================= */

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
      addLine(r.id+" "+(r.vendor||"(no vendor)")+" $"+(r.amount||"0"));
    });

    return;
  }

  if(cmd==="viewreceipt"){

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

    const jobid=args[0];

    const list=state.receipts.filter(r=>r.job===jobid);

    if(list.length===0){
      addLine("no receipts for job "+jobid);
      return;
    }

    list.forEach(r=>{
      addLine(r.id+" "+(r.vendor||"(no vendor)")+" $"+(r.amount||"0"));
    });

    return;
  }

  if(cmd==="jobtotal"){

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
  addLine('type "help" to list commands');

  render();

  setTimeout(()=>{
    try{input.focus();}catch(e){}
  },700);

})();
