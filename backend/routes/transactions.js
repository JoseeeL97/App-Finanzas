const express = require("express");
const router = express.Router();
const { db } = require("../database/db");

router.get("/", (req, res) => {
  try {
    const { type, category_id, date_from, date_to, search, limit, offset } = req.query;

    let query = `
      SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      query += " AND t.type = ?";
      params.push(type);
    }
    if (category_id) {
      query += " AND t.category_id = ?";
      params.push(category_id);
    }
    if (date_from) {
      query += " AND t.date >= ?";
      params.push(date_from);
    }
    if (date_to) {
      query += " AND t.date <= ?";
      params.push(date_to);
    }
    if (search) {
      query += " AND t.description LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY t.date DESC, t.id DESC";

    if (limit) {
      query += " LIMIT ?";
      params.push(parseInt(limit));
      if (offset) {
        query += " OFFSET ?";
        params.push(parseInt(offset));
      }
    }

    const transactions = db.prepare(query).all(...params);

    let countQuery = `
      SELECT COUNT(*) as total FROM transactions t WHERE 1=1
    `;
    const countParams = [];

    if (type) {
      countQuery += " AND t.type = ?";
      countParams.push(type);
    }
    if (category_id) {
      countQuery += " AND t.category_id = ?";
      countParams.push(category_id);
    }
    if (date_from) {
      countQuery += " AND t.date >= ?";
      countParams.push(date_from);
    }
    if (date_to) {
      countQuery += " AND t.date <= ?";
      countParams.push(date_to);
    }
    if (search) {
      countQuery += " AND t.description LIKE ?";
      countParams.push(`%${search}%`);
    }

    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({ transactions, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener transacciones" });
  }
});

router.get("/export.csv", (req, res) => {
  try {
    const { type, category_id, date_from, date_to, search } = req.query;

    let query = `
      SELECT t.date, t.description, t.type, t.amount, c.name as category_name
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      query += " AND t.type = ?";
      params.push(type);
    }
    if (category_id) {
      query += " AND t.category_id = ?";
      params.push(category_id);
    }
    if (date_from) {
      query += " AND t.date >= ?";
      params.push(date_from);
    }
    if (date_to) {
      query += " AND t.date <= ?";
      params.push(date_to);
    }
    if (search) {
      query += " AND t.description LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY t.date DESC, t.id DESC";

    const rows = db.prepare(query).all(...params);

    const escapeCsv = (v) => {
      const s = String(v ?? "");
      return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = "Fecha;Descripcion;Tipo;Categoria;Monto";
    const lines = rows.map((r) =>
      [
        r.date,
        escapeCsv(r.description),
        r.type === "income" ? "Ingreso" : "Gasto",
        escapeCsv(r.category_name),
        r.amount.toFixed(0),
      ].join(";")
    );

    const csv = ["\ufeff" + header, ...lines].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=transacciones.csv");
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al generar CSV" });
  }
});

router.get("/:id", (req, res) => {
  try {
    const tx = db
      .prepare(
        `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.id = ?`
      )
      .get(req.params.id);

    if (!tx) return res.status(404).json({ error: "Transacción no encontrada" });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener transacción" });
  }
});

router.post("/", (req, res) => {
  try {
    const { amount, description, type, category_id, date } = req.body;

    if (!amount || !description || !type || !category_id || !date) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    if (amount <= 0) return res.status(400).json({ error: "El monto debe ser mayor a 0" });
    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({ error: "Tipo inválido" });
    }

    const category = db.prepare("SELECT * FROM categories WHERE id = ?").get(category_id);
    if (!category) return res.status(400).json({ error: "Categoría no encontrada" });

    const result = db
      .prepare("INSERT INTO transactions (amount, description, type, category_id, date) VALUES (?, ?, ?, ?, ?)")
      .run(amount, description.trim(), type, category_id, date);

    const newTx = db
      .prepare(
        `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.id = ?`
      )
      .get(result.lastInsertRowid);

    res.status(201).json(newTx);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear transacción" });
  }
});

router.put("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Transacción no encontrada" });

    const { amount, description, type, category_id, date } = req.body;

    if (amount !== undefined && amount <= 0) {
      return res.status(400).json({ error: "El monto debe ser mayor a 0" });
    }
    if (type && !["income", "expense"].includes(type)) {
      return res.status(400).json({ error: "Tipo inválido" });
    }
    if (category_id) {
      const category = db.prepare("SELECT * FROM categories WHERE id = ?").get(category_id);
      if (!category) return res.status(400).json({ error: "Categoría no encontrada" });
    }

    const updated = {
      amount: amount || existing.amount,
      description: description ? description.trim() : existing.description,
      type: type || existing.type,
      category_id: category_id || existing.category_id,
      date: date || existing.date,
    };

    db.prepare("UPDATE transactions SET amount=?, description=?, type=?, category_id=?, date=? WHERE id=?")
      .run(updated.amount, updated.description, updated.type, updated.category_id, updated.date, req.params.id);

    const tx = db
      .prepare(
        `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.id = ?`
      )
      .get(req.params.id);

    res.json(tx);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar transacción" });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Transacción no encontrada" });

    db.prepare("DELETE FROM transactions WHERE id = ?").run(req.params.id);
    res.json({ message: "Transacción eliminada" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar transacción" });
  }
});

module.exports = router;
