import { loadDB } from "./src/core/db.js";

import * as customers from "./src/commands/customers.js";
import * as jobs from "./src/commands/jobs.js";
import * as receipts from "./src/commands/receipts.js";
import * as invoices from "./src/commands/invoices.js";
import * as payments from "./src/commands/payments.js";
import * as ledger from "./src/commands/ledger.js";
import * as expenses from "./src/commands/expenses.js";

loadDB();
// ===== INIT =====

let db = JSON.parse(localStorage.getItem("spirenet_db") || "{}");

if (!db.customers) db.customers = {};
if (!db.jobs) db.jobs = {};
if (!db.receipts) db.receipts = {};
if (!db.invoices) db.invoices = {};
if (!db.payments) db.payments = {};
if (!db.expenses) db.expenses = [];

function saveDB() {
  localStorage.setItem("spirenet_db", JSON.stringify(db));
}

function id() {
  return Math.random().toString(36).substring(2, 9);
}

// ===== UI =====

const terminal = document.getElementById("terminal");
const input = document.getElementById("input");

function print(text) {
  terminal.textContent += text + "\n";
  terminal.scrollTop = terminal.scrollHeight;
}

function clearTerminal() {
  terminal.textContent = "";
}

// ===== FILE SYSTEM =====

let cwd = "/";
let fs = { "/": {} };

function getDir() {
  return fs[cwd];
}

// ===== COMMAND =====

function handleCommand(raw) {
  let input = raw.trim();
  if (!input) return;

  print("> " + input);

  let parts = input.toLowerCase().split(" ");
  let cmd = parts[0];
  let args = parts.slice(1);

  // ===== BASIC =====

  if (cmd === "help") {
    print("type cmdhelp");
  }

  else if (cmd === "cmdhelp") {
    print("system:");
    print("help cmdhelp clear status whoami printpg");

    print("files:");
    print("ls mkdir cd touch cat write append");

    print("business:");
    print("newcustomer setcustomer viewcustomer");
    print("newjob setjob viewjob");
    print("newreceipt setreceipt");
    print("newinvoice setinvoice");
    print("newpayment setpayment");
    print("newexpense setexpense expenses");
    print("ledger");
  }

  else if (cmd === "clear") {
    clearTerminal();
  }

  else if (cmd === "status") {
    print("spirenet ready");
  }

  else if (cmd === "whoami") {
    print("admin");
  }

  // ===== FILE SYSTEM =====

  else if (cmd === "ls") {
    let d = getDir();
    Object.keys(d).forEach(k => {
      if (typeof d[k] === "object") print("dir " + k);
      else print("file " + k);
    });
  }

  else if (cmd === "mkdir") {
    let name = args[0];
    getDir()[name] = {};
    print("dir created");
  }

  else if (cmd === "cd") {
    let name = args[0];
    if (name === "/") cwd = "/";
    else if (fs[cwd][name]) cwd = name;
    print("cwd: " + cwd);
  }

  else if (cmd === "touch") {
    let name = args[0];
    getDir()[name] = "";
    print("file created");
  }

  else if (cmd === "cat") {
    let name = args[0];
    print(getDir()[name] || "");
  }

  else if (cmd === "write") {
    let name = args[0];
    let text = args.slice(1).join(" ");
    getDir()[name] = text;
    print("written");
  }

  else if (cmd === "append") {
    let name = args[0];
    let text = args.slice(1).join(" ");
    getDir()[name] += "\n" + text;
    print("appended");
  }

  // ===== CUSTOMERS =====

  else if (cmd === "newcustomer") {
    let i = id();
    db.customers[i] = { id: i, name: "", phone: "", email: "" };
    saveDB();
    print("customer " + i);
  }

  else if (cmd === "setcustomer") {
    let [i, field, ...v] = args;
    if (!db.customers[i]) return print("not found");
    db.customers[i][field] = v.join(" ");
    saveDB();
    print("updated");
  }

  else if (cmd === "viewcustomer") {
    let c = db.customers[args[0]];
    print(JSON.stringify(c, null, 2));
  }

  // ===== JOBS =====

  else if (cmd === "newjob") {
    let i = id();
    db.jobs[i] = { id: i, customer: "", status: "open" };
    saveDB();
    print("job " + i);
  }

  else if (cmd === "setjob") {
    let [i, field, ...v] = args;
    if (!db.jobs[i]) return print("not found");
    db.jobs[i][field] = v.join(" ");
    saveDB();
    print("updated");
  }

  else if (cmd === "viewjob") {
    print(JSON.stringify(db.jobs[args[0]], null, 2));
  }

  // ===== RECEIPTS =====

  else if (cmd === "newreceipt") {
    let i = id();
    db.receipts[i] = { id: i, amount: 0, category: "" };
    saveDB();
    print("receipt " + i);
  }

  else if (cmd === "setreceipt") {
    let [i, field, ...v] = args;
    if (!db.receipts[i]) return print("not found");
    db.receipts[i][field] = v.join(" ");
    saveDB();
    print("updated");
  }

  // ===== INVOICES =====

  else if (cmd === "newinvoice") {
    let i = id();
    db.invoices[i] = { id: i, amount: 0, paid: false };
    saveDB();
    print("invoice " + i);
  }

  else if (cmd === "setinvoice") {
    let [i, field, ...v] = args;
    if (!db.invoices[i]) return print("not found");

    if (field === "paid") db.invoices[i].paid = v[0] === "true";
    else db.invoices[i][field] = v.join(" ");

    saveDB();
    print("updated");
  }

  // ===== PAYMENTS =====

  else if (cmd === "newpayment") {
    let i = id();
    db.payments[i] = { id: i, invoice: "", amount: 0 };
    saveDB();
    print("payment " + i);
  }

  else if (cmd === "setpayment") {
    let [i, field, ...v] = args;
    if (!db.payments[i]) return print("not found");

    db.payments[i][field] = v.join(" ");

    let inv = db.invoices[v[0]];
    if (inv) inv.paid = true;

    saveDB();
    print("updated");
  }

  // ===== EXPENSES =====

  else if (cmd === "newexpense") {
    let i = id();
    db.expenses.push({ id: i, amount: 0, category: "" });
    saveDB();
    print("expense " + i);
  }

  else if (cmd === "setexpense") {
    let [i, field, ...v] = args;
    let e = db.expenses.find(x => x.id === i);
    if (!e) return print("not found");

    e[field] = v.join(" ");
    saveDB();
    print("updated");
  }

  else if (cmd === "expenses") {
    db.expenses.forEach(e => {
      print(`${e.id} | $${e.amount} | ${e.category}`);
    });
  }

  // ===== LEDGER =====

  else if (cmd === "ledger") {
    let revenue = 0;
    let expenses = 0;

    for (let i in db.invoices) {
      if (db.invoices[i].paid) {
        revenue += Number(db.invoices[i].amount || 0);
      }
    }

    db.expenses.forEach(e => {
      expenses += Number(e.amount || 0);
    });

    print("revenue: " + revenue);
    print("expenses: " + expenses);
    print("profit: " + (revenue - expenses));
  }

  // ===== PRINT =====

  else if (cmd === "printpg") {
    let win = window.open("", "", "width=800,height=600");
    win.document.write(
      "<pre style='font-family:Menlo;font-size:12px'>" +
        terminal.textContent +
        "</pre>"
    );
    win.document.close();
    win.print();
  }

  else {
    print("unknown command");
  }
}

// ===== INPUT FIX =====

input.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    let val = input.value;
    input.value = "";
    handleCommand(val);
  }
});

document.addEventListener("click", () => input.focus());
window.onload = () => input.focus();

// ===== START =====

print("spirenet");
print("ready");
print("type help");
