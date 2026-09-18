const { test, before, after } = require("node:test");
const assert = require("node:assert");
const os = require("os");
const path = require("path");
const fs = require("fs");

const testDbPath = path.join(os.tmpdir(), `finanzas-test-${Date.now()}.db`);
process.env.DB_PATH = testDbPath;

const { createApp } = require("../server.js");
const { initialize } = require("../database/db");

let server;
let baseUrl;

before(async () => {
  initialize();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
  for (const f of [testDbPath, testDbPath + "-wal", testDbPath + "-shm"]) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {}
  }
});

async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(baseUrl + url, opts);
  const data = await res.json();
  return { status: res.status, data };
}

test("devuelve las categorías por defecto", async () => {
  const { status, data } = await request("GET", "/api/categories");
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(data));
  assert.ok(data.length >= 9);
});

test("crea, actualiza y elimina una transacción", async () => {
  const created = await request("POST", "/api/transactions", {
    amount: 150000,
    description: "Test transacción",
    type: "expense",
    category_id: 5,
    date: "2026-09-15",
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.data.description, "Test transacción");
  const id = created.data.id;

  const updated = await request("PUT", `/api/transactions/${id}`, {
    amount: 160000,
    description: "Test editado",
  });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.data.amount, 160000);

  const deleted = await request("DELETE", `/api/transactions/${id}`);
  assert.strictEqual(deleted.status, 200);
});

test("valida transacción sin campos obligatorios", async () => {
  const res = await request("POST", "/api/transactions", { amount: 1000 });
  assert.strictEqual(res.status, 400);
});

test("filtra transacciones por tipo", async () => {
  const res = await request("GET", "/api/transactions?type=income&limit=5");
  assert.strictEqual(res.status, 200);
  assert.ok(res.data.transactions.every((t) => t.type === "income"));
});

test("resumen del dashboard", async () => {
  const res = await request("GET", "/api/dashboard/summary");
  assert.strictEqual(res.status, 200);
  assert.ok(res.data.totalIncome >= 0);
  assert.ok(res.data.totalExpenses >= 0);
  assert.ok(typeof res.data.savingsRate === "number");
});

test("desglose por categoría", async () => {
  const { status, data } = await request("GET", "/api/dashboard/category-breakdown");
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(data.categories));
  assert.ok(typeof data.grandTotal === "number");
});

test("tendencia y proyección", async () => {
  const { data } = await request("GET", "/api/dashboard/trend");
  assert.ok(data.months.length >= 1);

  const proj = await request("GET", "/api/dashboard/projection");
  assert.strictEqual(proj.status, 200);
  assert.ok(proj.data.projectedExpenses >= 0);
  assert.ok(proj.data.projectedIncome >= 0);
  assert.ok(Array.isArray(proj.data.categoryProjections));
});

test("alertas se generan correctamente", async () => {
  const res = await request("GET", "/api/dashboard/alerts");
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.data));
});

test("insights del dashboard", async () => {
  const res = await request("GET", "/api/dashboard/insights");
  assert.strictEqual(res.status, 200);
  assert.ok(res.data.topCategory === null || res.data.topCategory.total > 0);
  assert.ok(typeof res.data.avgDailyExpense === "number");
  assert.ok(typeof res.data.projectedMonthlyExpense === "number");
  assert.ok(typeof res.data.vsLastMonth.expensesChange === "number");
  assert.ok(typeof res.data.vsLastMonth.incomeChange === "number");
});

test("gestión de presupuestos", async () => {
  const cats = await request("GET", "/api/categories?type=expense");
  const cat = cats.data[0];

  const created = await request("POST", "/api/budgets", {
    category_id: cat.id,
    amount: 400000,
  });
  assert.strictEqual(created.status, 201);
  const id = created.data.id;

  const list = await request("GET", "/api/budgets?month=2026-09");
  assert.strictEqual(list.status, 200);
  assert.ok(Array.isArray(list.data.budgets));
  assert.ok(list.data.budgets.some((b) => b.id === id));
  assert.ok(typeof list.data.budgets[0].spent === "number");
  assert.ok(typeof list.data.budgets[0].status === "string");

  const updated = await request("PUT", `/api/budgets/${id}`, { amount: 500000 });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.data.amount, 500000);

  const deleted = await request("DELETE", `/api/budgets/${id}`);
  assert.strictEqual(deleted.status, 200);
});

test("valida presupuesto con categoría de ingreso", async () => {
  const cats = await request("GET", "/api/categories?type=income");
  const cat = cats.data[0];

  const res = await request("POST", "/api/budgets", {
    category_id: cat.id,
    amount: 100000,
  });
  assert.strictEqual(res.status, 400);
});

test("exporta transacciones a CSV", async () => {
  const res = await fetch(baseUrl + "/api/transactions/export.csv");
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes("Fecha"));
  assert.ok(text.includes("Monto"));
  assert.ok(text.includes(";"));
});