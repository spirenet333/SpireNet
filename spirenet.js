if (localStorage.getItem("spirenet_usb_verified") !== "true") {
  window.location.href = "index.html";
}

const APP_NAME = "spirenet";
const DB_NAME = "spirenet_cli_db_v15";
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
   database
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
  invoices: [],
  payments: [],

  businessplan: {
    revenue_target: 0,
    job_target: 0,
    profit_target: 0,
    marketing_budget: 0,
    labor_budget: 0,
    materials_budget: 0,
    customer_growth: 0,
    review_target: 0
  },

  rootId: null,
  cwdId: null,
  cwdPath: "/spirenet",

  activeFileId: null,
  activeFileName: null,

  nodes: [],
  edit: null
};

/* =========================
   terminal + input
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
   filesystem helpers
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
   business helpers
========================= */
function findCustomerByName(name) {
  const target = lc(name || "").trim();
  return state.customers.find(c => lc(c.name || "").trim() === target) || null;
}

function receiptsForJob(jobId) {
  return state.receipts.filter(r => r.job === jobId);
}

function totalForJob(jobId) {
  return receiptsForJob(jobId).reduce((sum, r) => {
    const amt = parseFloat(r.amount);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);
}

/* =========================
   column formatting
========================= */
function formatListIntoColumns(items, rowsPerColumn = 10) {
  if (!items || items.length === 0) return ["(none)"];

  const cleanItems = items.map(x => (x ?? "").toString());
  const longest = cleanItems.reduce((m, s) => Math.max(m, s.length), 0);
  const colWidth = Math.max(18, Math.min(longest + 4, 42));

  const screenWidth = window.innerWidth || 1024;

  let colsPerPage = 1;
  if (screenWidth >= 1400) colsPerPage = 3;
  else if (screenWidth >= 900) colsPerPage = 2;
  else colsPerPage = 1;

  const itemsPerPage = rowsPerColumn * colsPerPage;
  const lines = [];

  for (let pageStart = 0; pageStart < cleanItems.length; pageStart += itemsPerPage) {
    const pageItems = cleanItems.slice(pageStart, pageStart + itemsPerPage);

    for (let row = 0; row < rowsPerColumn; row++) {
      let line = "";

      for (let col = 0; col < colsPerPage; col++) {
        const index = row + (col * rowsPerColumn);

        if (index >= pageItems.length) continue;

        line += pageItems[index].padEnd(colWidth, " ");
      }

      if (line.trim().length > 0) {
        lines.push(line.replace(/\s+$/, ""));
      }
    }

    if (pageStart + itemsPerPage < cleanItems.length) {
      lines.push("");
    }
  }

  return lines;
}

function addColumnList(items, rowsPerColumn = 10) {
  const lines = formatListIntoColumns(items, rowsPerColumn);
  lines.forEach(line => addRawLine(line));
}
/* =========================
   persistence
========================= */
async function loadState() {
  const saved = await kvGet("state_v15");

  if (saved) {
    Object.assign(state, saved);
    return;
  }

  // initialize fresh filesystem
  const rootId = crypto.randomUUID();
  const adminId = crypto.randomUUID();

  state.rootId = rootId;
  state.cwdId = rootId;

  state.nodes = [
    {
      id: rootId,
      name: "spirenet",
      type: "dir",
      parentId: null,
      created: nowIso()
    },
    {
      id: adminId,
      name: "admin",
      type: "dir",
      parentId: rootId,
      created: nowIso()
    }
  ];

  await saveState();
}

async function saveState() {
  const clone = JSON.parse(JSON.stringify(state));
  await kvSet("state_v15", clone);
}

/* =========================
   printing + preview
========================= */
function previewContent(content, title = "preview") {
  const w = window.open("", "_blank");

  const html = `
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            font-family: monospace;
            padding: 20px;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>${escapeHtml(content)}</body>
    </html>
  `;

  w.document.write(html);
  w.document.close();
}

function printContent(content, title = "print") {
  const w = window.open("", "_blank");

  const html = `
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            font-family: monospace;
            padding: 20px;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body onload="window.print();window.close();">
        ${escapeHtml(content)}
      </body>
    </html>
  `;

  w.document.write(html);
  w.document.close();
}

function printDirectory(dirId) {
  const files = childrenOf(dirId).filter(n => n.type === "file");

  if (files.length === 0) {
    addLine("directory empty");
    return;
  }

  let combined = "";

  files.forEach(f => {
    combined += "===== " + f.name + " =====\n";
    combined += (f.content || "") + "\n\n";
  });

  printContent(combined, "directory print");
}

/* =========================
   business plan + reports
========================= */
function showBusinessPlan() {
  const bp = state.businessplan;

  addLine("business plan:");
  Object.entries(bp).forEach(([k, v]) => {
    addLine(`${k}: ${v}`);
  });
}

function setBusinessPlan(field, value) {
  if (!(field in state.businessplan)) {
    addLine("invalid field");
    return;
  }

  const num = parseFloat(value);
  state.businessplan[field] = isNaN(num) ? value : num;

  addLine("plan updated");
}

function scorecard() {
  const bp = state.businessplan;

  const totalRevenue = state.receipts.reduce((sum, r) => {
    const amt = parseFloat(r.amount);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const totalJobs = state.jobs.length;

  addLine("scorecard:");
  addLine(`revenue: ${totalRevenue} / ${bp.revenue_target}`);
  addLine(`jobs: ${totalJobs} / ${bp.job_target}`);
}

function financialReport() {
  let totalRevenue = 0;

  state.receipts.forEach(r => {
    const amt = parseFloat(r.amount);
    if (!isNaN(amt)) totalRevenue += amt;
  });

  addLine("financial report:");
  addLine(`revenue: ${totalRevenue}`);
  addLine(`jobs: ${state.jobs.length}`);
  addLine(`customers: ${state.customers.length}`);
}

function taxReport() {
  let total = 0;

  state.receipts.forEach(r => {
    const amt = parseFloat(r.amount);
    if (!isNaN(amt)) total += amt;
  });

  const tax = total * 0.08;

  addLine("tax report:");
  addLine(`estimated tax (8%): ${tax.toFixed(2)}`);
}

function dashboardReport() {
  addLine("dashboard:");
  addLine(`customers: ${state.customers.length}`);
  addLine(`jobs: ${state.jobs.length}`);
  addLine(`receipts: ${state.receipts.length}`);
}
/* =========================
   command list
========================= */
const COMMANDS = [
  ["help", "list commands"],
  ["cmmdhelp", "describe commands"],
  ["clear", "clear terminal"],
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
  ["done", "save file in edit mode"],
  ["preview <file>", "preview file"],
  ["printpg", "print active file"],
  ["printdir", "print files in directory"],

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
  ["jobreceipts <jobid>", "list receipts for a job"],
  ["jobtotal <jobid>", "sum receipts for a job"],

  ["newinvoice", "create invoice"],
  ["invoices", "list invoices"],
  ["viewinvoice <id>", "view invoice"],
  ["setinvoice <id> <field> <value>", "edit invoice"],

  ["newpayment", "create payment"],
  ["payments", "list payments"],
  ["viewpayment <id>", "view payment"],

  ["businessplan", "show business plan"],
  ["setplan <field> <value>", "set business plan field"],
  ["scorecard", "show scorecard"],

  ["report financial", "show financial report"],
  ["report tax", "show tax report"],
  ["report dashboard", "show dashboard report"]
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
      state.edit = null;
      addLine("saved");
    } else {
      state.edit = null;
      addLine("file missing");
    }

    return;
  }

  state.edit.buffer.push(line);
}

/* =========================
   command handler - part 1
========================= */
async function handleLine(line) {
  if (state.edit) {
    handleEditLine(line);
    await saveState();
    return;
  }

  const { cmd, args } = splitCmd(line);

  if (!cmd) return;

  if (cmd === "help") {
    addLine("commands:");
    addColumnList(COMMANDS.map(c => c[0]), 10);
    return;
  }

  if (cmd === "cmmdhelp") {
    addLine("command descriptions:");
    COMMANDS.forEach(c => addLine(`${c[0]} : ${c[1]}`));
    return;
  }

  if (cmd === "clear") {
    state.transcript = [];
    return;
  }

  if (cmd === "status") {
    addLine(`user: ${state.currentUser}`);
    addLine(`cwd: ${state.cwdPath}`);
    addLine(`customers: ${state.customers.length}`);
    addLine(`jobs: ${state.jobs.length}`);
    addLine(`receipts: ${state.receipts.length}`);
    addLine(`invoices: ${state.invoices.length}`);
    addLine(`payments: ${state.payments.length}`);
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

    const items = kids.map(n => n.type === "dir" ? `dir ${n.name}` : `file ${n.name}`);
    addColumnList(items, 10);
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
    await saveState();
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
      created: nowIso()
    });

    await saveState();
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

    state.nodes.push({
      id: crypto.randomUUID(),
      parentId: state.cwdId,
      name,
      type: "file",
      content: "",
      created: nowIso()
    });

    await saveState();
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
    await saveState();
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

    file.content = (file.content ? file.content + "\n" : "") + text;
    await saveState();
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
    await saveState();
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

    previewContent(file.content || "", file.name);
    addLine("preview opened");
    return;
  }

  if (cmd === "printpg") {
    const file = nodeById(state.activeFileId);

    if (!file || file.type !== "file") {
      addLine("no active file");
      return;
    }

    printContent(file.content || "", file.name || "print");
    addLine("print opened");
    return;
  }

  if (cmd === "printdir") {
    printDirectory(state.cwdId);
    return;
  }
    if (cmd === "newcustomer") {
    const id = crypto.randomUUID().slice(0, 8);

    state.customers.push({
      id,
      name: "",
      phone: "",
      email: "",
      address: "",
      notes: ""
    });

    await saveState();
    addLine(`customer created: ${id}`);
    return;
  }

  if (cmd === "customers") {
    if (!state.customers.length) {
      addLine("(none)");
      return;
    }

    addColumnList(
      state.customers.map(c => `${c.id} ${c.name || ""}`.trim()),
      10
    );
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
    addLine(`notes: ${c.notes}`);
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
    await saveState();
    addLine("customer updated");
    return;
  }

  if (cmd === "newjob") {
    const id = crypto.randomUUID().slice(0, 8);
    const folderName = "job_" + id;

    state.jobs.push({
      id,
      folder: folderName,
      customer: "",
      address: "",
      technician: "",
      status: "scheduled",
      scheduled_date: "",
      start_time: "",
      end_time: "",
      materials: "",
      labor: "",
      notes: "",
      photos: [],
      signature: ""
    });

    const jobDir = {
      id: crypto.randomUUID(),
      parentId: state.rootId,
      name: folderName,
      type: "dir",
      created: nowIso()
    };

    const infoFile = {
      id: crypto.randomUUID(),
      parentId: jobDir.id,
      name: "info",
      type: "file",
      content: `job id: ${id}\nstatus: scheduled`,
      created: nowIso()
    };

    const notesFile = {
      id: crypto.randomUUID(),
      parentId: jobDir.id,
      name: "notes",
      type: "file",
      content: "",
      created: nowIso()
    };

    const materialsFile = {
      id: crypto.randomUUID(),
      parentId: jobDir.id,
      name: "materials",
      type: "file",
      content: "",
      created: nowIso()
    };

    const laborFile = {
      id: crypto.randomUUID(),
      parentId: jobDir.id,
      name: "labor",
      type: "file",
      content: "",
      created: nowIso()
    };

    state.nodes.push(jobDir, infoFile, notesFile, materialsFile, laborFile);

    await saveState();
    addLine(`job created: ${id}`);
    addLine(`folder created: ${folderName}`);
    return;
  }

  if (cmd === "jobs") {
    if (!state.jobs.length) {
      addLine("(none)");
      return;
    }

    addColumnList(
      state.jobs.map(j => `${j.id} ${j.customer || ""} [${j.status}]`.trim()),
      10
    );
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
    addLine(`folder: ${j.folder || ""}`);
    addLine(`customer: ${j.customer}`);
    addLine(`address: ${j.address}`);
    addLine(`technician: ${j.technician}`);
    addLine(`status: ${j.status}`);
    addLine(`scheduled_date: ${j.scheduled_date}`);
    addLine(`start_time: ${j.start_time}`);
    addLine(`end_time: ${j.end_time}`);
    addLine(`materials: ${j.materials}`);
    addLine(`labor: ${j.labor}`);
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

    if (j.folder) {
      const jobDir = childByName(state.rootId, j.folder);
      if (jobDir) {
        const infoFile = childByName(jobDir.id, "info");
        if (infoFile && infoFile.type === "file") {
          infoFile.content =
`job id: ${j.id}
customer: ${j.customer}
address: ${j.address}
technician: ${j.technician}
status: ${j.status}
scheduled_date: ${j.scheduled_date}
start_time: ${j.start_time}
end_time: ${j.end_time}
materials: ${j.materials}
labor: ${j.labor}
notes: ${j.notes}`;
        }
      }
    }

    await saveState();
    addLine("job updated");
    return;
  }

  if (cmd === "newreceipt") {
    const id = crypto.randomUUID().slice(0, 8);

    state.receipts.push({
      id,
      vendor: "",
      amount: 0,
      date: "",
      job: "",
      category: "",
      notes: ""
    });

    await saveState();
    addLine(`receipt created: ${id}`);
    return;
  }

  if (cmd === "receipts") {
    if (!state.receipts.length) {
      addLine("(none)");
      return;
    }

    addColumnList(
      state.receipts.map(r => `${r.id} ${r.vendor || ""} $${r.amount || 0}`.trim()),
      10
    );
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
    addLine(`date: ${r.date}`);
    addLine(`job: ${r.job}`);
    addLine(`category: ${r.category}`);
    addLine(`notes: ${r.notes}`);
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

    if (field === "amount") r.amount = parseFloat(val) || 0;
    else r[field] = val;

    await saveState();
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

    addColumnList(
      rs.map(r => `${r.id} ${r.vendor || ""} $${r.amount || 0}`.trim()),
      10
    );
    return;
  }

  if (cmd === "jobtotal") {
    const jobid = args[0];
    const rs = state.receipts.filter(r => r.job === jobid);
    const sum = rs.reduce((t, r) => t + (parseFloat(r.amount) || 0), 0);

    addLine(`total: $${sum.toFixed(2)}`);
    return;
  }

  if (cmd === "newinvoice") {
    const id = crypto.randomUUID().slice(0, 8);

    state.invoices.push({
      id,
      customer: "",
      job: "",
      amount: 0,
      date: "",
      status: "unpaid"
    });

    await saveState();
    addLine(`invoice created: ${id}`);
    return;
  }

  if (cmd === "invoices") {
    if (!state.invoices.length) {
      addLine("(none)");
      return;
    }

    addColumnList(
      state.invoices.map(i => `${i.id} ${i.customer || ""} $${i.amount || 0} [${i.status || ""}]`.trim()),
      10
    );
    return;
  }

  if (cmd === "viewinvoice") {
    const id = args[0];
    const i = state.invoices.find(x => x.id === id);

    if (!i) {
      addLine("invoice not found");
      return;
    }

    addLine(`id: ${i.id}`);
    addLine(`customer: ${i.customer}`);
    addLine(`job: ${i.job}`);
    addLine(`amount: ${i.amount}`);
    addLine(`date: ${i.date}`);
    addLine(`status: ${i.status}`);
    return;
  }

  if (cmd === "setinvoice") {
    const id = args[0];
    const field = args[1];
    const val = args.slice(2).join(" ");

    const i = state.invoices.find(x => x.id === id);

    if (!i) {
      addLine("invoice not found");
      return;
    }

    if (field === "amount") i.amount = parseFloat(val) || 0;
    else i[field] = val;

    await saveState();
    addLine("invoice updated");
    return;
  }

  if (cmd === "newpayment") {
    const id = crypto.randomUUID().slice(0, 8);

    state.payments.push({
      id,
      invoice: "",
      amount: 0,
      date: "",
      method: ""
    });

    await saveState();
    addLine(`payment recorded: ${id}`);
    return;
  }

  if (cmd === "payments") {
    if (!state.payments.length) {
      addLine("(none)");
      return;
    }

    addColumnList(
      state.payments.map(p => `${p.id} invoice:${p.invoice || ""} $${p.amount || 0}`.trim()),
      10
    );
    return;
  }

  if (cmd === "viewpayment") {
    const id = args[0];
    const p = state.payments.find(x => x.id === id);

    if (!p) {
      addLine("payment not found");
      return;
    }

    addLine(`id: ${p.id}`);
    addLine(`invoice: ${p.invoice}`);
    addLine(`amount: ${p.amount}`);
    addLine(`date: ${p.date}`);
    addLine(`method: ${p.method}`);
    return;
  }

  if (cmd === "businessplan") {
    showBusinessPlan();
    return;
  }

  if (cmd === "setplan") {
    const field = args[0];
    const value = args.slice(1).join(" ");
    setBusinessPlan(field, value);
    await saveState();
    return;
  }

  if (cmd === "scorecard") {
    scorecard();
    return;
  }

  if (cmd === "report" && args[0] === "financial") {
    financialReport();
    return;
  }

  if (cmd === "report" && args[0] === "tax") {
    taxReport();
    return;
  }

  if (cmd === "report" && args[0] === "dashboard") {
    dashboardReport();
    return;
  }

  addLine("unknown command");
}

/* =========================
   boot
========================= */
(async function boot() {
  await loadState();

  addLine(`${APP_NAME} ready`);
  addLine(`type "help" to list commands`);

  render();

  setTimeout(() => {
    try { input.focus(); } catch (e) {}
  }, 700);
})();
