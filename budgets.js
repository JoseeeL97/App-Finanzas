async function loadBudgets() {
  const month = document.getElementById("budgetMonth").value || getCurrentMonth();
  if (!document.getElementById("budgetMonth").value) {
    document.getElementById("budgetMonth").value = month;
  }

  try {
    const data = await api(`/api/budgets?month=${month}`);
    allBudgets = data.budgets;
    renderBudgetTable(data);
  } catch (err) {
    console.error(err);
  }
}

function renderBudgetTable(data) {
  const tbody = document.getElementById("budgetsTableBody");
  const budgets = data.budgets || [];

  if (budgets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="no-data">
            <span class="no-data-icon">🎯</span>
            No hay presupuestos configurados. Crea uno para controlar tus gastos por categoría.
          </div>
        </td>
      </tr>`;
    document.getElementById("budgetsPagination").textContent = "0 presupuestos";
    return;
  }

  const statusInfo = {
    exceeded: { class: "badge-danger", text: "Excedido" },
    warning: { class: "badge-warning", text: "En alerta" },
    ok: { class: "badge-success", text: "OK" },
  };

  tbody.innerHTML = budgets
    .map((b) => {
      const pct = Math.min(b.percentage, 100);
      const barColor =
        b.status === "exceeded" ? "var(--danger)" : b.status === "warning" ? "var(--warning)" : "var(--success)";
      const remainingClass = b.remaining >= 0 ? "remaining-positive" : "remaining-negative";
      const status = statusInfo[b.status] || statusInfo.ok;
      return `
      <tr>
        <td>
          <span class="tx-category">
            <span class="tx-category-dot" style="background:${b.color}"></span>
            ${b.icon} ${escHtml(b.category_name)}
          </span>
        </td>
        <td><strong>${formatCurrency(b.amount)}</strong></td>
        <td style="color:var(--danger);">${formatCurrency(b.spent)}</td>
        <td class="${remainingClass}">${formatCurrency(b.remaining)}</td>
        <td>
          <div class="budget-progress">
            <div class="budget-bar">
              <div class="budget-bar-fill" style="width:${pct}%; background:${barColor};"></div>
            </div>
            <span class="budget-pct">${b.percentage}%</span>
          </div>
        </td>
        <td><span class="badge ${status.class}">${status.text}</span></td>
        <td>
          <div class="table-actions">
            <button class="action-btn" onclick="editBudget(${b.id})" title="Editar">✏️</button>
            <button class="action-btn delete" onclick="deleteBudget(${b.id}, '${escHtml(b.category_name).replace(/'/g, "\\'")}')" title="Eliminar">🗑️</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");

  document.getElementById("budgetsPagination").textContent = `${budgets.length} presupuesto${budgets.length !== 1 ? "s" : ""}`;
}

function populateBudgetCategoryOptions() {
  const select = document.getElementById("budgetCategory");
  const current = select.value;
  select.innerHTML = '<option value="">Selecciona categoría</option>';
  const budgetedIds = new Set((allBudgets || []).map((b) => b.category_id));
  allCategories
    .filter((c) => c.type === "expense")
    .forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = `${cat.icon} ${cat.name}${budgetedIds.has(cat.id) ? " (ya tiene presupuesto)" : ""}`;
      select.appendChild(opt);
    });
  select.value = current;
}

function openBudgetModal(budget = null) {
  const modal = document.getElementById("budgetModal");
  const form = document.getElementById("budgetForm");
  const title = document.getElementById("budgetModalTitle");

  form.reset();
  document.getElementById("budgetId").value = "";
  populateBudgetCategoryOptions();

  if (budget) {
    title.textContent = "Editar Presupuesto";
    document.getElementById("budgetId").value = budget.id;
    document.getElementById("budgetCategory").value = budget.category_id;
    document.getElementById("budgetAmount").value = budget.amount;
  } else {
    title.textContent = `Nuevo Presupuesto · ${formatMonthLabel(document.getElementById("budgetMonth").value)}`;
  }

  modal.classList.add("active");
}

function closeBudgetModal() {
  document.getElementById("budgetModal").classList.remove("active");
}

async function handleBudgetSubmit(e) {
  e.preventDefault();

  const target = document.getElementById("budgetMonth").value || getCurrentMonth();
  const id = document.getElementById("budgetId").value;
  const data = {
    category_id: parseInt(document.getElementById("budgetCategory").value, 10),
    amount: parseFloat(document.getElementById("budgetAmount").value),
    month: target,
  };

  try {
    if (id) {
      await api(`/api/budgets/${id}`, { method: "PUT", body: JSON.stringify(data) });
      showToast("Presupuesto actualizado");
    } else {
      await api("/api/budgets", { method: "POST", body: JSON.stringify(data) });
      showToast("Presupuesto creado 🎯");
    }
    closeBudgetModal();
    loadBudgets();
    await refreshAfterSave();
  } catch (err) {
    console.error(err);
  }
}

function editBudget(id) {
  const budget = allBudgets.find((b) => b.id === id);
  if (budget) openBudgetModal(budget);
}

function deleteBudget(id, name) {
  showConfirm(`¿Eliminar el presupuesto de "${name}"?`, async () => {
    try {
      await api(`/api/budgets/${id}`, { method: "DELETE" });
      showToast("Presupuesto eliminado");
      loadBudgets();
      await refreshAfterSave();
    } catch (err) {
      console.error(err);
    }
  });
}