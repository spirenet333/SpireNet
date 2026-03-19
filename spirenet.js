const bootOverlay = document.getElementById("boot-overlay");
const usbGate = document.getElementById("usb-gate");
const terminalView = document.getElementById("terminal-view");
const usbEnterBtn = document.getElementById("usb-enter-btn");
const terminalOutput = document.getElementById("terminal-output");
const terminalForm = document.getElementById("terminal-form");
const commandInput = document.getElementById("command-input");

const state = {
  bootComplete: false,
  gateUnlocked: false,
  currentPath: "~",
  user: "spire",
  host: "v17",
  history: [],
  historyIndex: 0,
  deeperUnlocked: false,
  rootGranted: false,
  warningMode: false,
  breachMode: false,
  directories: {
    "~": ["home", "logs", "sys", "vault"],
    "~/home": ["notes", "users"],
    "~/logs": ["boot.log", "auth.log"],
    "~/sys": ["kernel", "drivers"],
    "~/vault": ["archive", "sealed"],
    "~/home/notes": ["welcome.txt"],
    "~/home/users": ["operator.txt"],
    "~/sys/kernel": ["version.txt"],
    "~/sys/drivers": [],
    "~/vault/archive": ["oldmemo.txt"],
    "~/vault/sealed": []
  },
  hiddenDirectories: {
    "~/vault/sealed": ["blacksite", "keys"],
    "~/vault/sealed/blacksite": ["entry.txt", "map.txt", "warning.txt"],
    "~/vault/sealed/keys": ["cipher.key", "root.token"]
  },
  fileMap: {
    "~/logs/boot.log": [
      "[00] kernel boot initiated",
      "[01] shell frame mounted",
      "[02] authentication layer prepared",
      "[03] operator console attached",
      "[04] interface stable"
    ],
    "~/logs/auth.log": [
      "[AUTH] key handshake accepted",
      "[AUTH] gate status: unlocked",
      "[AUTH] operator session active"
    ],
    "~/home/notes/welcome.txt": [
      "Welcome to SpireNet.",
      "Type help to view available commands.",
      "Some areas may require elevated clearance."
    ],
    "~/home/users/operator.txt": [
      "operator: spire",
      "clearance: standard",
      "root: false"
    ],
    "~/sys/kernel/version.txt": [
      "kernel.name=spire.core",
      "kernel.version=17.4.2-shell",
      "profile=monochrome_terminal"
    ],
    "~/vault/archive/oldmemo.txt": [
      "Memo:",
      "Archive remains readable.",
      "Sealed areas require separate authorization."
    ],
    "~/vault/sealed/blacksite/entry.txt": [
      "BLACKSITE ENTRY",
      "This area was sealed after the secondary breach.",
      "Access remains restricted to elevated users."
    ],
    "~/vault/sealed/blacksite/map.txt": [
      "[NORTH] relay",
      "[EAST] storage",
      "[SOUTH] null chamber",
      "[WEST] service descent"
    ],
    "~/vault/sealed/blacksite/warning.txt": [
      "WARNING",
      "Observation latency exceeded acceptable threshold.",
      "Null chamber remains unverified."
    ],
    "~/vault/sealed/keys/cipher.key": [
      "CIPHER KEY",
      "VX-11 / ECHO / 7741",
      "Use decrypt [target] where applicable."
    ],
    "~/vault/sealed/keys/root.token": [
      "ROOT TOKEN",
      "token.id=spire.root.override",
      "status=inactive until grant root"
    ]
  }
};

const rootCommands = [
  "help",
  "clear",
  "about",
  "status",
  "whoami",
  "version",
  "echo",
  "date",
  "ls",
  "cd",
  "pwd",
  "cat",
  "reboot",
  "scan",
  "unlock",
  "grant",
  "decrypt",
  "trace",
  "ping",
  "observe",
  "seal"
];

const commandMap = {
  help: () => {
    addSystemLine("Available commands:");
    addSystemLine("help          - Show command list");
    addSystemLine("clear         - Clear terminal output");
    addSystemLine("about         - Show system info");
    addSystemLine("status        - Show link/system status");
    addSystemLine("whoami        - Show active user");
    addSystemLine("version       - Show build version");
    addSystemLine("echo text     - Repeat text");
    addSystemLine("date          - Show local date/time");
    addSystemLine("ls            - List directories");
    addSystemLine("cd [name]     - Change directory");
    addSystemLine("pwd           - Show current path");
    addSystemLine("cat [file]    - Read a file");
    addSystemLine("scan          - Scan current area");
    addSystemLine("unlock sealed - Reveal sealed structure");
    addSystemLine("grant root    - Request root elevation");
    addSystemLine("decrypt file  - Decrypt supported target");
    addSystemLine("trace node    - Trace current branch");
    addSystemLine("ping relay    - Test a route");
    addSystemLine("observe null  - Probe the null chamber");
    addSystemLine("seal system   - Reseal elevated access");
    addSystemLine("reboot        - Restart interface");
  },

  clear: () => {
    terminalOutput.innerHTML = "";
  },

  about: () => {
    addSystemLine("SPIRENET V17");
    addSystemLine("Command-driven shell interface.");
    addSystemLine("Monochrome terminal profile active.");
    addSystemLine("Deeper system access supported.");
    if (state.warningMode) {
      addSystemLine("Advisory state: elevated.");
    }
    if (state.breachMode) {
      addSystemLine("Null chamber observation state: unstable.");
    }
  },

  status: () => {
    addSystemLine("SYSTEM STATUS");
    addSystemLine("Boot sequence: COMPLETE");
    addSystemLine("USB gate: AUTHORIZED");
    addSystemLine(`Sealed layer: ${state.deeperUnlocked ? "REVEALED" : "HIDDEN"}`);
    addSystemLine(`Root access: ${state.rootGranted ? "GRANTED" : "DENIED"}`);
    addSystemLine(`Warning state: ${state.warningMode ? "ELEVATED" : "NORMAL"}`);
    addSystemLine(`Observation state: ${state.breachMode ? "UNSTABLE" : "DORMANT"}`);
    addSystemLine("Link: STABLE");
    addSystemLine("Shell: ACTIVE");
  },

  whoami: () => {
    addSystemLine(state.rootGranted ? `${state.user} [root]` : state.user);
  },

  version: () => {
    addSystemLine("SpireNet_V17");
  },

  date: () => {
    addSystemLine(new Date().toString());
  },

  ls: () => {
    const items = getVisibleItemsForPath(state.currentPath);
    if (!items.length) {
      addSystemLine("Directory empty.");
      return;
    }
    items.forEach((item) => addSystemLine(item));
  },

  pwd: () => {
    addSystemLine(state.currentPath);
  },

  reboot: () => {
    runRebootSequence();
  },

  scan: () => {
    handleScan();
  }
};

function setPrompt() {
  const promptLabel = document.getElementById("prompt-label");
  promptLabel.textContent = `${state.user}@${state.host}:${state.currentPath}$`;
}

function focusCommandInput() {
  setTimeout(() => {
    commandInput.focus();
    const len = commandInput.value.length;
    commandInput.setSelectionRange(len, len);
  }, 20);
}

function scrollTerminalToBottom() {
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function addLine(text = "", className = "line") {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = text;
  terminalOutput.appendChild(line);
  scrollTerminalToBottom();
}

function addSystemLine(text = "") {
  addLine(text, "line system");
}

function addAlertLine(text = "") {
  addLine(text, "line system");
}

function addUserLine(text = "") {
  const line = document.createElement("div");
  line.className = "line user";

  const prompt = document.createElement("span");
  prompt.className = "prompt-dim";
  prompt.textContent = `${state.user}@${state.host}:${state.currentPath}$ `;

  const command = document.createElement("span");
  command.textContent = text;

  line.appendChild(prompt);
  line.appendChild(command);
  terminalOutput.appendChild(line);
  scrollTerminalToBottom();
}

function showLayer(layerToShow) {
  [bootOverlay, usbGate, terminalView].forEach((layer) => {
    layer.classList.add("hidden");
    layer.classList.remove("active");
  });

  layerToShow.classList.remove("hidden");
  layerToShow.classList.add("active");
}

function bootSequence() {
  state.bootComplete = false;
  state.gateUnlocked = false;
  showLayer(bootOverlay);

  const bootLine = bootOverlay.querySelector(".boot-line");
  if (bootLine) {
    bootLine.textContent = "Initializing shell...";
  }

  setTimeout(() => {
    if (bootLine) {
      bootLine.textContent = "Loading authentication layer...";
    }
  }, 700);

  setTimeout(() => {
    state.bootComplete = true;
    showLayer(usbGate);
  }, 1500);
}

function unlockGate() {
  state.gateUnlocked = true;
  showLayer(terminalView);
  setPrompt();
  terminalOutput.innerHTML = "";
  addSystemLine("SPIRENET V17 SHELL");
  addSystemLine("Authorization accepted.");
  addSystemLine('Type "help" to view commands.');
  addSystemLine("");
  commandInput.value = "";
  focusCommandInput();
}

function runRebootSequence() {
  state.currentPath = "~";
  state.historyIndex = state.history.length;
  state.deeperUnlocked = false;
  state.rootGranted = false;
  state.warningMode = false;
  state.breachMode = false;
  commandInput.value = "";
  setPrompt();
  syncVisualState();
  bootSequence();
}

function syncVisualState() {
  if (state.breachMode) {
    document.body.classList.add("breach-mode");
    document.body.classList.remove("warning-mode");
    return;
  }

  if (state.warningMode) {
    document.body.classList.add("warning-mode");
    document.body.classList.remove("breach-mode");
    return;
  }

  document.body.classList.remove("warning-mode");
  document.body.classList.remove("breach-mode");
}

function queueWarningSequence(lines, delay = 120) {
  lines.forEach((line, index) => {
    setTimeout(() => {
      addAlertLine(line);
      focusCommandInput();
    }, delay * (index + 1));
  });
}

function enterWarningMode() {
  if (state.warningMode) return;
  state.warningMode = true;
  syncVisualState();
  queueWarningSequence([
    "NOTICE: elevated clearance changed local system posture",
    "NOTICE: passive audit enabled",
    "NOTICE: sealed branch telemetry now visible"
  ]);
}

function enterBreachMode() {
  if (state.breachMode) return;
  state.breachMode = true;
  state.warningMode = true;
  syncVisualState();
  queueWarningSequence([
    "WARNING: null chamber observation initiated",
    "WARNING: response latency irregular",
    "WARNING: passive monitor unable to verify chamber state"
  ]);
}

function pathExists(path) {
  return (
    Object.prototype.hasOwnProperty.call(state.directories, path) ||
    (state.deeperUnlocked &&
      Object.prototype.hasOwnProperty.call(state.hiddenDirectories, path))
  );
}

function getVisibleItemsForPath(path) {
  const baseItems = state.directories[path] ? [...state.directories[path]] : [];
  const hiddenItems =
    state.deeperUnlocked && state.hiddenDirectories[path]
      ? [...state.hiddenDirectories[path]]
      : [];

  return [...baseItems, ...hiddenItems];
}

function isDirectoryTarget(path) {
  return pathExists(path);
}

function resolveCdTarget(target) {
  if (!target || target === "~") return "~";

  if (target === "..") {
    if (state.currentPath === "~") return "~";
    const parts = state.currentPath.split("/");
    parts.pop();
    return parts.length === 1 ? "~" : parts.join("/");
  }

  if (target.startsWith("~/")) {
    return target;
  }

  if (state.currentPath === "~") {
    return `~/${target}`;
  }

  return `${state.currentPath}/${target}`;
}

function handleCd(args) {
  const target = (args[0] || "").trim();
  const nextPath = resolveCdTarget(target);

  if (!isDirectoryTarget(nextPath)) {
    addSystemLine(`cd: no such file or directory: ${target || ""}`.trim());
    return;
  }

  state.currentPath = nextPath;
  setPrompt();

  if (state.rootGranted && nextPath === "~/vault/sealed/blacksite" && !state.warningMode) {
    enterWarningMode();
  }
}

function handleCat(args) {
  const target = (args[0] || "").trim();

  if (!target) {
    addSystemLine("cat: missing file operand");
    return;
  }

  let fullPath = "";
  if (target.startsWith("~/")) {
    fullPath = target;
  } else if (state.currentPath === "~") {
    fullPath = `~/${target}`;
  } else {
    fullPath = `${state.currentPath}/${target}`;
  }

  if (!state.fileMap[fullPath]) {
    addSystemLine(`cat: ${target}: No such file`);
    return;
  }

  if (fullPath.includes("/sealed/") && !state.deeperUnlocked) {
    addSystemLine("cat: access denied");
    return;
  }

  if (fullPath.endsWith("root.token") && !state.rootGranted) {
    addSystemLine("cat: root elevation required");
    return;
  }

  state.fileMap[fullPath].forEach((line) => addSystemLine(line));

  if (fullPath.endsWith("warning.txt")) {
    enterWarningMode();
  }
}

function handleScan() {
  addSystemLine(`Scanning ${state.currentPath} ...`);

  if (state.currentPath === "~") {
    addSystemLine("4 visible nodes detected.");
    addSystemLine(state.deeperUnlocked ? "1 hidden branch previously revealed." : "No hidden branches visible.");
    return;
  }

  if (state.currentPath === "~/vault") {
    addSystemLine("Archive integrity: stable.");
    addSystemLine(state.deeperUnlocked ? "Sealed branch signature: visible." : "Residual sealed signature detected.");
    return;
  }

  if (state.currentPath === "~/vault/sealed") {
    addSystemLine("Sealed layer open.");
    addSystemLine("2 restricted branches detected.");
    return;
  }

  if (state.currentPath === "~/vault/sealed/keys") {
    addSystemLine("Key material detected.");
    addSystemLine(state.rootGranted ? "Root token readable." : "Root token locked.");
    return;
  }

  if (state.currentPath === "~/vault/sealed/blacksite") {
    addSystemLine("Blacksite topology unresolved.");
    addSystemLine(state.breachMode ? "Null chamber telemetry unstable." : "Null chamber telemetry dormant.");
    return;
  }

  addSystemLine("No anomaly detected.");
}

function handleUnlock(args) {
  const target = (args[0] || "").trim().toLowerCase();

  if (!target) {
    addSystemLine("unlock: missing target");
    return;
  }

  if (target !== "sealed") {
    addSystemLine(`unlock: unsupported target: ${target}`);
    return;
  }

  if (state.currentPath !== "~/vault") {
    addSystemLine("unlock: sealed target only available from ~/vault");
    return;
  }

  if (state.deeperUnlocked) {
    addSystemLine("sealed structure already revealed");
    return;
  }

  state.deeperUnlocked = true;
  addSystemLine("sealed structure revealed");
  addSystemLine("new branch available: sealed");
}

function handleGrant(args) {
  const target = (args[0] || "").trim().toLowerCase();

  if (!target) {
    addSystemLine("grant: missing target");
    return;
  }

  if (target !== "root") {
    addSystemLine(`grant: unsupported target: ${target}`);
    return;
  }

  if (state.currentPath !== "~/vault/sealed/keys") {
    addSystemLine("grant: root request only available from ~/vault/sealed/keys");
    return;
  }

  if (!state.deeperUnlocked) {
    addSystemLine("grant: sealed layer not available");
    return;
  }

  if (state.rootGranted) {
    addSystemLine("root already granted");
    return;
  }

  state.rootGranted = true;
  addSystemLine("root elevation granted");
  addSystemLine("sensitive tokens unlocked");
  enterWarningMode();
}

function handleDecrypt(args) {
  const target = (args[0] || "").trim();

  if (!target) {
    addSystemLine("decrypt: missing target");
    return;
  }

  if (target !== "root.token") {
    addSystemLine(`decrypt: unsupported target: ${target}`);
    return;
  }

  if (state.currentPath !== "~/vault/sealed/keys") {
    addSystemLine("decrypt: target only available from ~/vault/sealed/keys");
    return;
  }

  if (!state.rootGranted) {
    addSystemLine("decrypt: root elevation required");
    return;
  }

  addSystemLine("decrypting root.token ...");
  addSystemLine("token.signature = SPN-ROOT-77");
  addSystemLine("override.window = open");
  addSystemLine("clearance.profile = elevated");
}

function handleTrace(args) {
  const target = (args[0] || "").trim().toLowerCase();

  if (!target) {
    addSystemLine("trace: missing target");
    return;
  }

  if (target !== "node") {
    addSystemLine(`trace: unsupported target: ${target}`);
    return;
  }

  addSystemLine(`Tracing from ${state.currentPath} ...`);

  if (state.currentPath === "~/vault/sealed/blacksite") {
    addSystemLine("trace.path = blacksite > relay > null chamber");
    addSystemLine("trace.integrity = partial");
    addSystemLine("trace.loss = 18%");
    return;
  }

  addSystemLine("trace complete");
  addSystemLine("no unresolved divergence detected");
}

function handlePing(args) {
  const target = (args[0] || "").trim().toLowerCase();

  if (!target) {
    addSystemLine("ping: missing target");
    return;
  }

  if (target !== "relay") {
    addSystemLine(`ping: unsupported target: ${target}`);
    return;
  }

  if (state.currentPath !== "~/vault/sealed/blacksite") {
    addSystemLine("ping: relay target only available from ~/vault/sealed/blacksite");
    return;
  }

  addSystemLine("PING relay ...");
  addSystemLine("reply 1 time=11ms");
  addSystemLine("reply 2 time=12ms");
  addSystemLine(state.breachMode ? "reply 3 time=timeout" : "reply 3 time=10ms");
}

function handleObserve(args) {
  const target = (args[0] || "").trim().toLowerCase();

  if (!target) {
    addSystemLine("observe: missing target");
    return;
  }

  if (target !== "null") {
    addSystemLine(`observe: unsupported target: ${target}`);
    return;
  }

  if (state.currentPath !== "~/vault/sealed/blacksite") {
    addSystemLine("observe: null target only available from ~/vault/sealed/blacksite");
    return;
  }

  if (!state.rootGranted) {
    addSystemLine("observe: root elevation required");
    return;
  }

  addSystemLine("observing null chamber ...");
  addSystemLine("frame 01 acquired");
  addSystemLine("frame 02 acquired");
  addSystemLine("frame 03 inconsistent");
  enterBreachMode();
}

function handleSeal(args) {
  const target = (args[0] || "").trim().toLowerCase();

  if (!target) {
    addSystemLine("seal: missing target");
    return;
  }

  if (target !== "system") {
    addSystemLine(`seal: unsupported target: ${target}`);
    return;
  }

  state.currentPath = "~";
  state.deeperUnlocked = false;
  state.rootGranted = false;
  state.warningMode = false;
  state.breachMode = false;
  setPrompt();
  syncVisualState();
  addSystemLine("system resealed");
  addSystemLine("elevated branches hidden");
  addSystemLine("root access revoked");
}

function parseCommand(rawInput) {
  const input = rawInput.trim();
  if (!input) return;

  const [baseCommand, ...args] = input.split(" ");
  const cmd = baseCommand.toLowerCase();

  if (cmd === "echo") {
    addSystemLine(args.join(" "));
    return;
  }

  if (cmd === "cd") {
    handleCd(args);
    return;
  }

  if (cmd === "cat") {
    handleCat(args);
    return;
  }

  if (cmd === "unlock") {
    handleUnlock(args);
    return;
  }

  if (cmd === "grant") {
    handleGrant(args);
    return;
  }

  if (cmd === "decrypt") {
    handleDecrypt(args);
    return;
  }

  if (cmd === "trace") {
    handleTrace(args);
    return;
  }

  if (cmd === "ping") {
    handlePing(args);
    return;
  }

  if (cmd === "observe") {
    handleObserve(args);
    return;
  }

  if (cmd === "seal") {
    handleSeal(args);
    return;
  }

  const action = commandMap[cmd];

  if (action) {
    action(args);
  } else {
    addSystemLine(`Command not found: ${baseCommand}`);
  }
}

function runCommandWithDelay(rawInput) {
  setTimeout(() => {
    parseCommand(rawInput);
    focusCommandInput();
  }, 60);
}

usbEnterBtn.addEventListener("click", () => {
  unlockGate();
});

terminalForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!state.gateUnlocked) return;

  const rawInput = commandInput.value;

  if (!rawInput.trim()) {
    commandInput.value = "";
    focusCommandInput();
    return;
  }

  state.history.push(rawInput);
  state.historyIndex = state.history.length;

  addUserLine(rawInput);
  commandInput.value = "";
  runCommandWithDelay(rawInput);
});

terminalView.addEventListener("click", () => {
  focusCommandInput();
});

document.addEventListener("keydown", (event) => {
  if (!state.gateUnlocked) return;

  const isTypingKey =
    event.key.length === 1 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey;

  if (document.activeElement !== commandInput && isTypingKey) {
    focusCommandInput();
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();

    if (!state.history.length) return;

    if (state.historyIndex > 0) {
      state.historyIndex--;
    } else {
      state.historyIndex = 0;
    }

    commandInput.value = state.history[state.historyIndex] || "";
    focusCommandInput();
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();

    if (!state.history.length) return;

    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      commandInput.value = state.history[state.historyIndex] || "";
    } else {
      state.historyIndex = state.history.length;
      commandInput.value = "";
    }

    focusCommandInput();
  }

  if (event.key === "Tab") {
    event.preventDefault();

    const raw = commandInput.value;
    const tokens = raw.split(" ").filter(Boolean);

    if (!tokens.length) return;

    if (tokens.length === 1) {
      const partial = tokens[0].toLowerCase();
      const matches = rootCommands.filter((item) => item.startsWith(partial));
      if (matches.length === 1) {
        commandInput.value = matches[0];
        focusCommandInput();
      }
      return;
    }

    const command = tokens[0].toLowerCase();
    const partial = tokens[tokens.length - 1];
    const items = getVisibleItemsForPath(state.currentPath);

    if (command === "cd" || command === "cat") {
      const matches = items.filter((item) => item.startsWith(partial));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = matches[0];
        commandInput.value = tokens.join(" ");
        focusCommandInput();
      }
      return;
    }

    if (command === "unlock") {
      const matches = ["sealed"].filter((item) => item.startsWith(partial));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = matches[0];
        commandInput.value = tokens.join(" ");
        focusCommandInput();
      }
      return;
    }

    if (command === "grant") {
      const matches = ["root"].filter((item) => item.startsWith(partial));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = matches[0];
        commandInput.value = tokens.join(" ");
        focusCommandInput();
      }
      return;
    }

    if (command === "decrypt") {
      const matches = ["root.token"].filter((item) => item.startsWith(partial));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = matches[0];
        commandInput.value = tokens.join(" ");
        focusCommandInput();
      }
      return;
    }

    if (command === "trace") {
      const matches = ["node"].filter((item) => item.startsWith(partial));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = matches[0];
        commandInput.value = tokens.join(" ");
        focusCommandInput();
      }
      return;
    }

    if (command === "ping") {
      const matches = ["relay"].filter((item) => item.startsWith(partial));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = matches[0];
        commandInput.value = tokens.join(" ");
        focusCommandInput();
      }
      return;
    }

    if (command === "observe") {
      const matches = ["null"].filter((item) => item.startsWith(partial));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = matches[0];
        commandInput.value = tokens.join(" ");
        focusCommandInput();
      }
      return;
    }

    if (command === "seal") {
      const matches = ["system"].filter((item) => item.startsWith(partial));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = matches[0];
        commandInput.value = tokens.join(" ");
        focusCommandInput();
      }
    }
  }
});

syncVisualState();
bootSequence();
