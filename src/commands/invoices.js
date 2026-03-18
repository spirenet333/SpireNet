import { db, saveDB } from "../core/db.js";
import { generateId } from "../core/utils.js";

export function newInvoice(print) {
  let id = generateId();

  db.invoices[id] = {
    id,
    customer: "",
    job: "",
    amount: 0,
    paid: false
  };

  saveDB();
  print(`invoice created: ${id}`);
}

export function setInvoice(args, print) {
  let id = args[0];
  let field = args[1];
  let value = args.slice(2).join(" ");

  if (!db.invoices[id]) return print("invoice not found");

  db.invoices[id][field] = value;
  saveDB();
  print("invoice updated");
}
