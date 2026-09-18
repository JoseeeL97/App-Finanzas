const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "finanzas.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initialize() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      icon TEXT DEFAULT '📁',
      color TEXT DEFAULT '#6366f1',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL CHECK(amount > 0),
      description TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      category_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'danger')),
      is_read INTEGER DEFAULT 0,
      related_category_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (related_category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER UNIQUE NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );
  `);

  const count = db.prepare("SELECT COUNT(*) as c FROM categories").get().c;
  if (count === 0) {
    const insert = db.prepare("INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)");

    const defaultCategories = [
      ["Salario", "income", "💰", "#22c55e"],
      ["Freelance", "income", "💼", "#3b82f6"],
      ["Inversiones", "income", "📈", "#f59e0b"],
      ["Otros ingresos", "income", "💵", "#8b5cf6"],
      ["Alimentación", "expense", "🍔", "#ef4444"],
      ["Vivienda", "expense", "🏠", "#f97316"],
      ["Transporte", "expense", "🚗", "#06b6d4"],
      ["Entretenimiento", "expense", "🎮", "#a855f7"],
      ["Salud", "expense", "💊", "#10b981"],
      ["Educación", "expense", "📚", "#6366f1"],
      ["Ropa", "expense", "👕", "#ec4899"],
      ["Servicios", "expense", "💡", "#eab308"],
      ["Otros gastos", "expense", "📦", "#6b7280"],
    ];

    const insertMany = db.transaction((categories) => {
      for (const cat of categories) {
        insert.run(...cat);
      }
    });

    insertMany(defaultCategories);

    seedSampleData();
  }
}

function seedSampleData() {
  const catMap = {};
  db.prepare("SELECT id, name, type FROM categories")
    .all()
    .forEach((c) => {
      catMap[c.name] = { id: c.id, type: c.type };
    });

  const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

  const incomeTemplates = [
    { cat: "Salario", min: 2500000, max: 3000000 },
    { cat: "Freelance", min: 300000, max: 800000 },
  ];

  const expenseTemplates = [
    { cat: "Alimentación", min: 400000, max: 700000 },
    { cat: "Vivienda", min: 800000, max: 1200000 },
    { cat: "Transporte", min: 150000, max: 350000 },
    { cat: "Entretenimiento", min: 100000, max: 400000 },
    { cat: "Salud", min: 50000, max: 250000 },
    { cat: "Educación", min: 100000, max: 300000 },
    { cat: "Ropa", min: 50000, max: 200000 },
    { cat: "Servicios", min: 200000, max: 450000 },
    { cat: "Otros gastos", min: 50000, max: 150000 },
  ];

  const insertTx = db.prepare(
    "INSERT INTO transactions (amount, description, type, category_id, date) VALUES (?, ?, ?, ?, ?)"
  );

  const seedAll = db.transaction(() => {
    for (const month of months) {
      for (const tmpl of incomeTemplates) {
        const amount = Math.round((tmpl.min + Math.random() * (tmpl.max - tmpl.min)) / 1000) * 1000;
        const day = Math.floor(Math.random() * 28) + 1;
        insertTx.run(
          amount,
          `${tmpl.cat} ${month}`,
          "income",
          catMap[tmpl.cat].id,
          `${month}-${String(day).padStart(2, "0")}`
        );
      }

      const expenseCount = 10 + Math.floor(Math.random() * 10);
      for (let i = 0; i < expenseCount; i++) {
        const tmpl = expenseTemplates[Math.floor(Math.random() * expenseTemplates.length)];
        const amount = Math.round((tmpl.min + Math.random() * (tmpl.max - tmpl.min)) / 1000) * 1000;
        const day = Math.floor(Math.random() * 28) + 1;
        insertTx.run(
          amount,
          `Gasto en ${tmpl.cat.toLowerCase()} - ${month}`,
          "expense",
          catMap[tmpl.cat].id,
          `${month}-${String(day).padStart(2, "0")}`
        );
      }
    }

    const catInversiones = catMap["Inversiones"];
    if (catInversiones) {
      insertTx.run(
        500000,
        "Rendimiento inversión alto riesgo",
        "income",
        catInversiones.id,
        "2026-09-10"
      );
    }
    const catEntretenimiento = catMap["Entretenimiento"];
    if (catEntretenimiento) {
      insertTx.run(
        2500000,
        "Compra consola nueva",
        "expense",
        catEntretenimiento.id,
        "2026-09-05"
      );
    }
  });

  seedAll();
}

module.exports = { db, initialize, DB_PATH, seedSampleData };