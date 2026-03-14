if (localStorage.getItem("spirenet_usb_verified") !== "true") {
  window.location.href = "index.html";
}

const APP_NAME = "spirenet";
const DB_NAME = "spirenet_cli_db_v10";
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

function normalizePath(raw) {
  raw = lc(raw).replaceAll("\\", "/");
  while (raw.includes("//")) raw = raw.replaceAll("//", "/");
  if (raw.length > 1 && raw.endsWith("/")) raw = raw.slice(0, -1);
  return raw;
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

function resolvePath(fromDirId, raw) {
  raw = normalizePath(raw);

  if (raw === "" || raw === ".") return { ok: true, id: fromDirId };
  if (raw === "/" || raw === "/spirenet") return { ok: true, id: state.rootId };

  let working = raw;
  let startId = fromDirId;

  if (working.startsWith("/spirenet")) {
    startId = state.rootId;
    working = working.slice("/spirenet".length);
    if (working === "") return { ok: true, id: state.rootId };
  } else if (working.startsWith("/")) {
    startId = state.rootId;
    working = working.slice(1);
  }

  const parts = working.split("/").filter(Boolean);
  let curId = startId;

  for (const part of parts) {
    if (part === ".") continue;

    if (part === "..") {
      const cur = nodeById(curId);
      if (cur && cur.parentId) curId = cur.parentId;
      continue;
    }

    const child = childByName(curId, part);
    if (!child) return { ok: false, err: `not found: ${raw}` };
    curId = child.id;
  }

  return { ok: true, id: curId };
}

/* =========================
   render / print helpers
========================= */
function renderTables(text) {
  return (text ?? "").toString();
}

function buildPrintFileHtml(file) {
  const body = `print page

user: ${state.currentUser}
cwd: ${state.cwdPath}
file: ${file ? file.name : "(none)"}

file view:
${file ? renderTables(file.content || "") : ""}
`;

  const safe = escapeHtml(body);

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>print</title>
<style>
body{font-family:menlo,monospace;font-size:12px;margin:40px;color:#000;background:#fff;}
pre{white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;font-family:menlo,monospace;font-size:12px;}
</style>
</head><body><pre>${safe}</pre>
<script>setTimeout(()=>{window.print()},400)<\/script>
</body></html>`;
}

function buildPrintDirHtml() {
  const kids = childrenOf(state.cwdId).filter(n => n.type === "file");

  let body = `directory print

path: ${state.cwdPath}
files: ${kids.length}

`;

  if (kids.length === 0) {
    body += "(no files in this directory)\n";
  } else {
    kids.forEach((file, index) => {
      body += `==================================================
file ${index + 1}: ${file.name}
==================================================

${renderTables(file.content || "")}

`;
    });
  }

  const safe = escapeHtml(body);

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>print directory</title>
<style>
body{font-family:menlo,monospace;font-size:12px;margin:40px;color:#000;background:#fff;}
pre{white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;font-family:menlo,monospace;font-size:12px;}
</style>
</head><body><pre>${safe}</pre>
<script>setTimeout(()=>{window.print()},400)<\/script>
</body></html>`;
}

/* =========================
   persistence
========================= */
function syncAdminFiles() {
  const adminDir = state.nodes.find(
    n => n.parentId === state.rootId && n.name === "admin" && n.type === "dir"
  );

  if (!adminDir) return;

  let roleFile = state.nodes.find(
    n => n.parentId === adminDir.id && n.name === "admin_role" && n.type === "file"
  );

  if (!roleFile) {
    roleFile = {
      id: crypto.randomUUID(),
      parentId: adminDir.id,
      name: "admin_role",
      type: "file",
      content: "",
      createdAt: nowIso()
    };
    state.nodes.push(roleFile);
  }

  roleFile.content = localStorage.getItem("spirenet_role") || "operator";
}

async function saveAll() {
  syncAdminFiles();

  await kvSet("spirenet_state", {
    currentUser: state.currentUser,
    rootId: state.rootId,
    cwdId: state.cwdId,
    activeFileId: state.activeFileId,
    activeFileName: state.activeFileName,
    nodes: state.nodes,
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
    state.customers = saved.customers || [];
    state.jobs = saved.jobs || [];
    state.receipts = saved.receipts || [];
    state.cwdPath = pathOf(state.cwdId || state.rootId) || "/spirenet";
    state.adminUnlocked = localStorage.getItem("spirenet_role") === "admin";
    syncAdminFiles();
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

  const net = {
    id: crypto.randomUUID(),
    parentId: root.id,
    name: "net",
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

  const adminRole = {
    id: crypto.randomUUID(),
    parentId: admin.id,
    name: "admin_role",
    type: "file",
    content: localStorage.getItem("spirenet_role") || "operator",
    createdAt: nowIso()
  };

  state.nodes = [root, admin, net, job, adminRole];
  state.rootId = root.id;
  state.cwdId = root.id;
  state.cwdPath = "/spirenet";
  state.activeFileId = null;
  state.activeFileName = null;
  state.customers = [];
  state.jobs = [];
  state.receipts = [];
  state.adminUnlocked = localStorage.getItem("spirenet_role") === "admin";

  syncAdminFiles();
  await saveAll();
}

/* =========================
   commands
========================= */
const COMMANDS = [
  ["help", "list commands"],
  ["cmmdhelp", "describe commands"],
  ["status", "show status"],
  ["whoami", "show current user"],
  ["pwd", "show cwd"],
  ["ls", "list directory"],
  ["cd <path>", "change directory"],
  ["mkdir <name>", "create directory"],
  ["touch <file>", "create file"],
  ["cat <file>", "show file"],
  ["write <file> <text>", "overwrite file"],
  ["append <file> <text>", "append file"],
  ["open <file>", "set active file"],
  ["edit <file>", "enter edit mode"],
  ["done", "exit edit mode"],
  ["preview <file>", "preview file"],
  ["printpg", "print active file"],
  ["printdir", "print entire directory"],
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
  ["jobreceipts <jobid>", "receipts for job"],
  ["jobtotal <jobid>", "receipt totals"],
  ["adminauth", "unlock admin barrier"],
  ["clear", "clear terminal"]
];

/* =========================
   edit mode
========================= */
function handleEditLine(line) {
  const t = lc(line).trim();

  if (t === "done") {
    const file = nodeById(state.edit.fileId);

    if (file && file.type === "file") {
      file.content = state.edit.buffer.join("\n");
      saveAll();
      addLine("saved");
    }

    state.edit = null;
    return;
  }

  state.edit.buffer.push(line);
}
/* =========================
   command handler
========================= */

async function handleLine(line) {

  if (state.edit) {
    handleEditLine(line);
    return;
  }

  const { cmd, args } = splitCmd(line);

  if (!cmd) return;

  if (cmd === "help") {
    addLine("commands:");
    COMMANDS.forEach(c => addLine(c[0]));
    return;
  }

  if (cmd === "cmmdhelp") {
    addLine("command descriptions:");
    COMMANDS.forEach(c => addLine(`${c[0]} : ${c[1]}`));
    return;
  }

  if (cmd === "clear") {
    state.transcript = [];
    terminal.textContent = "";
    return;
  }

  if (cmd === "status") {
    addLine(`user: ${state.currentUser}`);
    addLine(`cwd: ${state.cwdPath}`);
    addLine(`customers: ${state.customers.length}`);
    addLine(`jobs: ${state.jobs.length}`);
    addLine(`receipts: ${state.receipts.length}`);
    return;
  }

  if (cmd === "whoami") {
    addLine(state.currentUser);
    return;
  }

  if (cmd === "pwd") {
    addLine(state.cwdPath);
    return;
  }

  if (cmd === "ls") {
    const kids = visibleChildrenOf(state.cwdId);

    if (!kids.length) {
      addLine("(empty)");
      return;
    }

    kids.forEach(n => {
      if (n.type === "dir") addLine(`dir ${n.name}`);
      else addLine(`file ${n.name}`);
    });

    return;
  }

  if (cmd === "cd") {

    const target = joinRest(args) || "/";

    const res = resolvePath(state.cwdId, target);

    if (!res.ok) {
      addLine(res.err);
      return;
    }

    const node = nodeById(res.id);

    if (!node || node.type !== "dir") {
      addLine("not a directory");
      return;
    }

    state.cwdId = node.id;
    state.cwdPath = pathOf(node.id);

    await saveAll();
    return;
  }

  if (cmd === "mkdir") {

    const name = lc(args[0] || "");

    if (!safeName(name)) {
      addLine("invalid name");
      return;
    }

    if (childByName(state.cwdId, name)) {
      addLine("already exists");
      return;
    }

    state.nodes.push({
      id: crypto.randomUUID(),
      parentId: state.cwdId,
      name,
      type: "dir",
      content: null,
      createdAt: nowIso()
    });

    await saveAll();
    addLine("directory created");
    return;
  }

  if (cmd === "touch") {

    const name = lc(args[0] || "");

    if (!safeName(name)) {
      addLine("invalid name");
      return;
    }

    if (childByName(state.cwdId, name)) {
      addLine("already exists");
      return;
    }

    const file = {
      id: crypto.randomUUID(),
      parentId: state.cwdId,
      name,
      type: "file",
      content: "",
      createdAt: nowIso()
    };

    state.nodes.push(file);

    await saveAll();
    addLine("file created");
    return;
  }

  if (cmd === "cat") {

    const name = lc(args[0] || "");
    const file = childByName(state.cwdId, name);

    if (!file || file.type !== "file") {
      addLine("file not found");
      return;
    }

    addRawLine(file.content || "");
    return;
  }

  if (cmd === "write") {

    const name = lc(args[0] || "");
    const text = args.slice(1).join(" ");

    const file = childByName(state.cwdId, name);

    if (!file || file.type !== "file") {
      addLine("file not found");
      return;
    }

    file.content = text;

    await saveAll();
    addLine("written");
    return;
  }

  if (cmd === "append") {

    const name = lc(args[0] || "");
    const text = args.slice(1).join(" ");

    const file = childByName(state.cwdId, name);

    if (!file || file.type !== "file") {
      addLine("file not found");
      return;
    }

    file.content += "\n" + text;

    await saveAll();
    addLine("appended");
    return;
  }

  if (cmd === "open") {

    const name = lc(args[0] || "");
    const file = childByName(state.cwdId, name);

    if (!file || file.type !== "file") {
      addLine("file not found");
      return;
    }

    state.activeFileId = file.id;
    state.activeFileName = file.name;

    await saveAll();
    addLine(`active file: ${file.name}`);
    return;
  }

  if (cmd === "edit") {

    const name = lc(args[0] || "");
    const file = childByName(state.cwdId, name);

    if (!file || file.type !== "file") {
      addLine("file not found");
      return;
    }

    state.edit = {
      fileId: file.id,
      buffer: (file.content || "").split("\n")
    };

    addLine("edit mode (type 'done' to save)");
    return;
  }

  if (cmd === "done") {
    addLine("not in edit mode");
    return;
  }

  if (cmd === "preview") {

    const name = lc(args[0] || "");
    const file = childByName(state.cwdId, name);

    if (!file || file.type !== "file") {
      addLine("file not found");
      return;
    }

    addRawLine(file.content || "");
    return;
  }

  if (cmd === "printpg") {

    const file = nodeById(state.activeFileId);

    if (!file) {
      addLine("no active file");
      return;
    }

    const w = window.open("", "_blank");
    w.document.write(buildPrintFileHtml(file));
    w.document.close();

    addLine("print window opened");
    return;
  }

  if (cmd === "printdir") {

    const w = window.open("", "_blank");
    w.document.write(buildPrintDirHtml());
    w.document.close();

    addLine("directory print opened");
    return;
  }

  if (cmd === "newcustomer") {

    const id = crypto.randomUUID().slice(0, 8);

    state.customers.push({
      id,
      name: "",
      phone: "",
      email: "",
      address: ""
    });

    await saveAll();
    addLine(`customer created: ${id}`);
    return;
  }

  if (cmd === "customers") {

    if (!state.customers.length) {
      addLine("(none)");
      return;
    }

    state.customers.forEach(c => {
      addLine(`${c.id} ${c.name}`);
    });

    return;
  }

  if (cmd === "viewcustomer") {

    const id = args[0];
    const c = state.customers.find(x => x.id === id);

    if (!c) {
      addLine("customer not found");
      return;
    }

    addLine(`id: ${c.id}`);
    addLine(`name: ${c.name}`);
    addLine(`phone: ${c.phone}`);
    addLine(`email: ${c.email}`);
    addLine(`address: ${c.address}`);
    return;
  }

  if (cmd === "setcustomer") {

    const id = args[0];
    const field = args[1];
    const val = args.slice(2).join(" ");

    const c = state.customers.find(x => x.id === id);

    if (!c) {
      addLine("customer not found");
      return;
    }

    c[field] = val;

    await saveAll();
    addLine("customer updated");
    return;
  }

  if (cmd === "newjob") {

    const id = crypto.randomUUID().slice(0, 8);

    state.jobs.push({
      id,
      customer: "",
      address: "",
      notes: ""
    });

    await saveAll();
    addLine(`job created: ${id}`);
    return;
  }

  if (cmd === "jobs") {

    if (!state.jobs.length) {
      addLine("(none)");
      return;
    }

    state.jobs.forEach(j => {
      addLine(`${j.id} ${j.customer}`);
    });

    return;
  }

  if (cmd === "viewjob") {

    const id = args[0];
    const j = state.jobs.find(x => x.id === id);

    if (!j) {
      addLine("job not found");
      return;
    }

    addLine(`id: ${j.id}`);
    addLine(`customer: ${j.customer}`);
    addLine(`address: ${j.address}`);
    addLine(`notes: ${j.notes}`);
    return;
  }

  if (cmd === "setjob") {

    const id = args[0];
    const field = args[1];
    const val = args.slice(2).join(" ");

    const j = state.jobs.find(x => x.id === id);

    if (!j) {
      addLine("job not found");
      return;
    }

    j[field] = val;

    await saveAll();
    addLine("job updated");
    return;
  }

  if (cmd === "newreceipt") {

    const id = crypto.randomUUID().slice(0, 8);

    state.receipts.push({
      id,
      vendor: "",
      amount: 0,
      job: ""
    });

    await saveAll();
    addLine(`receipt created: ${id}`);
    return;
  }

  if (cmd === "receipts") {

    if (!state.receipts.length) {
      addLine("(none)");
      return;
    }

    state.receipts.forEach(r => {
      addLine(`${r.id} ${r.vendor} $${r.amount}`);
    });

    return;
  }

  if (cmd === "viewreceipt") {

    const id = args[0];
    const r = state.receipts.find(x => x.id === id);

    if (!r) {
      addLine("receipt not found");
      return;
    }

    addLine(`id: ${r.id}`);
    addLine(`vendor: ${r.vendor}`);
    addLine(`amount: ${r.amount}`);
    addLine(`job: ${r.job}`);
    return;
  }

  if (cmd === "setreceipt") {

    const id = args[0];
    const field = args[1];
    const val = args.slice(2).join(" ");

    const r = state.receipts.find(x => x.id === id);

    if (!r) {
      addLine("receipt not found");
      return;
    }

    if (field === "amount") r.amount = parseFloat(val);
    else r[field] = val;

    await saveAll();
    addLine("receipt updated");
    return;
  }

  if (cmd === "jobreceipts") {

    const jobid = args[0];

    const rs = state.receipts.filter(r => r.job === jobid);

    if (!rs.length) {
      addLine("(none)");
      return;
    }

    rs.forEach(r => {
      addLine(`${r.id} ${r.vendor} $${r.amount}`);
    });

    return;
  }

  if (cmd === "jobtotal") {

    const jobid = args[0];

    const rs = state.receipts.filter(r => r.job === jobid);

    const sum = rs.reduce((t, r) => t + (r.amount || 0), 0);

    addLine(`total: $${sum.toFixed(2)}`);
    return;
  }

  if (cmd === "adminauth") {

    state.adminUnlocked = true;
    localStorage.setItem("spirenet_role", "admin");

    await saveAll();

    addLine("admin barrier unlocked");
    return;
  }

  addLine("unknown command");
}

/* =========================
   boot
========================= */

(async () => {

  await loadAll();

  addLine(`${APP_NAME} ready`);

  if (state.adminUnlocked) {
    addLine("role: admin");
    addLine("admin barrier unlocked");
  }

  addLine(`type "help" to list commands`);

  render();

  setTimeout(focusInput, 120);
  setTimeout(focusInput, 400);

})();
