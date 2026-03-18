export function ledger(db, print) {
  let revenue = 0;
  let expenses = 0;

  for (let id in db.invoices) {
    let inv = db.invoices[id];
    if (inv.paid === true) {
      revenue += Number(inv.amount || 0);
    }
  }

  for (let id in db.receipts) {
    let r = db.receipts[id];
    expenses += Number(r.amount || 0);
  }

  let profit = revenue - expenses;

  print(`
ledger report:
revenue: ${revenue}
expenses: ${expenses}
profit: ${profit}
`);
}
