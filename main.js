import { loadDB } from "./src/core/db.js";

import * as customers from "./src/commands/customers.js";
import * as jobs from "./src/commands/jobs.js";
import * as receipts from "./src/commands/receipts.js";
import * as invoices from "./src/commands/invoices.js";
import * as payments from "./src/commands/payments.js";
import * as ledger from "./src/commands/ledger.js";

loadDB();

export function handleCommand(input, print) {
  let parts = input.split(" ");
  let cmd = parts[0];
  let args = parts.slice(1);

  if (cmd === "newcustomer") customers.newCustomer(print);
  else if (cmd === "setcustomer") customers.setCustomer(args, print);
  else if (cmd === "viewcustomer") customers.viewCustomer(args, print);

  else if (cmd === "newjob") jobs.newJob(print);
  else if (cmd === "setjob") jobs.setJob(args, print);
  else if (cmd === "viewjob") jobs.viewJob(args, print);

  else if (cmd === "newreceipt") receipts.newReceipt(print);
  else if (cmd === "setreceipt") receipts.setReceipt(args, print);

  else if (cmd === "newinvoice") invoices.newInvoice(print);
  else if (cmd === "setinvoice") invoices.setInvoice(args, print);

  else if (cmd === "newpayment") payments.newPayment(print);
  else if (cmd === "setpayment") payments.setPayment(args, print);

  else if (cmd === "ledger") ledger.runLedger(print);

  else print("unknown command");
}
