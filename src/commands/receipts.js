import { db, saveDB } from "../core/db.js";
import { generateId } from "../core/utils.js";

export function newReceipt(print) {
  let id = generateId();

  db.receipts[id] = {
    id,
    vendor: "",
    amount: 0,
    job: "",
    category: ""
  };

  saveDB();
  print(`receipt created: ${id}`);
}

export function setReceipt(args, print) {
  let id = args[0];
  let field = args[1];
  let value = args.slice(2).join(" ");

  if (!db.receipts[id]) return print("receipt not found");

  db.receipts[id][field] = value;
  saveDB();
  print("receipt updated");
}
