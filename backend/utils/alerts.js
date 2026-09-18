function generateAlerts(db) {
  db.prepare("DELETE FROM alerts").run();

  checkUnusualCategorySpending(db);
  checkLargeTransactions(db);
  checkBudgetTrend(db);
  checkBudgetStatus(db);
}

function checkUnusualCategorySpending(db) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const prevMonths = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    prevMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const categories = db
    .prepare("SELECT id, name, icon, color FROM categories WHERE type = 'expense'")
    .all();

  const insertAlert = db.prepare(
    "INSERT INTO alerts (type, title, message, severity, related_category_id) VALUES (?, ?, ?, ?, ?)"
  );

  for (const cat of categories) {
    const currentTotal =
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE category_id = ? AND type = 'expense' AND strftime('%Y-%m', date) = ?`
        )
        .get(cat.id, currentMonth).total;

    const prevTotals = prevMonths.map(
      (m) =>
        db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
           WHERE category_id = ? AND type = 'expense' AND strftime('%Y-%m', date) = ?`
          )
          .get(cat.id, m).total
    );

    const activePrevTotals = prevTotals.filter((t) => t > 0);
    if (activePrevTotals.length === 0 || currentTotal === 0) continue;

    const avgPrev = activePrevTotals.reduce((a, b) => a + b, 0) / activePrevTotals.length;
    const increase = ((currentTotal - avgPrev) / avgPrev) * 100;

    if (increase > 50) {
      insertAlert.run(
        "unusual_spending",
        `Gasto elevado en ${cat.name}`,
        `El gasto en ${cat.name} este mes ($${currentTotal.toLocaleString("es-CO")}) ha aumentado un ${Math.round(increase)}% comparado con el promedio de los últimos 3 meses ($${Math.round(avgPrev).toLocaleString("es-CO")}).`,
        increase > 100 ? "danger" : "warning",
        cat.id
      );
    }
  }
}

function checkLargeTransactions(db) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const stats = db
    .prepare(
      `SELECT category_id, AVG(amount) as avg_amount, MAX(amount) as max_amount
     FROM transactions WHERE type = 'expense' AND strftime('%Y-%m', date) != ?
     GROUP BY category_id`
    )
    .all(currentMonth);

  const insertAlert = db.prepare(
    "INSERT INTO alerts (type, title, message, severity, related_category_id) VALUES (?, ?, ?, ?, ?)"
  );

  const largeTx = db
    .prepare(
      `SELECT t.id, t.amount, t.description, c.name as cat_name, c.icon
     FROM transactions t
     JOIN categories c ON t.category_id = c.id
     WHERE t.type = 'expense' AND strftime('%Y-%m', t.date) = ?`
    )
    .all(currentMonth);

  for (const tx of largeTx) {
    const catStat = stats.find((s) => s.category_id === tx.category_id);
    if (!catStat || catStat.avg_amount === 0) continue;

    if (tx.amount > catStat.avg_amount * 3) {
      insertAlert.run(
        "large_transaction",
        `Transacción inusual: ${tx.cat_name}`,
        `La transacción "${tx.description}" por $${tx.amount.toLocaleString("es-CO")} es significativamente superior al promedio de su categoría.`,
        "danger",
        tx.category_id
      );
    }
  }
}

function checkBudgetTrend(db) {
  const months = db
    .prepare(
      `SELECT strftime('%Y-%m', date) as month,
             SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
             SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
     FROM transactions
     GROUP BY month
     ORDER BY month DESC
     LIMIT 3`
    )
    .all();

  if (months.length < 2) return;

  const insertAlert = db.prepare(
    "INSERT INTO alerts (type, title, message, severity, related_category_id) VALUES (?, ?, ?, ?, ?)"
  );

  const [latest, previous] = months;

  if (latest.expenses > latest.income) {
    insertAlert.run(
      "negative_balance",
      "Gastos superan ingresos",
      `En ${latest.month} tus gastos ($${latest.expenses.toLocaleString("es-CO")}) superaron tus ingresos ($${latest.income.toLocaleString("es-CO")}).`,
      "danger",
      null
    );
  }

  if (months.length >= 3) {
    const increasing =
      months[0].expenses > months[1].expenses && months[1].expenses > months[2].expenses;

    if (increasing) {
      insertAlert.run(
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
    insertAlert.run(
      "low_savings",
      "Ahorro negativo",
      `Tu tasa de ahorro este mes es del ${Math.round(savingsRate)}%. Estás gastando más de lo que ingresas.`,
      "danger",
      null
    );
  } else if (savingsRate < 10 && latest.income > 0) {
    insertAlert.run(
      "low_savings",
      "Tasa de ahorro baja",
      `Tu tasa de ahorro este mes es del ${Math.round(savingsRate)}%. Se recomienda ahorrar al menos el 20% de tus ingresos.`,
      "warning",
      null
    );
  }
}

function checkBudgetStatus(db) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const budgets = db
    .prepare(
      `SELECT b.id, b.amount, b.category_id, c.name as cat_name, c.icon,
              COALESCE((SELECT SUM(amount) FROM transactions
                        WHERE category_id = b.category_id AND type = 'expense'
                          AND strftime('%Y-%m', date) = ?), 0) as spent
       FROM budgets b
       JOIN categories c ON b.category_id = c.id`
    )
    .all(currentMonth);

  const insertAlert = db.prepare(
    "INSERT INTO alerts (type, title, message, severity, related_category_id) VALUES (?, ?, ?, ?, ?)"
  );

  for (const b of budgets) {
    if (b.spent > b.amount) {
      const over = b.spent - b.amount;
      insertAlert.run(
        "budget_exceeded",
        `Presupuesto excedido: ${b.cat_name}`,
        `Has gastado $${b.spent.toLocaleString("es-CO")} de tu presupuesto de $${b.amount.toLocaleString("es-CO")} para ${b.cat_name}. Superado por $${over.toLocaleString("es-CO")}.`,
        "danger",
        b.category_id
      );
    } else if (b.amount > 0 && b.spent / b.amount >= 0.8) {
      const remaining = b.amount - b.spent;
      insertAlert.run(
        "budget_high",
        `Cerca del límite: ${b.cat_name}`,
        `Has gastado el ${Math.round((b.spent / b.amount) * 100)}% de tu presupuesto de ${b.cat_name}. Quedan $${remaining.toLocaleString("es-CO")} disponibles.`,
        "warning",
        b.category_id
      );
    }
  }
}

module.exports = { generateAlerts };
