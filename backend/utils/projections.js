function projectExpenses(monthlyTotals) {
  if (!monthlyTotals || monthlyTotals.length === 0) return 0;
  if (monthlyTotals.length === 1) return monthlyTotals[0].expenses;
  if (monthlyTotals.length === 2) {
    return Math.round(monthlyTotals[0].expenses * 0.3 + monthlyTotals[1].expenses * 0.7);
  }

  const last3 = monthlyTotals.slice(-3);
  const weights = [0.2, 0.3, 0.5];
  let projected = 0;
  for (let i = 0; i < last3.length; i++) {
    projected += last3[i].expenses * weights[i];
  }

  const trend = (last3[2].expenses - last3[0].expenses) / 2;
  projected += trend * 0.3;

  return Math.max(0, Math.round(projected));
}

function projectIncome(monthlyTotals) {
  if (!monthlyTotals || monthlyTotals.length === 0) return 0;
  if (monthlyTotals.length === 1) return monthlyTotals[0].income;
  if (monthlyTotals.length === 2) {
    return Math.round(monthlyTotals[0].income * 0.3 + monthlyTotals[1].income * 0.7);
  }

  const last3 = monthlyTotals.slice(-3);
  const weights = [0.2, 0.3, 0.5];
  let projected = 0;
  for (let i = 0; i < last3.length; i++) {
    projected += last3[i].income * weights[i];
  }

  return Math.max(0, Math.round(projected));
}

function projectByCategory(db, months) {
  if (months.length === 0) return [];

  const stmt = db.prepare(`
    SELECT c.id, c.name, c.icon, c.color,
           strftime('%Y-%m', t.date) as month,
           SUM(t.amount) as total
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'expense' AND strftime('%Y-%m', t.date) IN (${months.map(() => "?").join(",")})
    GROUP BY c.id, c.name, c.icon, c.color, month
    ORDER BY c.name, month
  `);

  const rows = stmt.all(...months);
  const byCategory = {};

  for (const row of rows) {
    if (!byCategory[row.id]) {
      byCategory[row.id] = {
        id: row.id,
        name: row.name,
        icon: row.icon,
        color: row.color,
        monthlyData: {},
      };
    }
    byCategory[row.id].monthlyData[row.month] = row.total;
  }

  const weights = [0.2, 0.3, 0.5];
  const projections = [];

  for (const cat of Object.values(byCategory)) {
    const monthlyValues = months.map((m) => cat.monthlyData[m] || 0);

    if (monthlyValues.length === 1) {
      projections.push({ ...cat, projected: monthlyValues[0] });
      continue;
    }

    const last3 = monthlyValues.slice(-3);
    let projected = 0;
    for (let i = 0; i < last3.length; i++) {
      projected += last3[i] * weights[i];
    }

    if (last3.length >= 2) {
      const trend = (last3[last3.length - 1] - last3[0]) / last3.length;
      projected += trend * 0.3;
    }

    projections.push({ ...cat, projected: Math.max(0, Math.round(projected)) });
  }

  projections.sort((a, b) => b.projected - a.projected);

  return projections;
}

function getTrendDirection(monthlyTotals) {
  if (monthlyTotals.length < 2) return "stable";

  const recent = monthlyTotals.slice(-2);
  const diff = recent[1].expenses - recent[0].expenses;
  const pctChange = recent[0].expenses > 0 ? (diff / recent[0].expenses) * 100 : 0;

  if (pctChange > 10) return "increasing";
  if (pctChange < -10) return "decreasing";
  return "stable";
}

module.exports = {
  projectExpenses,
  projectIncome,
  projectByCategory,
  getTrendDirection,
};
