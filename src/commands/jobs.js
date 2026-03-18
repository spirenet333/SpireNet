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
export function jobProfit(args, print) {
  const jobId = args[0];

  if (!jobId) return print("missing job id");

  const invoices = db.invoices.filter(i => i.jobId === jobId);
  const expenses = db.expenses.filter(e => e.jobId === jobId);

  let revenue = invoices.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  let cost = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  let profit = revenue - cost;
  let margin = revenue ? ((profit / revenue) * 100).toFixed(1) : 0;

  print("job: " + jobId);
  print("revenue: $" + revenue);
  print("expenses: $" + cost);
  print("profit: $" + profit);
  print("margin: " + margin + "%");
}
