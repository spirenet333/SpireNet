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
  host: "v17"
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
    addSystemLine("reboot     - Restart interface");
  },

  clear: () => {
    terminalOutput.innerHTML = "";
  },

  about: () => {
    addSystemLine("SPIRENET V17");
    addSystemLine("Command-driven shell interface.");
    addSystemLine("Boot layer, access gate, and terminal core online.");
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
    if (state.currentPath === "~") {
      addSystemLine("home");
      addSystemLine("logs");
      addSystemLine("sys");
      addSystemLine("vault");
    } else if (state.currentPath === "~/home") {
      addSystemLine("notes");
      addSystemLine("users");
    } else if (state.currentPath === "~/logs") {
      addSystemLine("boot.log");
      addSystemLine("auth.log");
    } else if (state.currentPath === "~/sys") {
      addSystemLine("kernel");
      addSystemLine("drivers");
    } else if (state.currentPath === "~/vault") {
      addSystemLine("archive");
      addSystemLine("sealed");
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

function setPrompt() {
  const promptLabel = document.getElementById("prompt-label");
  promptLabel.textContent = `${state.user}@${state.host}:${state.currentPath}$`;
}

function addLine(text = "", className = "line") {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = text;
  terminalOutput.appendChild(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function addSystemLine(text = "") {
  addLine(text, "line");
}

function addUserLine(text = "") {
  addLine(`${state.user}@${state.host}:${state.currentPath}$ ${text}`, "line");
}

function showLayer(layerToShow) {
  [bootOverlay, usbGate, terminalView].forEach((layer) => {
    layer.classList.add("hidden");
    layer.classList.remove("active");
  });

  layerToShow.classList.remove("hidden");
  layerToShow.classList.add("active");
}

function focusCommandInput() {
  setTimeout(() => {
    commandInput.focus();
    commandInput.setSelectionRange(
      commandInput.value.length,
      commandInput.value.length
    );
  }, 30);
}

function bootSequence() {
  showLayer(bootOverlay);

  setTimeout(() => {
    const bootLine = bootOverlay.querySelector(".boot-line");
    if (bootLine) bootLine.textContent = "Loading authentication layer...";
  }, 900);

  setTimeout(() => {
    state.bootComplete = true;
    showLayer(usbGate);
  }, 1800);
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
  focusCommandInput();
}

function parseCommand(rawInput) {
  const input = rawInput.trim();

  if (!input) {
    addSystemLine("");
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

  const action = commandMap[cmd];

  if (action) {
    action(args);
  } else {
    addSystemLine(`Command not found: ${baseCommand}`);
  }
}

function handleCd(args) {
  const target = (args[0] || "").trim();

  if (!target || target === "~") {
    state.currentPath = "~";
    setPrompt();
    return;
  }

  if (target === "..") {
    if (state.currentPath !== "~") {
      const parts = state.currentPath.split("/");
      parts.pop();
      state.currentPath = parts.length === 1 ? "~" : parts.join("/");
    }
    setPrompt();
    return;
  }

  const allowedFromRoot = ["home", "logs", "sys", "vault"];
  const allowedNested = {
    "~/home": ["notes", "users"],
    "~/logs": [],
    "~/sys": ["kernel", "drivers"],
    "~/vault": ["archive", "sealed"]
  };

  if (state.currentPath === "~") {
    if (allowedFromRoot.includes(target)) {
      state.currentPath = `~/${target}`;
      setPrompt();
    } else {
      addSystemLine(`cd: no such file or directory: ${target}`);
    }
    return;
  }

  const nextAllowed = allowedNested[state.currentPath] || [];
  if (nextAllowed.includes(target)) {
    state.currentPath = `${state.currentPath}/${target}`;
    setPrompt();
  } else {
    addSystemLine(`cd: no such file or directory: ${target}`);
  }
}

function runRebootSequence() {
  state.bootComplete = false;
  state.gateUnlocked = false;
  state.currentPath = "~";
  setPrompt();
  commandInput.value = "";
  showLayer(bootOverlay);

  const bootLine = bootOverlay.querySelector(".boot-line");
  if (bootLine) bootLine.textContent = "Reinitializing shell...";

  setTimeout(() => {
    if (bootLine) bootLine.textContent = "Loading authentication layer...";
  }, 900);

  setTimeout(() => {
    state.bootComplete = true;
    showLayer(usbGate);
  }, 1800);
}

usbEnterBtn.addEventListener("click", () => {
  unlockGate();
});

terminalForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const rawInput = commandInput.value;
  addUserLine(rawInput);
  parseCommand(rawInput);
  commandInput.value = "";
  focusCommandInput();
});

terminalView.addEventListener("click", () => {
  focusCommandInput();
});

document.addEventListener("keydown", (event) => {
  if (!state.gateUnlocked) return;

  const tag = document.activeElement ? document.activeElement.tagName : "";
  if (tag !== "INPUT" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    commandInput.focus();
  }
});

bootSequence();
