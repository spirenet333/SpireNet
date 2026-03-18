import { db } from "../core/db.js";

export function runLedger(print) {
  let revenue = 0;
  let expenses = 0;

  for (let id in db.invoices) {
    if (db.invoices[id].paid) {
      revenue += Number(db.invoices[id].amount || 0);
    }
  }

  for (let id in db.receipts) {
    expenses += Number(db.receipts[id].amount || 0);
  }

  print(`
ledger:
revenue: ${revenue}
expenses: ${expenses}
profit: ${revenue - expenses}
`);
}
