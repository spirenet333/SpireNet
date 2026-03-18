export let db = {
  customers: {},
  jobs: {},
  receipts: {},
  invoices: {},
  payments: {}
};

export function saveDB() {
  localStorage.setItem("spirenet_db", JSON.stringify(db));
}

export function loadDB() {
  let data = localStorage.getItem("spirenet_db");
  if (data) {
    Object.assign(db, JSON.parse(data));
  }
}
