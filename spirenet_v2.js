const state = {
  transcript: [],
  currentInput: "",
  authenticated: false,
  role: "guest"
};

const terminal = document.getElementById("terminal");
const input = document.getElementById("input");

function render() {
  const lines = [...state.transcript, "> " + state.currentInput];
  terminal.textContent = lines.join("\n");
  window.scrollTo(0, document.body.scrollHeight);
}

function print(text = "") {
  state.transcript.push(String(text));
  render();
}

function clearTerminal() {
  state.transcript = [];
  render();
}

function focusInput() {
  input.focus();
}

function bootGate() {
  clearTerminal();
  print("spirenet node awaiting key...");
  print("");
  print("select node_key.txt");
}

function bootShell() {
  clearTerminal();
  print("spirenet");
  print("ready");
  print('type "help"');
}

function handleGateCommand(cmd) {
  const v = cmd.trim().toLowerCase();

  if (v === "unlock" || v === "node_key.txt" || v === "admin") {
    state.authenticated = true;
    state.role = "admin";
    bootShell();
    return;
  }

  print("> " + cmd);
  print("invalid key");
}

function handleShellCommand(raw) {
  const inputText = raw.trim();
  if (!inputText) {
    render();
    return;
  }

  print("> " + inputText);

  const parts = inputText.split(" ");
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

input.addEventListener("input", () => {
  state.currentInput = input.value;
  render();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const submitted = input.value;
    input.value = "";
    state.currentInput = "";

    if (!state.authenticated) handleGateCommand(submitted);
    else handleShellCommand(submitted);

    render();
  }
});

document.addEventListener("click", focusInput);
window.addEventListener("load", () => {
  bootGate();
  focusInput();
});
