const terminalOutput = document.getElementById("terminal-output");
const terminalForm = document.getElementById("terminal-form");
const commandInput = document.getElementById("command-input");
const promptLabel = document.getElementById("prompt-label");

const state = {
  user: "spire",
  host: "v1",
  records: [],
  nextId: 1,
  history: [],
  historyIndex: 0
};

setPrompt();

function setPrompt() {
  promptLabel.textContent = `${state.user}@${state.host}:$`;
}

function addLine(text = "") {
  const line = document.createElement("div");
  line.textContent = text;
  terminalOutput.appendChild(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function addUserLine(text) {
  addLine(`${promptLabel.textContent} ${text}`);
}

/* =========================
   COMMAND PARSER
========================= */

function parseCommand(input) {
  const parts = input.trim().split(" ").filter(Boolean);
  if (!parts.length) return;

  const [cmd, ...args] = parts;

  if (cmd === "help") return cmdHelp();
  if (cmd === "clear") return terminalOutput.innerHTML = "";

  if (cmd === "add") return handleAdd(args);
  if (cmd === "list") return handleList(args);
  if (cmd === "report") return handleReport(args);
  if (cmd === "balance") return handleBalance();

  addLine(`Unknown command: ${cmd}`);
}

/* =========================
   ADD RECORD
========================= */

function handleAdd(args) {
  const type = args[0];

  if (!type) {
    addLine("Usage: add [income|expense] amount category note account [date]");
    return;
  }

  const amount = parseFloat(args[1]);
  const category = args[2];
  const note = args[3] || "";
  const accountIndex = args.indexOf("account");
  const dateIndex = args.indexOf("date");

  if (isNaN(amount)) {
    addLine("Invalid amount");
    return;
  }

  if (!category) {
    addLine("Category required");
    return;
  }

  let account = "default";
  if (accountIndex !== -1) {
    account = args[accountIndex + 1] || "default";
  }

  let date = new Date().toISOString().split("T")[0];
  if (dateIndex !== -1) {
    date = args[dateIndex + 1] || date;
  }

  const record = {
    id: state.nextId++,
    type,
    amount,
    category,
    note,
    account,
    date
  };

  state.records.push(record);

  addLine(`#${record.id} ${type} $${amount} ${category} (${account})`);
}

/* =========================
   LIST
========================= */

function handleList(args) {
  const type = args[0];

  if (!state.records.length) {
    addLine("No records");
    return;
  }

  state.records.forEach(r => {
    if (!type || r.type === type) {
      addLine(
        `#${r.id} ${r.type} $${r.amount} ${r.category} ${r.account} ${r.date}`
      );
    }
  });
}

/* =========================
   REPORTS
========================= */

function handleReport(args) {
  const type = args[0];

  if (type === "summary") {
    let income = 0;
    let expenses = 0;

    state.records.forEach(r => {
      if (r.type === "income") income += r.amount;
      if (r.type === "expense") expenses += r.amount;
    });

    addLine(`Income:   $${income.toFixed(2)}`);
    addLine(`Expenses: $${expenses.toFixed(2)}`);
    addLine(`Profit:   $${(income - expenses).toFixed(2)}`);
    return;
  }

  addLine("Unknown report");
}

/* =========================
   BALANCE
========================= */

function handleBalance() {
  let total = 0;

  state.records.forEach(r => {
    if (r.type === "income") total += r.amount;
    if (r.type === "expense") total -= r.amount;
  });

  addLine(`Balance: $${total.toFixed(2)}`);
}

/* =========================
   INPUT HANDLING
========================= */

terminalForm.addEventListener("submit", e => {
  e.preventDefault();

  const input = commandInput.value;
  if (!input.trim()) return;

  state.history.push(input);
  state.historyIndex = state.history.length;

  addUserLine(input);
  commandInput.value = "";

  parseCommand(input);
});

/* =========================
   HISTORY
========================= */

document.addEventListener("keydown", e => {
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
      commandInput.value = "";
    }
  }
});
