if (localStorage.getItem("spirenet_usb_verified") !== "true") {
  window.location.href = "index.html";
}

const APP_NAME = "spirenet";
const DB_NAME = "spirenet_cli_db_v4";
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

function normalizePath(raw) {
  raw = lc(raw).replaceAll("\\", "/");
  while (raw.includes("//")) raw = raw.replaceAll("//", "/");
  if (raw.length > 1 && raw.endsWith("/")) raw = raw.slice(0, -1);
  return raw;
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
   forms
========================= */
function formForDirCompleted(dirId) {
  return state.forms.find(f => f.dirId === dirId && f.status === "completed") || null;
}

function formForDirDraft(dirId) {
  return state.forms.find(f => f.dirId === dirId && f.status === "draft") || null;
}

function versionForForm(name, questions) {
  const s = name + "::" + questions.join("||");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return "v" + h.toString(16);
}

function emitFormInfoIfAny(dirId) {
  const f = formForDirCompleted(dirId);

  if (!f) {
    state.currentFormInfo = null;
    state.currentAnswers = {};
    return;
  }

  state.currentFormInfo = {
    name: f.name,
    questions: f.questions,
    version: f.version
  };

  state.currentAnswers = {};
  addLine(`form detected: ${f.name}`);
  f.questions.forEach((q, i) => addLine(`q${i + 1}: ${q}`));
  addLine("fill: answer <q#> <text>");
  addLine("then: submit");
  addLine("other: clearanswers, submissions, view <id>");
}

/* =========================
   tables
========================= */
function renderTables(text) {
  const lines = (text ?? "").split("\n");
  const out = [];
  let inTbl = false;
  let tbl = [];

  function flushTbl() {
    if (tbl.length === 0) return;

    const rows = tbl.map(l => l.split("|").map(c => c.trim()));
    const cols = Math.max(...rows.map(r => r.length), 0);
    const widths = new Array(cols).fill(0);

    rows.forEach(r => {
      for (let i = 0; i < cols; i++) {
        const v = r[i] ?? "";
        widths[i] = Math.max(widths[i], v.length);
      }
    });

    rows.forEach(r => {
      const line = r.map((v, i) => (v ?? "").padEnd(widths[i], " ")).join(" | ");
      out.push(line);
    });

    tbl = [];
  }

  for (const l of lines) {
    const s = lc(l).trim();

    if (s.includes("{writetbl}")) {
      inTbl = true;
      out.push("");
      out.push("");
      continue;
    }

    if (s.includes("{endtbl}")) {
      inTbl = false;
      flushTbl();
      continue;
    }

    if (inTbl) tbl.push(lc(l));
    else out.push(lc(l));
  }

  if (inTbl) flushTbl();
  return out.join("\n");
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
    forms: state.forms,
    submissions: state.submissions
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

  const letters = "abcdefghijklmnopqrstuvwxyz".split("");

  for (const letter1 of letters) {
    const level1 = {
      id: crypto.randomUUID(),
      parentId: net.id,
      name: letter1,
      type: "dir",
      content: null,
      createdAt: nowIso()
    };

    state.nodes.push(level1);

    for (const letter2 of letters) {
      const level2 = {
        id: crypto.randomUUID(),
        parentId: level1.id,
        name: letter2,
        type: "dir",
        content: null,
        createdAt: nowIso()
      };
      state.nodes.push(level2);
    }
  }

  state.rootId = root.id;
  state.cwdId = root.id;
  state.cwdPath = "/spirenet";
  state.activeFileId = null;
  state.activeFileName = null;
  state.forms = [];
  state.submissions = [];
  state.adminUnlocked = localStorage.getItem("spirenet_role") === "admin";

  syncAdminFiles();
  await saveAll();
}

/* =========================
   commands
========================= */
const COMMANDS = [
  ["help", "list commands"],
  ["commandls", "list all commands"],
  ["cmmdhelp", "describe commands + usage"],
  ["status", "show node status"],
  ["pwd", "show current directory"],
  ["whoami", "show current user"],
  ["ls", "list directories/files in cwd"],
  ["cd <path>", "change directory (/, .., relative, absolute)"],
  ["mkdir <name>", "create directory in cwd"],
  ["touch <filename>", "create empty file in cwd"],
  ["rm <name>", "delete file or empty dir"],
  ["mv <source> <dest>", "move/rename file or dir"],
  ["cat <filename>", "show file contents"],
  ["write <filename> <text...>", "overwrite file with text"],
  ["append <filename> <text...>", "append newline + text"],
  ["open <filename>", "set active file for printpg"],
  ["edit <filename>", "enter edit mode"],
  ["done", "exit edit mode + save"],
  ["cancel", "exit edit mode without saving"],
  ["preview <filename>", "show rendered table view"],
  ["printpg", "print user/cwd/file/file view"],
  ["entry directory", "start form wizard for current directory"],
  ["complete form", "complete form draft"],
  ["cancelform", "discard draft form"],
  ["answer <q#> <text...>", "answer form question"],
  ["clearanswers", "clear form answers"],
  ["submit", "save completed form submission"],
  ["submissions", "list saved submissions"],
  ["view <id>", "view saved submission"],
  ["adminauth", "unlock admin barrier using usb role"],
  ["logout", "return to login gate"],
  ["clear", "clear terminal display"]
];

/* =========================
   edit mode
========================= */
function handleEditLine(line) {
  const t = lc(line).trim();

  if (t === "done") {
    const file = nodeById(state.edit.fileId);

    if (file && file.type === "file") {
      file.content = state.edit.bufferLines.join("\n");
      saveAll();
      addLine("saved");
    } else {
      addLine("error: file missing");
    }

    state.edit = null;
    return;
  }

  if (t === "cancel") {
    state.edit = null;
    addLine("canceled");
    return;
  }

  if (t.includes("{writetbl}")) {
    state.edit.bufferLines.push("{writetbl}");
    state.edit.inTable = true;
    addLine("(table mode: type rows like: name | age | id. then {endtbl})");
    return;
  }

  if (t.includes("{endtbl}")) {
    state.edit.bufferLines.push("{endtbl}");
    state.edit.inTable = false;
    addLine("(table ended)");
    return;
  }

  state.edit.bufferLines.push(line);
}

/* =========================
   wizard
========================= */
function handleWizardLine(line) {
  const t = lc(line).trim();

  if (state.wizard.mode === "formname") {
    if (!t) {
      addLine("form name?");
      return;
    }

    state.wizard.name = t;
    state.wizard.mode = "questions";
    addLine("add question (or type done)?");
    return;
  }

  if (state.wizard.mode === "questions") {
    if (t === "done") {
      if (state.wizard.questions.length === 0) {
        addLine("error: add at least one question");
        addLine("add question (or type done)?");
        return;
      }

      state.forms.push({
        dirId: state.wizard.dirId,
        status: "draft",
        name: state.wizard.name,
        questions: state.wizard.questions.slice(),
        version: "",
        createdAt: nowIso()
      });

      state.wizard = null;
      saveAll();
      addLine("draft saved. run: complete form");
      return;
    }

    if (!t) {
      addLine("add question (or type done)?");
      return;
    }

    state.wizard.questions.push(t);
    addLine("add question (or type done)?");
  }
}

/* =========================
   core command handler
========================= */
async function handleLine(line) {
  if (state.edit) {
    handleEditLine(line);
    return;
  }

  if (state.wizard) {
    handleWizardLine(line);
    return;
  }

  const { cmd, args } = splitCmd(line);

  if (cmd === "help" || cmd === "commandls") {
    addLine("commands:");
    COMMANDS.forEach(c => addLine(c[0]));
    return;
  }

  if (cmd === "cmmdhelp") {
    addLine("command descriptions:");
    COMMANDS.forEach(([k, d]) => addLine(`${k} : ${d}`));
    return;
  }

  if (cmd === "status") {
    addLine("node authenticated");
    addLine(`role: ${localStorage.getItem("spirenet_role") || "operator"}`);
    addLine(`cwd: ${state.cwdPath}`);
    return;
  }

  if (cmd === "clear") {
    state.transcript = [];
    addLine("cleared");
    return;
  }

  if (cmd === "logout") {
    localStorage.removeItem("spirenet_usb_verified");
    localStorage.removeItem("spirenet_role");
    window.location.href = "index.html";
    return;
  }

  if (cmd === "adminauth") {
    if (localStorage.getItem("spirenet_role") === "admin") {
      state.adminUnlocked = true;
      await saveAll();
      addLine("admin barrier unlocked");
    } else {
      addLine("admin authorization required");
    }
    return;
  }

  if (cmd === "whoami") {
    addLine(state.currentUser || "");
    return;
  }

  if (cmd === "pwd") {
    addLine(state.cwdPath);
    return;
  }

  if (cmd === "ls") {
    const kids = visibleChildrenOf(state.cwdId);
    const dirs = kids.filter(n => n.type === "dir");
    const files = kids.filter(n => n.type === "file");

    if (dirs.length === 0 && files.length === 0) {
      addLine("(empty)");
      return;
    }

    dirs.forEach(d => addLine("dir " + d.name));
    files.forEach(f => addLine("file " + f.name));
    return;
  }

  if (cmd === "cd") {
    if (args.length < 1) {
      addLine("error: missing path");
      return;
    }

    const target = resolvePath(state.cwdId, args[0]);
    if (!target.ok) {
      addLine("error: " + target.err);
      return;
    }

    const n = nodeById(target.id);
    if (!n || n.type !== "dir") {
      addLine("error: not a directory");
      return;
    }

    if (pathOf(n.id) === "/spirenet/admin" && !state.adminUnlocked) {
      addLine("error: admin barrier locked");
      return;
    }

    state.cwdId = n.id;
    state.cwdPath = pathOf(n.id);
    await saveAll();
    addLine(state.cwdPath);
    emitFormInfoIfAny(state.cwdId);
    return;
  }

  if (cmd === "mkdir") {
    if (args.length < 1) {
      addLine("error: missing name");
      return;
    }

    const name = args[0];
    if (!safeName(name)) {
      addLine("error: invalid name (use letters, numbers, dash, underscore)");
      return;
    }

    if (childByName(state.cwdId, name)) {
      addLine("error: already exists");
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
    addLine("ok");
    return;
  }

  if (cmd === "touch") {
    if (args.length < 1) {
      addLine("error: missing filename");
      return;
    }

    const name = args[0];
    if (!safeName(name)) {
      addLine("error: invalid filename (use letters, numbers, dash, underscore)");
      return;
    }

    if (childByName(state.cwdId, name)) {
      addLine("error: already exists");
      return;
    }

    state.nodes.push({
      id: crypto.randomUUID(),
      parentId: state.cwdId,
      name,
      type: "file",
      content: "",
      createdAt: nowIso()
    });

    await saveAll();
    addLine("ok");
    return;
  }

  if (cmd === "rm") {
    if (args.length < 1) {
      addLine("error: missing name");
      return;
    }

    const n = childByName(state.cwdId, args[0]);
    if (!n) {
      addLine("not found");
      return;
    }

    if (n.type === "dir") {
      const kids = childrenOf(n.id);
      if (kids.length > 0) {
        addLine("error: directory not empty");
        return;
      }
    }

    if (state.activeFileId === n.id) {
      state.activeFileId = null;
      state.activeFileName = null;
    }

    state.nodes = state.nodes.filter(x => x.id !== n.id);

    if (n.type === "dir") {
      state.forms = state.forms.filter(f => f.dirId !== n.id);
      state.submissions = state.submissions.filter(s => s.dirId !== n.id);
    }

    await saveAll();
    addLine("ok");
    return;
  }

  if (cmd === "mv") {
    if (args.length < 2) {
      addLine("error: mv <source> <dest>");
      return;
    }

    const srcRes = resolvePath(state.cwdId, args[0]);
    if (!srcRes.ok) {
      addLine("error: " + srcRes.err);
      return;
    }

    const srcNode = nodeById(srcRes.id);
    if (!srcNode || srcNode.id === state.rootId) {
      addLine("error: invalid source");
      return;
    }

    const dstRes = resolvePath(state.cwdId, args[1]);

    if (dstRes.ok) {
      const dstNode = nodeById(dstRes.id);

      if (dstNode && dstNode.type === "dir") {
        if (pathOf(dstNode.id) === "/spirenet/admin" && !state.adminUnlocked) {
          addLine("error: admin barrier locked");
          return;
        }

        if (childByName(dstNode.id, srcNode.name)) {
          addLine("error: name conflict");
          return;
        }

        srcNode.parentId = dstNode.id;
        await saveAll();
        addLine("ok");
        return;
      }
    }

    const dp = normalizePath(args[1]);
    const parts = dp.replace(/^\/spirenet/, "").replace(/^\//, "").split("/").filter(Boolean);

    if (parts.length === 0) {
      addLine("error: invalid dest");
      return;
    }

    const newName = parts[parts.length - 1];
    if (!safeName(newName)) {
      addLine("error: invalid name");
      return;
    }

    const parentPathRaw = parts.slice(0, -1).join("/");
    const parentRes = parentPathRaw ? resolvePath(state.cwdId, parentPathRaw) : { ok: true, id: state.cwdId };

    if (!parentRes.ok) {
      addLine("error: invalid dest path");
      return;
    }

    const parentNode = nodeById(parentRes.id);
    if (!parentNode || parentNode.type !== "dir") {
      addLine("error: invalid dest directory");
      return;
    }

    if (pathOf(parentNode.id) === "/spirenet/admin" && !state.adminUnlocked) {
      addLine("error: admin barrier locked");
      return;
    }

    if (childByName(parentNode.id, newName)) {
      addLine("error: name conflict");
      return;
    }

    srcNode.parentId = parentNode.id;
    srcNode.name = newName;
    await saveAll();
    addLine("ok");
    return;
  }

  if (cmd === "cat") {
    if (args.length < 1) {
      addLine("error: missing filename");
      return;
    }

    const n = childByName(state.cwdId, args[0]);
    if (!n || n.type !== "file") {
      addLine("not found");
      return;
    }

    addLine(n.content || "");
    return;
  }

  if (cmd === "write") {
    if (args.length < 2) {
      addLine("error: write <filename> <text...>");
      return;
    }

    const n = childByName(state.cwdId, args[0]);
    if (!n || n.type !== "file") {
      addLine("not found");
      return;
    }

    n.content = joinRest(args.slice(1));
    await saveAll();
    addLine("ok");
    return;
  }

  if (cmd === "append") {
    if (args.length < 2) {
      addLine("error: append <filename> <text...>");
      return;
    }

    const n = childByName(state.cwdId, args[0]);
    if (!n || n.type !== "file") {
      addLine("not found");
      return;
    }

    const t = joinRest(args.slice(1));
    n.content = (n.content || "") ? (n.content + "\n" + t) : t;
    await saveAll();
    addLine("ok");
    return;
  }

  if (cmd === "open") {
    if (args.length < 1) {
      addLine("error: open <filename>");
      return;
    }

    const n = childByName(state.cwdId, args[0]);
    if (!n || n.type !== "file") {
      addLine("not found");
      return;
    }

    state.activeFileId = n.id;
    state.activeFileName = n.name;
    await saveAll();
    addLine("active file set");
    return;
  }

  if (cmd === "edit") {
    if (args.length < 1) {
      addLine("error: edit <filename>");
      return;
    }

    const name = args[0];
    let n = childByName(state.cwdId, name);

    if (!n) {
      if (!safeName(name)) {
        addLine("error: invalid filename");
        return;
      }

      n = {
        id: crypto.randomUUID(),
        parentId: state.cwdId,
        name,
        type: "file",
        content: "",
        createdAt: nowIso()
      };

      state.nodes.push(n);
      await saveAll();
      addLine("created file");
    }

    if (n.type !== "file") {
      addLine("error: not a file");
      return;
    }

    state.edit = {
      fileId: n.id,
      bufferLines: (n.content || "").split("\n"),
      inTable: false
    };

    state.activeFileId = n.id;
    state.activeFileName = n.name;
    await saveAll();

    addLine(`editing ${n.name}`);
    addLine("type lines. use {writetbl} ... {endtbl} to insert a table.");
    addLine("type done to save, cancel to discard.");
    return;
  }

  if (cmd === "done" || cmd === "cancel") {
    addLine("error: not in edit mode");
    return;
  }

  if (cmd === "preview") {
    if (args.length < 1) {
      addLine("error: preview <filename>");
      return;
    }

    const n = childByName(state.cwdId, args[0]);
    if (!n || n.type !== "file") {
      addLine("not found");
      return;
    }

    addLine("preview:");
    addLine(renderTables(n.content || ""));
    return;
  }

  if (cmd === "printpg") {
    const cwd = state.cwdPath;
    const fileName = state.activeFileName || "(none)";
    let fileView = "";

    if (state.activeFileId) {
      const n = nodeById(state.activeFileId);
      if (n && n.type === "file") fileView = renderTables(n.content || "");
    }

    const printText =
`print page

user: ${state.currentUser || ""}
cwd: ${cwd}
file: ${fileName}

file view:
${fileView}
`;

    const safe = escapeHtml(printText);
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>print</title>
<style>
body{font-family:menlo,monospace;font-size:12px;margin:40px;color:#000;background:#fff;}
pre{white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;font-family:menlo,monospace;font-size:12px;}
</style>
</head><body>
<pre>${safe}</pre>
<script>setTimeout(()=>{window.print()},400)<\/script>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    addLine("print ready");
    return;
  }

  if (cmd === "entry" && args[0] === "directory") {
    if (formForDirCompleted(state.cwdId)) {
      addLine("error: form already completed in this directory");
      return;
    }

    if (formForDirDraft(state.cwdId)) {
      addLine("error: draft already exists. use complete form or cancelform");
      return;
    }

    state.wizard = {
      mode: "formname",
      dirId: state.cwdId,
      name: "",
      questions: []
    };

    addLine("form name?");
    return;
  }

  if (cmd === "complete" && args[0] === "form") {
    const d = formForDirDraft(state.cwdId);

    if (!d) {
      addLine("error: no draft form in this directory");
      return;
    }

    if (!d.name || d.questions.length === 0) {
      addLine("error: draft incomplete");
      return;
    }

    d.status = "completed";
    d.version = versionForForm(d.name, d.questions);
    await saveAll();
    addLine("form completed");
    emitFormInfoIfAny(state.cwdId);
    return;
  }

  if (cmd === "cancelform") {
    const d = formForDirDraft(state.cwdId);

    if (!d) {
      addLine("error: no draft form");
      return;
    }

    state.forms = state.forms.filter(f => !(f.dirId === state.cwdId && f.status === "draft"));
    state.wizard = null;
    await saveAll();
    addLine("draft discarded");
    return;
  }

  if (cmd === "answer") {
    if (args.length < 2) {
      addLine("error: answer <q#> <text...>");
      return;
    }

    const f = formForDirCompleted(state.cwdId);
    if (!f) {
      addLine("error: no completed form in this directory");
      return;
    }

    const qn = parseInt(args[0].replace("q", ""), 10);
    if (!Number.isFinite(qn) || qn < 1 || qn > f.questions.length) {
      addLine("error: invalid question number");
      return;
    }

    state.currentAnswers[qn] = joinRest(args.slice(1));
    addLine(`ok (q${qn})`);
    return;
  }

  if (cmd === "clearanswers") {
    state.currentAnswers = {};
    addLine("ok");
    return;
  }

  if (cmd === "submit") {
    const f = formForDirCompleted(state.cwdId);

    if (!f) {
      addLine("error: no completed form in this directory");
      return;
    }

    for (let i = 1; i <= f.questions.length; i++) {
      if (!state.currentAnswers[i] || state.currentAnswers[i].trim() === "") {
        addLine(`error: missing answer q${i}`);
        return;
      }
    }

    const id = crypto.randomUUID().slice(0, 8);
    const answers = {};

    for (let i = 1; i <= f.questions.length; i++) {
      answers["q" + i] = state.currentAnswers[i];
    }

    state.submissions.push({
      id,
      dirId: state.cwdId,
      formVersion: f.version,
      answers,
      createdAt: nowIso()
    });

    state.currentAnswers = {};
    await saveAll();
    addLine(`saved submission ${id}`);
    return;
  }

  if (cmd === "submissions") {
    const items = state.submissions
      .filter(s => s.dirId === state.cwdId)
      .slice(-20)
      .reverse();

    if (items.length === 0) {
      addLine("(none)");
      return;
    }

    items.forEach(s => addLine(`${s.id} ${s.createdAt}`));
    return;
  }

  if (cmd === "view") {
    if (args.length < 1) {
      addLine("error: view <id>");
      return;
    }

    const s = state.submissions.find(x => x.id === args[0] && x.dirId === state.cwdId);
    if (!s) {
      addLine("not found");
      return;
    }

    const f = formForDirCompleted(state.cwdId);
    const questions = f ? f.questions : [];

    addLine(`submission ${s.id}`);
    questions.forEach((q, i) => {
      addLine(`q${i + 1}: ${q}`);
      addLine(`${s.answers["q" + (i + 1)] ?? ""}`);
    });

    return;
  }

  addLine("unknown command");
}

/* =========================
   boot
========================= */
(async function boot() {
  await loadAll();

  addLine(APP_NAME + " ready");
  addLine(`role: ${localStorage.getItem("spirenet_role") || "operator"}`);
  addLine('type "help" to list commands');
  addLine('type "cmmdhelp" for descriptions');

  if (state.adminUnlocked) {
    addLine("admin barrier unlocked");
  }

  render();
  setTimeout(() => {
    try { input.focus(); } catch (e) {}
  }, 700);
})();
