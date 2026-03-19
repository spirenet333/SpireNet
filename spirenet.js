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
  directories: {
    "~": ["home", "logs", "sys", "vault"],
    "~/home": ["notes", "users"],
    "~/logs": ["boot.log", "auth.log"],
    "~/sys": ["kernel", "drivers"],
    "~/vault": ["archive", "sealed"],
    "~/home/notes": [],
    "~/home/users": [],
    "~/sys/kernel": [],
    "~/sys/drivers": [],
    "~/vault/archive": [],
    "~/vault/sealed": []
  }
};

const commandMap = {
  help: () => {
    addSystemLine("Available commands:");
    addSystemLine("help       - Show command list");
    addSystemLine("clear      - Clear terminal output");
    addSystemLine("about      - Show system info");
    addSystemLine("status     - Show link/system status");
    addSystemLine("whoami     - Show active user");
    addSystemLine("version    - Show build version");
    addSystemLine("echo text  - Repeat text");
    addSystemLine("date       - Show local date/time");
    addSystemLine("ls         - List directories");
    addSystemLine("cd [name]  - Change directory");
    addSystemLine("pwd        - Show current path");
    addSystemLine("cat [file] - Read a file");
    addSystemLine("reboot     - Restart interface");
  },

  clear: () => {
    terminalOutput.innerHTML = "";
  },

  about: () => {
    addSystemLine("SPIRENET V17");
    addSystemLine("Command-driven shell interface.");
    addSystemLine("Monochrome terminal profile active.");
  },

  status: () => {
    addSystemLine("SYSTEM STATUS");
    addSystemLine("Boot sequence: COMPLETE");
    addSystemLine("USB gate: AUTHORIZED");
    addSystemLine("Link: STABLE");
    addSystemLine("Shell: ACTIVE");
  },

  whoami: () => {
    addSystemLine(state.user);
  },

  version: () => {
    addSystemLine("SpireNet_V17");
  },

  date: () => {
    addSystemLine(new Date().toString());
  },

  ls: () => {
    const items = state.directories[state.currentPath] || [];
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
  commandInput.value = "";
  setPrompt();
  bootSequence();
}

function isDirectory(path) {
  return Object.prototype.hasOwnProperty.call(state.directories, path);
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

  if (!isDirectory(nextPath)) {
    addSystemLine(`cd: no such file or directory: ${target || ""}`.trim());
    return;
  }

  state.currentPath = nextPath;
  setPrompt();
}

function handleCat(args) {
  const target = (args[0] || "").trim();

  if (!target) {
    addSystemLine("cat: missing file operand");
    return;
  }

  const fileMap = {
    "~/logs/boot.log": [
      "[00] kernel boot initiated",
      "[01] shell frame mounted",
      "[02] authentication layer prepared",
      "[03] interface stable"
    ],
    "~/logs/auth.log": [
      "[AUTH] key handshake accepted",
      "[AUTH] gate status: unlocked",
      "[AUTH] operator session active"
    ]
  };

  let fullPath = "";

  if (state.currentPath === "~") {
    fullPath = `~/${target}`;
  } else {
    fullPath = `${state.currentPath}/${target}`;
  }

  if (!fileMap[fullPath]) {
    addSystemLine(`cat: ${target}: No such file`);
    return;
  }

  fileMap[fullPath].forEach((line) => addSystemLine(line));
}

function parseCommand(rawInput) {
  const input = rawInput.trim();

  if (!input) {
    return;
  }

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

    const value = commandInput.value.trim();
    const tokens = value.split(" ").filter(Boolean);

    if (!tokens.length) return;

    const lastToken = tokens[tokens.length - 1];
    const command = tokens[0].toLowerCase();

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
      "reboot"
    ];

    if (tokens.length === 1) {
      const matches = rootCommands.filter((item) => item.startsWith(lastToken));
      if (matches.length === 1) {
        commandInput.value = matches[0];
        focusCommandInput();
      }
      return;
    }

    if (command === "cd" || command === "cat") {
      const items = state.directories[state.currentPath] || [];
      const matches = items.filter((item) => item.startsWith(lastToken));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = matches[0];
        commandInput.value = tokens.join(" ");
        focusCommandInput();
      }
    }
  }
});

bootSequence();
