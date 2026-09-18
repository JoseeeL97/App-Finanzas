const express = require("express");
const router = express.Router();
const { db } = require("../database/db");

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

router.get("/", (req, res) => {
  try {
    const month = req.query.month || currentMonth();

    const budgets = db
      .prepare(
        `SELECT b.id, b.category_id, b.amount,
                c.name as category_name, c.icon, c.color
         FROM budgets b
         JOIN categories c ON b.category_id = c.id
         ORDER BY c.name`
      )
      .all();

    const spentStmt = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as spent FROM transactions
       WHERE category_id = ? AND type = 'expense' AND strftime('%Y-%m', date) = ?`
    );

    const result = budgets.map((b) => {
      const spent = spentStmt.get(b.category_id, month).spent;
      const remaining = b.amount - spent;
      const percentage = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
      const status = spent > b.amount ? "exceeded" : percentage >= 80 ? "warning" : "ok";
      return { ...b, spent, remaining, percentage, status };
    });

    res.json({ month, budgets: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener presupuestos" });
  }
});

router.post("/", (req, res) => {
  try {
    const { category_id, amount } = req.body;

    if (!category_id || !amount) {
      return res.status(400).json({ error: "Categoría y monto son obligatorios" });
    }
    if (amount <= 0) return res.status(400).json({ error: "El monto debe ser mayor a 0" });

    const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(category_id);
    if (!cat) return res.status(400).json({ error: "Categoría no encontrada" });
    if (cat.type !== "expense") {
      return res.status(400).json({ error: "Solo se pueden presupuestar categorías de gasto" });
    }

    const existing = db.prepare("SELECT * FROM budgets WHERE category_id = ?").get(category_id);
    if (existing) {
      db.prepare("UPDATE budgets SET amount = ? WHERE category_id = ?").run(amount, category_id);
      const b = db.prepare("SELECT * FROM budgets WHERE category_id = ?").get(category_id);
      return res.json(b);
    }

    const result = db
      .prepare("INSERT INTO budgets (category_id, amount) VALUES (?, ?)")
      .run(category_id, amount);

    const b = db.prepare("SELECT * FROM budgets WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(b);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear presupuesto" });
  }
});

router.put("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM budgets WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Presupuesto no encontrado" });

    const { category_id, amount } = req.body;
    if (amount !== undefined && amount <= 0) {
      return res.status(400).json({ error: "El monto debe ser mayor a 0" });
    }
    if (category_id) {
      const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(category_id);
      if (!cat) return res.status(400).json({ error: "Categoría no encontrada" });
      if (cat.type !== "expense") {
        return res.status(400).json({ error: "Solo se pueden presupuestar categorías de gasto" });
      }
    }

    const updated = {
      category_id: category_id || existing.category_id,
      amount: amount || existing.amount,
    };

    db.prepare("UPDATE budgets SET category_id = ?, amount = ? WHERE id = ?")
      .run(updated.category_id, updated.amount, req.params.id);

    const b = db.prepare("SELECT * FROM budgets WHERE id = ?").get(req.params.id);
    res.json(b);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar presupuesto" });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM budgets WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Presupuesto no encontrado" });

    db.prepare("DELETE FROM budgets WHERE id = ?").run(req.params.id);
    res.json({ message: "Presupuesto eliminado" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar presupuesto" });
  }
});

module.exports = router;