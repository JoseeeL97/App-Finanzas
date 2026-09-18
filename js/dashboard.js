function applyDashboardPeriod() {
  loadDashboard();
}

function shiftDashboardMonth(dir) {
  const input = document.getElementById("dashboardMonth");
  const [y, m] = (input.value || getCurrentMonth()).split("-").map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  input.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  loadDashboard();
}

function resetDashboardMonth() {
  document.getElementById("dashboardMonth").value = getCurrentMonth();
  loadDashboard();
}

function pctChange(current, previous) {
  if (!previous || previous <= 0) {
    return current > 0 ? null : 0;
  }
  const pct = ((current - previous) / previous) * 100;
  return pct.toFixed(1);
}

function trendBadge(pct) {
  if (pct === null) return '<span class="kpi-badge up">▲ nuevo</span>';
  const num = parseFloat(pct);
  if (num === 0) return '<span class="kpi-badge neutral">= 0%</span>';
  if (num > 0) return `<span class="kpi-badge up">▲ ${Math.abs(num)}%</span>`;
  return `<span class="kpi-badge down">▼ ${Math.abs(num)}%</span>`;
}

async function loadDashboard() {
  try {
    const month = document.getElementById("dashboardMonth").value || getCurrentMonth();
    const [year, mm] = month.split("-");
    const days = daysInMonth(year, mm);
    const from = `${month}-01`;
    const to = `${month}-${String(days).padStart(2, "0")}`;

    const prevM = prevMonthStr(month);
    const prevDays = daysInMonth(prevM.split("-")[0], prevM.split("-")[1]);
    const prevFrom = `${prevM}-01`;
    const prevTo = `${prevM}-${String(prevDays).padStart(2, "0")}`;

    const params = new URLSearchParams({ date_from: from, date_to: to });
    const prevParams = new URLSearchParams({ date_from: prevFrom, date_to: prevTo });

    const [summary, prevSummary, breakdown, trend, projection, insights, alerts] = await Promise.all([
      api(`/api/dashboard/summary?${params}`),
      api(`/api/dashboard/summary?${prevParams}`),
      api(`/api/dashboard/category-breakdown?${params}`),
      api("/api/dashboard/trend"),
      api("/api/dashboard/projection"),
      api(`/api/dashboard/insights?${new URLSearchParams({ month })}`),
      api("/api/dashboard/alerts"),
    ]);

    renderKPICards(summary, prevSummary);
    renderInsights(insights, breakdown, month, from, to);
    renderCategoryChart(breakdown);
    renderTrendChart(trend);
    renderProjection(projection);
    renderAlerts(alerts);
    loadRecentTransactions();
  } catch (err) {
    console.error(err);
  }
}

function renderKPICards(data, prev) {
  document.getElementById("kpiIncome").textContent = formatCurrency(data.totalIncome);
  document.getElementById("kpiExpenses").textContent = formatCurrency(data.totalExpenses);

  const savingsEl = document.getElementById("kpiSavings");
  savingsEl.textContent = formatCurrency(data.savings);
  savingsEl.style.color = data.savings >= 0 ? "var(--success)" : "var(--danger)";

  const rateEl = document.getElementById("kpiRate");
  rateEl.textContent = `${data.savingsRate}%`;
  rateEl.style.color = data.savingsRate >= 20 ? "var(--success)" : data.savingsRate >= 10 ? "var(--warning)" : "var(--danger)";

  if (prev) {
    const incomePct = pctChange(data.totalIncome, prev.totalIncome);
    const expensesPct = pctChange(data.totalExpenses, prev.totalExpenses);
    const savingsPct = pctChange(data.savings, prev.savings);
    const ratePct = pctChange(data.savingsRate, prev.savingsRate);

    document.getElementById("kpiIncomeTrend").innerHTML = trendBadge(incomePct);
    document.getElementById("kpiExpensesTrend").innerHTML = trendBadge(expensesPct);
    document.getElementById("kpiSavingsTrend").innerHTML = trendBadge(savingsPct);
    document.getElementById("kpiRateTrend").innerHTML = trendBadge(ratePct);

    const ref = prev.totalIncome === 0 ? "nuevo período" : "vs mes anterior";
    document.getElementById("kpiIncomeTrend").title = ref;
  }
}

function renderInsights(insights, breakdown, month, from, to) {
  const strip = document.getElementById("insightsStrip");
  if (!strip) return;

  const monthLabel = formatMonthLabel(month);

  if (!insights || !insights.topCategory && !insights.biggestExpense && insights.avgDailyExpense === 0) {
    strip.innerHTML = `
      <div class="insight-card">
        <span class="insight-icon">🤔</span>
        <div class="insight-info">
          <div class="insight-label">Sin datos</div>
          <div class="insight-sub">Agrega movimientos en ${monthLabel} para ver análisis</div>
        </div>
      </div>`;
    return;
  }

  const vsExp = parseInt(insights.vsLastMonth.expensesChange, 10);
  const vsInc = parseInt(insights.vsLastMonth.incomeChange, 10);
  const expClass = vsExp > 0 ? "bad" : "good";
  const incClass = vsInc >= 0 ? "good" : "bad";

  const cards = [];

  if (insights.topCategory) {
    cards.push(`
      <div class="insight-card" onclick="filterCategory('${insights.topCategory.id}')" title="Ver transacciones de esta categoría">
        <span class="insight-icon" style="background:${insights.topCategory.color}20;">${insights.topCategory.icon}</span>
        <div class="insight-info">
          <div class="insight-label">Top gasto: ${escHtml(insights.topCategory.name)}</div>
          <div class="insight-sub">${formatCurrency(insights.topCategory.total)} · ${insights.topCategory.count} movimiento${insights.topCategory.count !== 1 ? "s" : ""}</div>
        </div>
      </div>`);
  }

  if (insights.biggestExpense) {
    cards.push(`
      <div class="insight-card">
        <span class="insight-icon">💸</span>
        <div class="insight-info">
          <div class="insight-label">Mayor gasto: ${escHtml(insights.biggestExpense.description || "Sin descripción")}</div>
          <div class="insight-sub">${formatCurrency(insights.biggestExpense.amount)} · ${escHtml(insights.biggestExpense.category_name)} · ${formatDate(insights.biggestExpense.date)}</div>
        </div>
      </div>`);
  }

  cards.push(`
    <div class="insight-card">
      <span class="insight-icon">📆</span>
      <div class="insight-info">
        <div class="insight-label">Gasto diario promedio</div>
        <div class="insight-sub">${formatCurrency(insights.avgDailyExpense)} / día · proyectado ${formatCurrency(insights.projectedMonthlyExpense)} al mes</div>
      </div>
    </div>`);

  cards.push(`
    <div class="insight-card">
      <span class="insight-icon">📉</span>
      <div class="insight-info">
        <div class="insight-label">Gastos ${vsExp > 0 ? "subieron" : vsExp < 0 ? "bajaron" : "estables"} <span class="insight-sub ${expClass}">${vsExp > 0 ? "+" : ""}${vsExp}%</span></div>
        <div class="insight-sub">vs ${formatMonthLabel(insights.prevMonth)}</div>
      </div>
    </div>
    <div class="insight-card">
      <span class="insight-icon">📈</span>
      <div class="insight-info">
        <div class="insight-label">Ingresos ${vsInc > 0 ? "subieron" : vsInc < 0 ? "bajaron" : "estables"} <span class="insight-sub ${incClass}">${vsInc > 0 ? "+" : ""}${vsInc}%</span></div>
        <div class="insight-sub">vs ${formatMonthLabel(insights.prevMonth)}</div>
      </div>
    </div>`);

  strip.innerHTML = cards.join("");
}

function filterCategory(id) {
  currentCategoryFilter = String(id);
  goToTransactions();
}

function renderCategoryChart(data) {
  const container = document.getElementById("categoryChart").parentElement;
  const canvas = document.getElementById("categoryChart");
  const ctx = canvas.getContext("2d");

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }

  if (!data.categories || data.categories.length === 0) {
    container.innerHTML = '<div class="no-data"><span class="no-data-icon">📊</span>Sin datos para mostrar</div>';
    return;
  }

  container.innerHTML = '<canvas id="categoryChart"></canvas>';
  const newCtx = document.getElementById("categoryChart");

  const chartData = {
    labels: data.categories.map((c) => `${c.icon} ${c.name}`),
    datasets: [
      {
        data: data.categories.map((c) => c.total),
        backgroundColor: data.categories.map((c) => c.color),
        borderWidth: 2,
        borderColor: "#ffffff",
      },
    ],
  };

  categoryChartInstance = new Chart(newCtx, {
    type: "doughnut",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          const cat = data.categories[idx];
          filterCategory(cat.id);
        }
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 10,
            font: { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ti) => {
              const cat = data.categories[ti.dataIndex];
              return `${cat.name}: ${formatCurrency(cat.total)} (${cat.percentage}%)`;
            },
          },
        },
      },
    },
  });
}

function renderTrendChart(data) {
  const container = document.getElementById("trendChart").parentElement;
  const ctx = container.querySelector("canvas");

  if (trendChartInstance) {
    trendChartInstance.destroy();
    trendChartInstance = null;
  }

  if (!data.months || data.months.length === 0) {
    container.innerHTML = '<div class="no-data"><span class="no-data-icon">📈</span>Sin datos para mostrar</div>';
    return;
  }

  const labels = data.months.map((m) => formatMonthLabel(m.month));

  trendChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Ingresos",
          data: data.months.map((m) => m.income),
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.1)",
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: "Gastos",
          data: data.months.map((m) => m.expenses),
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.1)",
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: "Ahorro",
          data: data.months.map((m) => m.savings),
          borderColor: "#6366f1",
          backgroundColor: "rgba(99,102,241,0.05)",
          fill: false,
          tension: 0.4,
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyleWidth: 10, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: (ti) => `${ti.dataset.label}: ${formatCurrency(ti.parsed.y)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (val) => formatCurrency(val), font: { size: 11 } },
          grid: { color: "rgba(128,128,128,0.12)" },
        },
        x: {
          ticks: { font: { size: 11 } },
          grid: { display: false },
        },
      },
    },
  });
}

function renderProjection(data) {
  const container = document.getElementById("projectionContent");

  if (!data || (data.projectedExpenses === 0 && data.projectedIncome === 0)) {
    container.innerHTML = '<div class="no-data"><span class="no-data-icon">🔮</span>No hay suficientes datos para proyectar</div>';
    return;
  }

  const trendLabels = { increasing: "↑ En aumento", decreasing: "↓ En descenso", stable: "→ Estable" };
  const trendBadgeClass = { increasing: "trend-increasing", decreasing: "trend-decreasing", stable: "trend-stable" };

  let categoryProjectionsHTML = "";
  if (data.categoryProjections && data.categoryProjections.length > 0) {
    const maxProj = Math.max(...data.categoryProjections.map((c) => c.projected));
    categoryProjectionsHTML = `
      <div class="proj-section">
        <strong class="proj-section-title">Por categoría:</strong>
        <div class="category-projection-list">
          ${data.categoryProjections
            .slice(0, 5)
            .map(
              (cat) => `
            <div class="cat-proj-item">
              <span class="cat-proj-icon">${cat.icon}</span>
              <span class="cat-proj-name">${escHtml(cat.name)}</span>
              <div class="cat-proj-bar">
                <div class="cat-proj-bar-fill" style="width:${maxProj > 0 ? (cat.projected / maxProj) * 100 : 0}%; background:${cat.color};"></div>
              </div>
              <span class="cat-proj-amount">${formatCurrency(cat.projected)}</span>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="projection-header">
      <div>
        <div class="projection-amount">${formatCurrency(data.projectedExpenses)}</div>
        <div class="projection-label">Gasto estimado ${formatMonthLabel(data.projectedMonth)}</div>
      </div>
      <span class="trend-badge ${trendBadgeClass[data.trend] || ""}">${trendLabels[data.trend] || data.trend || ""}</span>
    </div>
    <div class="projection-details">
      <div class="projection-detail">
        <span class="projection-detail-label">Ingreso estimado</span>
        <span class="projection-detail-value">${formatCurrency(data.projectedIncome)}</span>
      </div>
      <div class="projection-detail">
        <span class="projection-detail-label">Ahorro estimado</span>
        <span class="projection-detail-value" style="color:${data.projectedSavings >= 0 ? "var(--success)" : "var(--danger)"}">
          ${formatCurrency(data.projectedSavings)}
        </span>
      </div>
    </div>
    <div class="projection-meta">
      <span class="badge badge-info">Confianza: ${data.confidence}</span>
    </div>
    ${categoryProjectionsHTML}
  `;
}

function renderAlerts(alerts) {
  const container = document.getElementById("alertsList");
  const badge = document.getElementById("alertsCount");

  const list = alerts || [];

  if (list.length > 0) {
    badge.textContent = list.length;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="no-data"><span class="no-data-icon">✅</span>No hay alertas por ahora</div>';
    return;
  }

  const severityIcons = { danger: "🚨", warning: "⚠️", info: "ℹ️" };

  container.innerHTML = list
    .map(
      (alert) => `
    <div class="alert-item severity-${alert.severity}" data-id="${alert.id}">
      <span class="alert-icon">${severityIcons[alert.severity] || "ℹ️"}</span>
      <div class="alert-content">
        <div class="alert-title">${escHtml(alert.title)}</div>
        <div class="alert-message">${escHtml(alert.message)}</div>
      </div>
      <div class="alert-actions">
        <button class="alert-btn" onclick="dismissAlert(${alert.id})" title="Ocultar">✕</button>
      </div>
    </div>
  `
    )
    .join("");
}

async function dismissAlert(id) {
  try {
    await api(`/api/dashboard/alerts/${id}`, { method: "DELETE" });
    const el = document.querySelector(`.alert-item[data-id="${id}"]`);
    if (el) {
      el.style.opacity = "0";
      el.style.transform = "translateX(20px)";
      el.style.transition = "all 0.3s ease";
      setTimeout(() => el.remove(), 300);
    }
    const badge = document.getElementById("alertsCount");
    const count = document.querySelectorAll(".alert-item").length;
    badge.textContent = count;
    badge.hidden = count === 0;
  } catch (err) {
    console.error(err);
  }
}

async function loadRecentTransactions() {
  try {
    const data = await api("/api/transactions?limit=5");
    const container = document.getElementById("recentTransactions");

    if (!data.transactions || data.transactions.length === 0) {
      container.innerHTML = '<div class="no-data"><span class="no-data-icon">📝</span>No hay transacciones recientes</div>';
      return;
    }

    container.innerHTML = data.transactions
      .map(
        (tx) => `
      <div class="recent-tx-item" onclick="goToTransactions()">
        <div class="recent-tx-icon" style="background:${tx.category_color}20;">${tx.category_icon}</div>
        <div class="recent-tx-info">
          <div class="recent-tx-desc">${escHtml(tx.description)}</div>
          <div class="recent-tx-cat">${escHtml(tx.category_name)} · ${formatDate(tx.date)}</div>
        </div>
        <div class="recent-tx-tag type-${tx.type}">${tx.type === "income" ? "Ingreso" : "Gasto"}</div>
        <div class="recent-tx-amount ${tx.type}">
          ${tx.type === "income" ? "+" : "-"}${formatCurrency(tx.amount)}
        </div>
      </div>
    `
      )
      .join("");
  } catch (err) {
    console.error(err);
  }
}