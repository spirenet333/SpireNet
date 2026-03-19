// ==============================
// SpireNet v2 - Part 1
// boot + gate + terminal engine
// ==============================

// ----- state -----
const state = {
  authenticated: false,
  role: "guest",
  booted: false,
  transcript: [],
  currentInput: "",
  gateMode: true
};

// ----- dom -----
const terminal = document.getElementById("terminal");
const input = document.getElementById("input");

// ----- render -----
function renderTerminal() {
  if (!terminal) return;
  terminal.textContent = state.transcript.join("\n") + "\n> " + state.currentInput;
  terminal.scrollTop = terminal.scrollHeight;
}

function print(text = "") {
  state.transcript.push(String(text));
  renderTerminal();
}

function clearTerminal() {
  state.transcript = [];
  renderTerminal();
}

// ----- storage -----
function loadSession() {
  try {
    const raw = localStorage.getItem("spirenet_session_v2");
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.authenticated = !!saved.authenticated;
    state.role = saved.role || "guest";
  } catch (err) {
    console.error("session load failed", err);
  }
}

function saveSession() {
  try {
    localStorage.setItem(
      "spirenet_session_v2",
      JSON.stringify({
        authenticated: state.authenticated,
        role: state.role
      })
    );
  } catch (err) {
    console.error("session save failed", err);
  }
}

// ----- gate -----
function showGateScreen() {
  clearTerminal();
  print("spirenet node awaiting key...");
  print("");
  print("select node_key.txt");
}

function unlockGate() {
  state.authenticated = true;
  state.role = "admin";
  state.gateMode = false;
  saveSession();
  startShell();
}

function handleGateInput(value) {
  const v = value.trim().toLowerCase();

  if (!v) return;

  // temporary software gate path for rebuild phase
  if (v === "node_key.txt" || v === "unlock" || v === "admin") {
    unlockGate();
    return;
  }

  print("invalid key");
}

// ----- shell boot -----
function startShell() {
  state.booted = true;
  clearTerminal();
  print("spirenet");
  print("ready");
  print('type "help"');
}

// ----- command stub -----
function handleShellCommand(raw) {
  const input = raw.trim();
  if (!input) return;

  const parts = input.split(" ");
  const cmd = parts[0].toLowerCase();

  if (cmd === "help") {
    print("help");
    print("clear");
    print("status");
    print("whoami");
    return;
  }

  if (cmd === "clear") {
    clearTerminal();
    return;
  }

  if (cmd === "status") {
    print("spirenet ready");
    return;
  }

  if (cmd === "whoami") {
    print(state.role);
    return;
  }

  print("unknown command");
}

// ----- input wiring -----
function focusInput() {
  if (!input) return;
  input.focus();
}

function handleSubmit(value) {
  if (!value.trim()) return;

  print("> " + value);

  if (state.gateMode) {
    handleGateInput(value);
  } else {
    handleShellCommand(value);
  }
}

if (input) {
  input.addEventListener("input", () => {
    state.currentInput = input.value;
    renderTerminal();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const value = input.value;
      input.value = "";
      state.currentInput = "";
      handleSubmit(value);
      renderTerminal();
    }
  });
}

document.addEventListener("click", focusInput);
window.addEventListener("load", () => {
  loadSession();

  if (state.authenticated) {
    state.gateMode = false;
    startShell();
  } else {
    showGateScreen();
  }

  focusInput();
});

// extra focus help for ipad/safari
setInterval(() => {
  if (document.visibilityState === "visible") {
    focusInput();
  }
}, 1200);
