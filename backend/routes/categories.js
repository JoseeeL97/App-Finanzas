const express = require("express");
const router = express.Router();
const { db } = require("../database/db");

router.get("/", (req, res) => {
  try {
    const { type } = req.query;
    let query = "SELECT * FROM categories";
    const params = [];

    if (type) {
      query += " WHERE type = ?";
      params.push(type);
    }

    query += " ORDER BY type, name";
    const categories = db.prepare(query).all(...params);

    const withCounts = categories.map((cat) => {
      const { count } = db
        .prepare("SELECT COUNT(*) as count FROM transactions WHERE category_id = ?")
        .get(cat.id);
      return { ...cat, transaction_count: count };
    });

    res.json(withCounts);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener categorías" });
  }
});

router.get("/:id", (req, res) => {
  try {
    const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
    if (!cat) return res.status(404).json({ error: "Categoría no encontrada" });
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener categoría" });
  }
});

router.post("/", (req, res) => {
  try {
    const { name, type, icon, color } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "Nombre y tipo son obligatorios" });
    }
    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({ error: "Tipo inválido" });
    }

    const result = db
      .prepare("INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)")
      .run(name.trim(), type, icon || "📁", color || "#6366f1");

    const newCat = db.prepare("SELECT * FROM categories WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(newCat);
  } catch (err) {
    res.status(500).json({ error: "Error al crear categoría" });
  }
});

router.put("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Categoría no encontrada" });

    const { name, type, icon, color } = req.body;

    if (type && !["income", "expense"].includes(type)) {
      return res.status(400).json({ error: "Tipo inválido" });
    }

    const updated = {
      name: name ? name.trim() : existing.name,
      type: type || existing.type,
      icon: icon || existing.icon,
      color: color || existing.color,
    };

    db.prepare("UPDATE categories SET name=?, type=?, icon=?, color=? WHERE id=?")
      .run(updated.name, updated.type, updated.icon, updated.color, req.params.id);

    const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar categoría" });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Categoría no encontrada" });

    const { count } = db
      .prepare("SELECT COUNT(*) as count FROM transactions WHERE category_id = ?")
      .get(req.params.id);

    if (count > 0) {
      return res.status(400).json({
        error: `No se puede eliminar: la categoría tiene ${count} transacción(es) asociada(s). Elimina las transacciones primero.`,
      });
    }

    db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
    res.json({ message: "Categoría eliminada" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar categoría" });
  }
});

module.exports = router;
