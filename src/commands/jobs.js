import { db, saveDB } from "../core/db.js";
import { generateId } from "../core/utils.js";

export function newJob(print) {
  let id = generateId();

  db.jobs[id] = {
    id,
    customer: "",
    status: "scheduled",
    notes: ""
  };

  saveDB();
  print(`job created: ${id}`);
}

export function setJob(args, print) {
  let id = args[0];
  let field = args[1];
  let value = args.slice(2).join(" ");

  if (!db.jobs[id]) return print("job not found");

  db.jobs[id][field] = value;
  saveDB();
  print("job updated");
}

export function viewJob(args, print) {
  let j = db.jobs[args[0]];
  if (!j) return print("job not found");

  print(JSON.stringify(j, null, 2));
}
