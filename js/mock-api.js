/* FinanzApp - Respaldo local de la API
 * Emula la API REST del backend (Express + SQLite) usando localStorage.
 * Intercepta window.fetch para las rutas /api/: primero intenta el backend
 * real y, si no responde (GitHub Pages, archivo local), usa los datos locales.
 */
(function () {
  "use strict";

  const DB_KEY = "finanzapp_demo_db_v1";

  /* ---------------- Fechas ---------------- */
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function monthKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }
  function currentMonth() {
    return monthKey(new Date());
  }
  function shiftMonth(base, offset) {
    return monthKey(new Date(base.getFullYear(), base.getMonth() + offset, 1));
  }
  function txMonth(dateStr) {
    return String(dateStr).slice(0, 7);
  }
  function now() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
  }

  /* ---------------- Persistencia ---------------- */
  let db;

  function loadDb() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.transactions)) {
          if (!parsed.budgets) parsed.budgets = [];
          if (!parsed.alerts) parsed.alerts = [];
          if (!parsed.seq) parsed.seq = {};
          return parsed;
        }
      }
    } catch (e) {
      /* localStorage no disponible o corrupto */
    }
    const fresh = seed();
    persist(fresh);
    return fresh;
  }

  function persist(data) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(data === undefined ? db : data));
    } catch (e) {
      /* modo memoria */
    }
  }

  function saveDb() {
    persist(db);
  }

  /* ---------------- Datos de ejemplo ---------------- */
  function seed() {
    const defs = [
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

    const categories = defs.map((c, i) => ({
      id: i + 1,
      name: c[0],
      type: c[1],
      icon: c[2],
      color: c[3],
      created_at: now(),
    }));

    const catId = (name) => categories.find((c) => c.name === name).id;
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(shiftMonth(new Date(), -i));

    const state = {
      categories,
      transactions: [],
      budgets: [],
      alerts: [],
      seq: { categories: categories.length, transactions: 0, budgets: 0, alerts: 0 },
    };

    let txId = 0;
    const roundTo = (v) => Math.round(v / 1000) * 1000;
    const randDay = () => pad(Math.floor(Math.random() * 28) + 1);
    const push = (amount, description, type, category_id, date) => {
      state.transactions.push({
        id: ++txId,
        amount,
        description,
        type,
        category_id,
        date,
        created_at: now(),
      });
    };

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

    for (const month of months) {
      for (const t of incomeTemplates) {
        push(
          roundTo(t.min + Math.random() * (t.max - t.min)),
          `${t.cat} ${month}`,
          "income",
          catId(t.cat),
          `${month}-${randDay()}`
        );
      }
      const count = 10 + Math.floor(Math.random() * 10);
      for (let i = 0; i < count; i++) {
        const t = expenseTemplates[Math.floor(Math.random() * expenseTemplates.length)];
        push(
          roundTo(t.min + Math.random() * (t.max - t.min)),
          `Gasto en ${t.cat.toLowerCase()} - ${month}`,
          "expense",
          catId(t.cat),
          `${month}-${randDay()}`
        );
      }
    }

    const last = months[months.length - 1];
    push(500000, "Rendimiento inversión alto riesgo", "income", catId("Inversiones"), `${last}-10`);
    push(2500000, "Compra consola nueva", "expense", catId("Entretenimiento"), `${last}-05`);

    state.seq.transactions = txId;

    const budgetDefs = [
      ["Vivienda", 1200000],
      ["Alimentación", 700000],
      ["Transporte", 350000],
    ];
    let bId = 0;
    for (const [name, amount] of budgetDefs) {
      state.budgets.push({ id: ++bId, category_id: catId(name), amount, created_at: now() });
    }
    state.seq.budgets = bId;

    return state;
  }

  /* ---------------- Helpers de consulta ---------------- */
  function getCategory(id) {
    return db.categories.find((c) => c.id === Number(id));
  }
  function nextId(key) {
    db.seq[key] = (db.seq[key] || 0) + 1;
    return db.seq[key];
  }
  function sumAmount(list) {
    return list.reduce((s, t) => s + t.amount, 0);
  }
  function catFields(cat) {
    return {
      category_name: cat ? cat.name : "",
      category_icon: cat ? cat.icon : "📁",
      category_color: cat ? cat.color : "#6366f1",
    };
  }
  function withCategory(tx) {
    return { ...tx, ...catFields(getCategory(tx.category_id)) };
  }
  function expCatMonth(categoryId, month) {
    return sumAmount(
      db.transactions.filter(
        (t) => t.type === "expense" && t.category_id === categoryId && txMonth(t.date) === month
      )
    );
  }
  function groupMonths() {
    const byMonth = {};
    for (const t of db.transactions) {
      const m = txMonth(t.date);
      const row = byMonth[m] || (byMonth[m] = { month: m, income: 0, expenses: 0 });
      if (t.type === "income") row.income += t.amount;
      else row.expenses += t.amount;
    }
    return byMonth;
  }

  /* ---------------- Transacciones ---------------- */
  function queryTransactions(q) {
    let list = db.transactions.slice();
    if (q.type) list = list.filter((t) => t.type === q.type);
    if (q.category_id) list = list.filter((t) => t.category_id === Number(q.category_id));
    if (q.date_from) list = list.filter((t) => t.date >= q.date_from);
    if (q.date_to) list = list.filter((t) => t.date <= q.date_to);
    if (q.search) {
      const s = String(q.search).toLowerCase();
      list = list.filter((t) => t.description.toLowerCase().includes(s));
    }
    list.sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
    const total = list.length;
    const offset = q.offset ? parseInt(q.offset, 10) : 0;
    if (q.limit) list = list.slice(offset, offset + parseInt(q.limit, 10));
    else if (offset) list = list.slice(offset);
    return { transactions: list.map(withCategory), total };
  }

  function createTransaction(body) {
    const { amount, description, type, category_id, date } = body;
    if (!amount || !description || !type || !category_id || !date) {
      return errorResponse("Todos los campos son obligatorios", 400);
    }
    if (amount <= 0) return errorResponse("El monto debe ser mayor a 0", 400);
    if (!["income", "expense"].includes(type)) return errorResponse("Tipo inválido", 400);
    if (!getCategory(category_id)) return errorResponse("Categoría no encontrada", 400);

    const tx = {
      id: nextId("transactions"),
      amount: Number(amount),
      description: String(description).trim(),
      type,
      category_id: Number(category_id),
      date,
      created_at: now(),
    };
    db.transactions.push(tx);
    saveDb();
    return jsonResponse(withCategory(tx), 201);
  }

  function updateTransaction(id, body) {
    const existing = db.transactions.find((t) => t.id === id);
    if (!existing) return errorResponse("Transacción no encontrada", 404);

    const { amount, description, type, category_id, date } = body;
    if (amount !== undefined && amount <= 0) return errorResponse("El monto debe ser mayor a 0", 400);
    if (type && !["income", "expense"].includes(type)) return errorResponse("Tipo inválido", 400);
    if (category_id && !getCategory(category_id)) return errorResponse("Categoría no encontrada", 400);

    existing.amount = amount || existing.amount;
    existing.description = description ? String(description).trim() : existing.description;
    existing.type = type || existing.type;
    existing.category_id = category_id ? Number(category_id) : existing.category_id;
    existing.date = date || existing.date;
    saveDb();
    return jsonResponse(withCategory(existing));
  }

  function deleteTransaction(id) {
    const idx = db.transactions.findIndex((t) => t.id === id);
    if (idx === -1) return errorResponse("Transacción no encontrada", 404);
    db.transactions.splice(idx, 1);
    saveDb();
    return jsonResponse({ message: "Transacción eliminada" });
  }

  function csvResponse(q) {
    const list = queryTransactions(q).transactions;
    const esc = (v) => {
      const s = String(v == null ? "" : v);
      return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = "Fecha;Descripcion;Tipo;Categoria;Monto";
    const lines = list.map((r) =>
      [
        r.date,
        esc(r.description),
        r.type === "income" ? "Ingreso" : "Gasto",
        esc(r.category_name),
        r.amount.toFixed(0),
      ].join(";")
    );
    const csv = ["\ufeff" + header, ...lines].join("\r\n");
    return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8" } });
  }

  /* ---------------- Categorías ---------------- */
  function listCategories(type) {
    let list = db.categories.slice();
    if (type) list = list.filter((c) => c.type === type);
    list.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type < b.type ? -1 : 1));
    return list.map((cat) => ({
      ...cat,
      transaction_count: db.transactions.filter((t) => t.category_id === cat.id).length,
    }));
  }

  function createCategory(body) {
    const { name, type, icon, color } = body;
    if (!name || !type) return errorResponse("Nombre y tipo son obligatorios", 400);
    if (!["income", "expense"].includes(type)) return errorResponse("Tipo inválido", 400);
    const cat = {
      id: nextId("categories"),
      name: String(name).trim(),
      type,
      icon: icon || "📁",
      color: color || "#6366f1",
      created_at: now(),
    };
    db.categories.push(cat);
    saveDb();
    return jsonResponse(cat, 201);
  }

  function updateCategory(id, body) {
    const existing = db.categories.find((c) => c.id === id);
    if (!existing) return errorResponse("Categoría no encontrada", 404);
    const { name, type, icon, color } = body;
    if (type && !["income", "expense"].includes(type)) return errorResponse("Tipo inválido", 400);
    existing.name = name ? String(name).trim() : existing.name;
    existing.type = type || existing.type;
    existing.icon = icon || existing.icon;
    existing.color = color || existing.color;
    saveDb();
    return jsonResponse(existing);
  }

  function deleteCategory(id) {
    const idx = db.categories.findIndex((c) => c.id === id);
    if (idx === -1) return errorResponse("Categoría no encontrada", 404);
    const count = db.transactions.filter((t) => t.category_id === id).length;
    if (count > 0) {
      return errorResponse(
        `No se puede eliminar: la categoría tiene ${count} transacción(es) asociada(s). Elimina las transacciones primero.`,
        400
      );
    }
    db.categories.splice(idx, 1);
    db.budgets = db.budgets.filter((b) => b.category_id !== id);
    saveDb();
    return jsonResponse({ message: "Categoría eliminada" });
  }

  /* ---------------- Presupuestos ---------------- */
  function listBudgets(month) {
    const m = month || currentMonth();
    const result = db.budgets
      .map((b) => {
        const cat = getCategory(b.category_id);
        if (!cat) return null;
        const spent = expCatMonth(b.category_id, m);
        const remaining = b.amount - spent;
        const percentage = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
        const status = spent > b.amount ? "exceeded" : percentage >= 80 ? "warning" : "ok";
        return {
          id: b.id,
          category_id: b.category_id,
          amount: b.amount,
          category_name: cat.name,
          icon: cat.icon,
          color: cat.color,
          spent,
          remaining,
          percentage,
          status,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.category_name.localeCompare(b.category_name));
    return { month: m, budgets: result };
  }

  function createOrUpdateBudget(body) {
    const { category_id, amount } = body;
    if (!category_id || !amount) return errorResponse("Categoría y monto son obligatorios", 400);
    if (amount <= 0) return errorResponse("El monto debe ser mayor a 0", 400);
    const cat = getCategory(category_id);
    if (!cat) return errorResponse("Categoría no encontrada", 400);
    if (cat.type !== "expense") return errorResponse("Solo se pueden presupuestar categorías de gasto", 400);

    const existing = db.budgets.find((b) => b.category_id === Number(category_id));
    if (existing) {
      existing.amount = Number(amount);
      saveDb();
      return jsonResponse(existing);
    }
    const b = { id: nextId("budgets"), category_id: Number(category_id), amount: Number(amount), created_at: now() };
    db.budgets.push(b);
    saveDb();
    return jsonResponse(b, 201);
  }

  function updateBudget(id, body) {
    const existing = db.budgets.find((b) => b.id === id);
    if (!existing) return errorResponse("Presupuesto no encontrado", 404);
    const { category_id, amount } = body;
    if (amount !== undefined && amount <= 0) return errorResponse("El monto debe ser mayor a 0", 400);
    if (category_id) {
      const cat = getCategory(category_id);
      if (!cat) return errorResponse("Categoría no encontrada", 400);
      if (cat.type !== "expense") return errorResponse("Solo se pueden presupuestar categorías de gasto", 400);
    }
    existing.category_id = category_id ? Number(category_id) : existing.category_id;
    existing.amount = amount || existing.amount;
    saveDb();
    return jsonResponse(existing);
  }

  function deleteBudget(id) {
    const idx = db.budgets.findIndex((b) => b.id === id);
    if (idx === -1) return errorResponse("Presupuesto no encontrado", 404);
    db.budgets.splice(idx, 1);
    saveDb();
    return jsonResponse({ message: "Presupuesto eliminado" });
  }

  /* ---------------- Dashboard: resumen / desglose / tendencia ---------------- */
  function summary(q) {
    const inRange = q.date_from && q.date_to;
    const list = db.transactions.filter((t) =>
      inRange ? t.date >= q.date_from && t.date <= q.date_to : txMonth(t.date) === currentMonth()
    );
    const income = sumAmount(list.filter((t) => t.type === "income"));
    const expenses = sumAmount(list.filter((t) => t.type === "expense"));
    const savings = income - expenses;
    const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;
    return {
      totalIncome: income,
      totalExpenses: expenses,
      savings,
      savingsRate,
      transactionCount: list.length,
      period: inRange ? `${q.date_from} a ${q.date_to}` : currentMonth(),
    };
  }

  function breakdown(q) {
    const inRange = q.date_from && q.date_to;
    const grouped = {};
    for (const t of db.transactions) {
      const inDate = inRange ? t.date >= q.date_from && t.date <= q.date_to : txMonth(t.date) === currentMonth();
      const inType = q.type ? t.type === q.type : t.type === "expense";
      if (!inDate || !inType) continue;
      const cat = getCategory(t.category_id);
      if (!cat) continue;
      const g = grouped[cat.id] || (grouped[cat.id] = { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, total: 0, count: 0 });
      g.total += t.amount;
      g.count++;
    }
    const categories = Object.values(grouped).sort((a, b) => b.total - a.total);
    const grandTotal = categories.reduce((s, c) => s + c.total, 0);
    const result = categories.map((c) => ({
      ...c,
      percentage: grandTotal > 0 ? Math.round((c.total / grandTotal) * 10000) / 100 : 0,
    }));
    return { categories: result, grandTotal };
  }

  function trend(q) {
    const count = parseInt(q.months, 10) || 6;
    const byMonth = groupMonths();
    const months = Object.values(byMonth)
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .slice(0, count)
      .reverse();
    return {
      months: months.map((r) => ({ month: r.month, income: r.income, expenses: r.expenses, savings: r.income - r.expenses })),
    };
  }

  /* ---------------- Proyecciones (portado de src/utils/projections.js) ---------------- */
  function projectExpenses(monthly) {
    if (!monthly.length) return 0;
    if (monthly.length === 1) return monthly[0].expenses;
    if (monthly.length === 2) return Math.round(monthly[0].expenses * 0.3 + monthly[1].expenses * 0.7);
    const last3 = monthly.slice(-3);
    const w = [0.2, 0.3, 0.5];
    let p = 0;
    for (let i = 0; i < 3; i++) p += last3[i].expenses * w[i];
    p += ((last3[2].expenses - last3[0].expenses) / 2) * 0.3;
    return Math.max(0, Math.round(p));
  }

  function projectIncome(monthly) {
    if (!monthly.length) return 0;
    if (monthly.length === 1) return monthly[0].income;
    if (monthly.length === 2) return Math.round(monthly[0].income * 0.3 + monthly[1].income * 0.7);
    const last3 = monthly.slice(-3);
    const w = [0.2, 0.3, 0.5];
    let p = 0;
    for (let i = 0; i < 3; i++) p += last3[i].income * w[i];
    return Math.max(0, Math.round(p));
  }

  function projectByCategory(months) {
    if (!months.length) return [];
    const byCat = {};
    for (const t of db.transactions) {
      if (t.type !== "expense") continue;
      const m = txMonth(t.date);
      if (!months.includes(m)) continue;
      const cat = getCategory(t.category_id);
      if (!cat) continue;
      if (!byCat[cat.id]) {
        byCat[cat.id] = { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, monthlyData: {} };
      }
      byCat[cat.id].monthlyData[m] = (byCat[cat.id].monthlyData[m] || 0) + t.amount;
    }
    const w = [0.2, 0.3, 0.5];
    const out = [];
    for (const cat of Object.values(byCat)) {
      const vals = months.map((m) => cat.monthlyData[m] || 0);
      if (vals.length === 1) {
        out.push({ ...cat, projected: vals[0] });
        continue;
      }
      const last3 = vals.slice(-3);
      let p = 0;
      for (let i = 0; i < last3.length; i++) p += last3[i] * w[i];
      if (last3.length >= 2) p += ((last3[last3.length - 1] - last3[0]) / last3.length) * 0.3;
      out.push({ ...cat, projected: Math.max(0, Math.round(p)) });
    }
    out.sort((a, b) => b.projected - a.projected);
    return out;
  }

  function getTrendDirection(monthly) {
    if (monthly.length < 2) return "stable";
    const recent = monthly.slice(-2);
    const diff = recent[1].expenses - recent[0].expenses;
    const pctChange = recent[0].expenses > 0 ? (diff / recent[0].expenses) * 100 : 0;
    if (pctChange > 10) return "increasing";
    if (pctChange < -10) return "decreasing";
    return "stable";
  }

  function projection() {
    const byMonth = groupMonths();
    const monthlyData = Object.values(byMonth)
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .slice(-6);
    const projectedExpenses = projectExpenses(monthlyData);
    const projectedIncome = projectIncome(monthlyData);
    return {
      projectedMonth: shiftMonth(new Date(), 1),
      projectedExpenses,
      projectedIncome,
      projectedSavings: projectedIncome - projectedExpenses,
      trend: getTrendDirection(monthlyData),
      categoryProjections: projectByCategory(monthlyData.map((m) => m.month)),
      confidence: monthlyData.length >= 3 ? "alta" : monthlyData.length >= 2 ? "media" : "baja",
    };
  }

  /* ---------------- Análisis (insights) ---------------- */
  function insights(month) {
    const cur = month && /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
    const [y, m] = cur.split("-").map(Number);
    const prev = shiftMonth(new Date(y, m - 1, 1), -1);

    const periodTotal = (mo, type) =>
      sumAmount(db.transactions.filter((t) => t.type === type && txMonth(t.date) === mo));

    const curExpenses = periodTotal(cur, "expense");
    const curIncome = periodTotal(cur, "income");
    const prevExpenses = periodTotal(prev, "expense");
    const prevIncome = periodTotal(prev, "income");
    const pct = (c, p) => (p > 0 ? Math.round(((c - p) / p) * 100) : c > 0 ? 100 : 0);

    const curList = db.transactions.filter((t) => t.type === "expense" && txMonth(t.date) === cur);
    const grouped = {};
    for (const t of curList) {
      const cat = getCategory(t.category_id);
      if (!cat) continue;
      const g = grouped[cat.id] || (grouped[cat.id] = { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, total: 0, count: 0 });
      g.total += t.amount;
      g.count++;
    }
    const topCategory = Object.values(grouped).sort((a, b) => b.total - a.total)[0] || null;

    let biggestExpense = null;
    for (const t of curList) {
      if (!biggestExpense || t.amount > biggestExpense.amount) {
        const cat = getCategory(t.category_id);
        biggestExpense = { description: t.description, amount: t.amount, date: t.date, category_name: cat ? cat.name : "", icon: cat ? cat.icon : "📁" };
      }
    }

    const nowDate = new Date();
    const isCurrent = y === nowDate.getFullYear() && m === nowDate.getMonth() + 1;
    const daysTotal = new Date(y, m, 0).getDate();
    const daysElapsed = isCurrent ? nowDate.getDate() : daysTotal;
    const avgDailyExpense = daysElapsed > 0 ? Math.round(curExpenses / daysElapsed) : 0;

    return {
      month: cur,
      prevMonth: prev,
      topCategory,
      biggestExpense,
      avgDailyExpense,
      projectedMonthlyExpense: avgDailyExpense * daysTotal,
      vsLastMonth: { expensesChange: pct(curExpenses, prevExpenses), incomeChange: pct(curIncome, prevIncome) },
    };
  }

  /* ---------------- Alertas (portado de src/utils/alerts.js) ---------------- */
  function addAlert(type, title, message, severity, relatedCategoryId) {
    db.alerts.push({
      id: nextId("alerts"),
      type,
      title,
      message,
      severity,
      is_read: 0,
      related_category_id: relatedCategoryId == null ? null : relatedCategoryId,
      created_at: now(),
    });
  }

  function generateAlerts() {
    db.alerts = [];
    checkUnusualCategorySpending();
    checkLargeTransactions();
    checkBudgetTrend();
    checkBudgetStatus();
  }

  function checkUnusualCategorySpending() {
    const cm = currentMonth();
    const prevMonths = [1, 2, 3].map((i) => shiftMonth(new Date(), -i));
    for (const cat of db.categories.filter((c) => c.type === "expense")) {
      const current = expCatMonth(cat.id, cm);
      const active = prevMonths.map((m) => expCatMonth(cat.id, m)).filter((t) => t > 0);
      if (!active.length || current === 0) continue;
      const avg = active.reduce((a, b) => a + b, 0) / active.length;
      const inc = ((current - avg) / avg) * 100;
      if (inc > 50) {
        addAlert(
          "unusual_spending",
          `Gasto elevado en ${cat.name}`,
          `El gasto en ${cat.name} este mes ($${current.toLocaleString("es-CO")}) ha aumentado un ${Math.round(inc)}% comparado con el promedio de los últimos 3 meses ($${Math.round(avg).toLocaleString("es-CO")}).`,
          inc > 100 ? "danger" : "warning",
          cat.id
        );
      }
    }
  }

  function checkLargeTransactions() {
    const cm = currentMonth();
    const stats = {};
    for (const t of db.transactions) {
      if (t.type !== "expense" || txMonth(t.date) === cm) continue;
      const s = stats[t.category_id] || (stats[t.category_id] = { sum: 0, count: 0 });
      s.sum += t.amount;
      s.count++;
    }
    const current = db.transactions.filter((t) => t.type === "expense" && txMonth(t.date) === cm);
    for (const t of current) {
      const s = stats[t.category_id];
      if (!s || s.count === 0) continue;
      const avg = s.sum / s.count;
      if (avg > 0 && t.amount > avg * 3) {
        const cat = getCategory(t.category_id);
        addAlert(
          "large_transaction",
          `Transacción inusual: ${cat ? cat.name : ""}`,
          `La transacción "${t.description}" por $${t.amount.toLocaleString("es-CO")} es significativamente superior al promedio de su categoría.`,
          "danger",
          t.category_id
        );
      }
    }
  }

  function checkBudgetTrend() {
    const months = Object.values(groupMonths())
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .slice(0, 3);
    if (months.length < 2) return;
    const [latest] = months;
    if (latest.expenses > latest.income) {
      addAlert(
        "negative_balance",
        "Gastos superan ingresos",
        `En ${latest.month} tus gastos ($${latest.expenses.toLocaleString("es-CO")}) superaron tus ingresos ($${latest.income.toLocaleString("es-CO")}).`,
        "danger",
        null
      );
    }
    if (months.length >= 3) {
      const increasing = months[0].expenses > months[1].expenses && months[1].expenses > months[2].expenses;
      if (increasing) {
        addAlert(
          "trend_warning",
          "Tendencia de gastos al alza",
          "Tus gastos han aumentado durante los últimos 3 meses consecutivos. Considera revisar tu presupuesto.",
          "warning",
          null
        );
      }
    }
    const savingsRate = latest.income > 0 ? ((latest.income - latest.expenses) / latest.income) * 100 : 0;
    if (savingsRate < 0) {
      addAlert("low_savings", "Ahorro negativo", `Tu tasa de ahorro este mes es del ${Math.round(savingsRate)}%. Estás gastando más de lo que ingresas.`, "danger", null);
    } else if (savingsRate < 10 && latest.income > 0) {
      addAlert("low_savings", "Tasa de ahorro baja", `Tu tasa de ahorro este mes es del ${Math.round(savingsRate)}%. Se recomienda ahorrar al menos el 20% de tus ingresos.`, "warning", null);
    }
  }

  function checkBudgetStatus() {
    const cm = currentMonth();
    for (const b of db.budgets) {
      const cat = getCategory(b.category_id);
      if (!cat) continue;
      const spent = expCatMonth(b.category_id, cm);
      if (spent > b.amount) {
        addAlert(
          "budget_exceeded",
          `Presupuesto excedido: ${cat.name}`,
          `Has gastado $${spent.toLocaleString("es-CO")} de tu presupuesto de $${b.amount.toLocaleString("es-CO")} para ${cat.name}. Superado por $${(spent - b.amount).toLocaleString("es-CO")}.`,
          "danger",
          b.category_id
        );
      } else if (b.amount > 0 && spent / b.amount >= 0.8) {
        addAlert(
          "budget_high",
          `Cerca del límite: ${cat.name}`,
          `Has gastado el ${Math.round((spent / b.amount) * 100)}% de tu presupuesto de ${cat.name}. Quedan $${(b.amount - spent).toLocaleString("es-CO")} disponibles.`,
          "warning",
          b.category_id
        );
      }
    }
  }

  /* ---------------- Respuestas ---------------- */
  function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  function errorResponse(message, status) {
    return jsonResponse({ error: message }, status || 500);
  }

  /* ---------------- Enrutador ---------------- */
  function route(method, rawUrl, init) {
    const base = location && location.origin && location.origin !== "null" ? location.origin : "http://localhost";
    const u = new URL(rawUrl, base);
    const q = {};
    u.searchParams.forEach((v, k) => (q[k] = v));
    let body = {};
    if (init && init.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch (e) {
        body = {};
      }
    }

    const seg = u.pathname.split("/").filter(Boolean);
    const api = seg[1];
    const rest = seg.slice(2);

    if (api === "transactions") {
      if (rest[0] === "export.csv") return csvResponse(q);
      if (rest.length === 0) {
        if (method === "GET") return jsonResponse(queryTransactions(q));
        if (method === "POST") return createTransaction(body);
      }
      const id = Number(rest[0]);
      if (rest.length === 1) {
        if (method === "GET") {
          const tx = db.transactions.find((t) => t.id === id);
          return tx ? jsonResponse(withCategory(tx)) : errorResponse("Transacción no encontrada", 404);
        }
        if (method === "PUT") return updateTransaction(id, body);
        if (method === "DELETE") return deleteTransaction(id);
      }
    }

    if (api === "categories") {
      if (rest.length === 0) {
        if (method === "GET") return jsonResponse(listCategories(q.type));
        if (method === "POST") return createCategory(body);
      }
      const id = Number(rest[0]);
      if (rest.length === 1) {
        if (method === "GET") {
          const cat = getCategory(id);
          return cat ? jsonResponse(cat) : errorResponse("Categoría no encontrada", 404);
        }
        if (method === "PUT") return updateCategory(id, body);
        if (method === "DELETE") return deleteCategory(id);
      }
    }

    if (api === "budgets") {
      if (rest.length === 0) {
        if (method === "GET") return jsonResponse(listBudgets(q.month));
        if (method === "POST") return createOrUpdateBudget(body);
      }
      const id = Number(rest[0]);
      if (rest.length === 1) {
        if (method === "PUT") return updateBudget(id, body);
        if (method === "DELETE") return deleteBudget(id);
      }
    }

    if (api === "dashboard") {
      const res = rest[0];
      if (res === "summary") return jsonResponse(summary(q));
      if (res === "category-breakdown") return jsonResponse(breakdown(q));
      if (res === "trend") return jsonResponse(trend(q));
      if (res === "projection") return jsonResponse(projection());
      if (res === "insights") return jsonResponse(insights(q.month));
      if (res === "alerts") {
        if (method === "GET") {
          generateAlerts();
          saveDb();
          const list = db.alerts
            .slice()
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
            .slice(0, 20);
          return jsonResponse(list);
        }
        const id = Number(rest[1]);
        if (method === "DELETE" && rest[1]) {
          db.alerts = db.alerts.filter((a) => a.id !== id);
          saveDb();
          return jsonResponse({ message: "Alerta eliminada" });
        }
        if (method === "PATCH" && rest[1] && rest[2] === "read") {
          const a = db.alerts.find((x) => x.id === id);
          if (a) a.is_read = 1;
          saveDb();
          return jsonResponse({ message: "Alerta marcada como leída" });
        }
      }
    }

    return errorResponse("Recurso no encontrado en la demo", 404);
  }

  /* ---------------- Intercepción de fetch ---------------- */
  const originalFetch = window.fetch ? window.fetch.bind(window) : null;
  const API_RE = /\/api\//;
  let localMode = false;

  function useLocalMode() {
    localMode = true;
    const badge = document.querySelector(".demo-badge");
    if (badge) badge.classList.add("show");
  }

  function localResponse(method, rawUrl, options) {
    try {
      return Promise.resolve(route(method, rawUrl, options));
    } catch (err) {
      return Promise.resolve(errorResponse(err && err.message ? err.message : "Error en la demo", 500));
    }
  }

  window.fetch = function (input, init) {
    const rawUrl = typeof input === "string" ? input : input && input.url ? input.url : String(input);
    const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    const options = init || (input && input.method ? { method: input.method, body: input._bodyInit } : {});

    if (!API_RE.test(rawUrl)) {
      if (originalFetch) return originalFetch(input, init);
      return Promise.reject(new Error("fetch no disponible"));
    }

    if (localMode || !originalFetch) {
      useLocalMode();
      return localResponse(method, rawUrl, options);
    }

    return originalFetch(input, init)
      .then(function (res) {
        const type = (res.headers.get("content-type") || "").toLowerCase();
        if (type.indexOf("application/json") !== -1 || type.indexOf("text/csv") !== -1) {
          return res;
        }
        useLocalMode();
        return localResponse(method, rawUrl, options);
      })
      .catch(function () {
        useLocalMode();
        return localResponse(method, rawUrl, options);
      });
  };

  /* ---------------- API pública (consola / botón) ---------------- */
  window.FinanzDemo = {
    reset: function () {
      try {
        localStorage.removeItem(DB_KEY);
      } catch (e) {
        /* ignore */
      }
      db = loadDb();
      return true;
    },
    exportDb: function () {
      return JSON.parse(JSON.stringify(db));
    },
  };

  db = loadDb();
})();
