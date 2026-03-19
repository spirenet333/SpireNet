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
  historyIndex: -1
};

/* =========================
   COMMANDS
   ========================= */

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
    addSystemLine("reboot     - Restart interface");
  },

  clear: () => {
    terminalOutput.innerHTML = "";
  },

  about: () => {
    addSystemLine("SPIRENET V17");
    addSystemLine("Command-driven shell interface.");
  },

  status: () => {
    addSystemLine("SYSTEM STATUS");
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
    if (state.currentPath === "~") {
      addSystemLine("home");
      addSystemLine("logs");
      addSystemLine("sys");
      addSystemLine("vault");
    } else if (state.currentPath === "~/home") {
      addSystemLine("notes");
      addSystemLine("users");
    } else {
      addSystemLine("Directory empty.");
    }
  },

  pwd: () => {
    addSystemLine(state.currentPath);
  },

  reboot: () => {
    runRebootSequence();
  }
};

/* =========================
   OUTPUT HELPERS
   ========================= */

function addLine(text = "", className = "line") {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = text;
  terminalOutput.appendChild(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
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
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

/* =========================
   CORE LOGIC
   ========================= */

function setPrompt() {
  document.getElementById("prompt-label").textContent =
    `${state.user}@${state.host}:${state.currentPath}$`;
}

function parseCommand(rawInput) {
  const input = rawInput.trim();
  if (!input) return;

  const [cmd, ...args] = input.split(" ");
  const command = cmd.toLowerCase();

  if (command === "echo") {
    addSystemLine(args.join(" "));
    return;
  }

  if (command === "cd") {
    handleCd(args);
    return;
  }

  const action = commandMap[command];

  if (action) {
    action(args);
  } else {
    addSystemLine(`Command not found: ${cmd}`);
  }
}

function handleCd(args) {
  const target = args[0];

  if (!target || target === "~") {
    state.currentPath = "~";
  } else if (target === "home") {
    state.currentPath = "~/home";
  } else {
    addSystemLine(`cd: no such file or directory: ${target}`);
    return;
  }

  setPrompt();
}

/* =========================
   BOOT / GATE
   ========================= */

function showLayer(layer) {
  [bootOverlay, usbGate, terminalView].forEach((l) => {
    l.classList.add("hidden");
    l.classList.remove("active");
  });

  layer.classList.remove("hidden");
  layer.classList.add("active");
}

function bootSequence() {
  showLayer(bootOverlay);

  setTimeout(() => {
    showLayer(usbGate);
  }, 1500);
}

function unlockGate() {
  showLayer(terminalView);
  setPrompt();
  terminalOutput.innerHTML = "";

  addSystemLine("SPIRENET V17 SHELL");
  addSystemLine("Authorization accepted.");
  addSystemLine('Type "help" to view commands.');
  addSystemLine("");

  commandInput.focus();
}

function runRebootSequence() {
  state.currentPath = "~";
  setPrompt();
  commandInput.value = "";
  bootSequence();
}

/* =========================
   EVENTS
   ========================= */

usbEnterBtn.addEventListener("click", unlockGate);

terminalForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const input = commandInput.value;

  if (!input.trim()) return;

  // history
  state.history.push(input);
  state.historyIndex = state.history.length;

  addUserLine(input);
  commandInput.value = "";

  // slight delay (realism)
  setTimeout(() => {
    parseCommand(input);
  }, 60);
});

/* =========================
   HISTORY NAVIGATION
   ========================= */

document.addEventListener("keydown", (e) => {
  if (!state.gateUnlocked) return;

  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (state.historyIndex > 0) {
      state.historyIndex--;
      commandInput.value = state.history[state.historyIndex];
    }
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      commandInput.value = state.history[state.historyIndex];
    } else {
      state.historyIndex = state.history.length;
      commandInput.value = "";
    }
  }
});

/* =========================
   CURSOR BLINK (BLOCK FEEL)
   ========================= */

let cursorVisible = true;

setInterval(() => {
  commandInput.style.opacity = cursorVisible ? "1" : "0.85";
  cursorVisible = !cursorVisible;
}, 500);

/* ========================= */

bootSequence();
