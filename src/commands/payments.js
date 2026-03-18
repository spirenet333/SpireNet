import { db, saveDB } from "../core/db.js";
import { generateId } from "../core/utils.js";

export function newPayment(print) {
  let id = generateId();

  db.payments[id] = {
    id,
    invoice: "",
    amount: 0
  };

  saveDB();
  print(`payment created: ${id}`);
}

export function setPayment(args, print) {
  let id = args[0];
  let field = args[1];
  let value = args.slice(2).join(" ");

  if (!db.payments[id]) return print("payment not found");

  db.payments[id][field] = value;

  if (field === "invoice") {
    let inv = db.invoices[value];
    if (inv) inv.paid = true;
  }

  saveDB();
  print("payment updated");
}
