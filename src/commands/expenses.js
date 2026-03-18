import { db, saveDB } from "../core/db.js";

export function newExpense(print) {
  const id = Math.random().toString(36).substring(2, 9);

  db.expenses.push({
    id,
    jobId: "",
    amount: 0,
    category: "",
    description: "",
    date: new Date().toISOString()
  });

  saveDB();
  print(`expense created: ${id}`);
}

export function setExpense(args, print) {
  const [id, field, ...valueParts] = args;
  const value = valueParts.join(" ");

  const expense = db.expenses.find(e => e.id === id);
  if (!expense) return print("expense not found");

  if (field === "amount") expense.amount = parseFloat(value);
  else expense[field] = value;

  saveDB();
  print("expense updated");
}

export function listExpenses(print) {
  if (db.expenses.length === 0) return print("(no expenses)");

  db.expenses.forEach(e => {
    print(`${e.id} | $${e.amount} | ${e.category} | job:${e.jobId}`);
  });
}
