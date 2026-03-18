import { db, saveDB } from "../core/db.js";
import { generateId } from "../core/utils.js";

export function newCustomer(print) {
  let id = generateId();

  db.customers[id] = {
    id,
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: ""
  };

  saveDB();
  print(`customer created: ${id}`);
}

export function setCustomer(args, print) {
  let id = args[0];
  let field = args[1];
  let value = args.slice(2).join(" ");

  if (!db.customers[id]) return print("customer not found");

  db.customers[id][field] = value;
  saveDB();
  print("customer updated");
}

export function viewCustomer(args, print) {
  let c = db.customers[args[0]];
  if (!c) return print("customer not found");

  print(JSON.stringify(c, null, 2));
}
