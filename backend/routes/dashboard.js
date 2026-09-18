const express = require("express");
const router = express.Router();
const { db } = require("../database/db");
const { projectExpenses, projectIncome, projectByCategory, getTrendDirection } = require("../utils/projections");
const { generateAlerts } = require("../utils/alerts");

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

router.get("/summary", (req, res) => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const { date_from, date_to } = req.query;

    let dateFilter = "";
    const params = [];

    if (date_from && date_to) {
      dateFilter = "AND date BETWEEN ? AND ?";
      params.push(date_from, date_to);
    } else {
      dateFilter = "AND strftime('%Y-%m', date) = ?";
      params.push(currentMonth);
    }

    const income = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income' ${dateFilter}`)
      .get(...params).total;

    const expenses = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense' ${dateFilter}`)
      .get(...params).total;

    const txCount = db
      .prepare(`SELECT COUNT(*) as count FROM transactions WHERE 1=1 ${dateFilter}`)
      .get(...params).count;

    const savings = income - expenses;
    const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;

    res.json({
      totalIncome: income,
      totalExpenses: expenses,
      savings,
      savingsRate,
      transactionCount: txCount,
      period: date_from && date_to ? `${date_from} a ${date_to}` : currentMonth,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener resumen" });
  }
});

router.get("/category-breakdown", (req, res) => {
  try {
    const { date_from, date_to, type } = req.query;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let dateFilter = "";
    const params = [];

    if (date_from && date_to) {
      dateFilter = "AND t.date BETWEEN ? AND ?";
      params.push(date_from, date_to);
    } else {
      dateFilter = "AND strftime('%Y-%m', t.date) = ?";
      params.push(currentMonth);
    }

    let typeFilter = "";
    if (type) {
      typeFilter = "AND t.type = ?";
      params.push(type);
    } else {
      typeFilter = "AND t.type = 'expense'";
    }

    const breakdown = db
      .prepare(`
      SELECT c.id, c.name, c.icon, c.color,
             SUM(t.amount) as total,
             COUNT(t.id) as count
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE 1=1 ${dateFilter} ${typeFilter}
      GROUP BY c.id, c.name, c.icon, c.color
      ORDER BY total DESC
    `)
      .all(...params);

    const grandTotal = breakdown.reduce((sum, cat) => sum + cat.total, 0);

    const result = breakdown.map((cat) => ({
      ...cat,
      percentage: grandTotal > 0 ? Math.round((cat.total / grandTotal) * 10000) / 100 : 0,
    }));

    res.json({ categories: result, grandTotal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener desglose por categoría" });
  }
});

router.get("/trend", (req, res) => {
  try {
    const { months: monthCount } = req.query;
    const count = parseInt(monthCount) || 6;

    const trend = db
      .prepare(`
      SELECT strftime('%Y-%m', date) as month,
             SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
             SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
      FROM transactions
      GROUP BY month
      ORDER BY month DESC
      LIMIT ?
    `)
      .all(count)
      .reverse();

    const result = trend.map((row) => ({
      month: row.month,
      income: row.income,
      expenses: row.expenses,
      savings: row.income - row.expenses,
    }));

    res.json({ months: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener tendencia" });
  }
});

router.get("/projection", (req, res) => {
  try {
    const monthlyData = db
      .prepare(`
      SELECT strftime('%Y-%m', date) as month,
             SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
             SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
      FROM transactions
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `)
      .all()
      .reverse();

    const projectedExpenses = projectExpenses(monthlyData);
    const projectedIncome = projectIncome(monthlyData);
    const trend = getTrendDirection(monthlyData);
    const categoryProjections = projectByCategory(
      db,
      monthlyData.map((m) => m.month)
    );

    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

    res.json({
      projectedMonth: nextMonthStr,
      projectedExpenses,
      projectedIncome,
      projectedSavings: projectedIncome - projectedExpenses,
      trend,
      categoryProjections,
      confidence: monthlyData.length >= 3 ? "alta" : monthlyData.length >= 2 ? "media" : "baja",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al calcular proyección" });
  }
});

router.get("/alerts", (req, res) => {
  try {
    generateAlerts(db);
    const alerts = db
      .prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 20")
      .all();
    res.json(alerts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener alertas" });
  }
});

router.patch("/alerts/:id/read", (req, res) => {
  try {
    db.prepare("UPDATE alerts SET is_read = 1 WHERE id = ?").run(req.params.id);
    res.json({ message: "Alerta marcada como leída" });
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar alerta" });
  }
});

router.get("/insights", (req, res) => {
  try {
    const now = new Date();

    let cur = req.query.month;
    if (!cur || !/^\d{4}-\d{2}$/.test(cur)) {
      cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    const [yStr, mStr] = cur.split("-").map(Number);
    const prevDate = new Date(yStr, mStr - 2, 1);
    const prev = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const periodTotal = (month, type) =>
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = ? AND strftime('%Y-%m', date) = ?`
        )
        .get(type, month).total;

    const curIncome = periodTotal(cur, "income");
    const curExpenses = periodTotal(cur, "expense");
    const prevIncome = periodTotal(prev, "income");
    const prevExpenses = periodTotal(prev, "expense");

    const pct = (curV, prevV) =>
      prevV > 0 ? Math.round(((curV - prevV) / prevV) * 100) : curV > 0 ? 100 : 0;

    const topCategory = db
      .prepare(
        `SELECT c.id, c.name, c.icon, c.color, SUM(t.amount) as total, COUNT(t.id) as count
         FROM transactions t JOIN categories c ON t.category_id = c.id
         WHERE t.type = 'expense' AND strftime('%Y-%m', t.date) = ?
         GROUP BY c.id, c.name, c.icon, c.color
         ORDER BY total DESC LIMIT 1`
      )
      .get(cur);

    const biggestExpense = db
      .prepare(
        `SELECT t.description, t.amount, t.date, c.name as category_name, c.icon
         FROM transactions t JOIN categories c ON t.category_id = c.id
         WHERE t.type = 'expense' AND strftime('%Y-%m', t.date) = ?
         ORDER BY t.amount DESC LIMIT 1`
      )
      .get(cur);

    const isCurrent = yStr === now.getFullYear() && mStr === now.getMonth() + 1;
    const daysElapsed = isCurrent ? now.getDate() : daysInMonth(yStr, mStr - 1);
    const daysTotal = daysInMonth(yStr, mStr - 1);
    const avgDailyExpense = daysElapsed > 0 ? Math.round(curExpenses / daysElapsed) : 0;

    res.json({
      month: cur,
      prevMonth: prev,
      topCategory,
      biggestExpense,
      avgDailyExpense,
      projectedMonthlyExpense: avgDailyExpense * daysTotal,
      vsLastMonth: {
        expensesChange: pct(curExpenses, prevExpenses),
        incomeChange: pct(curIncome, prevIncome),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener análisis" });
  }
});

router.delete("/alerts/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM alerts WHERE id = ?").run(req.params.id);
    res.json({ message: "Alerta eliminada" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar alerta" });
  }
});

module.exports = router;
