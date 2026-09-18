function setTxTab(btn) {
  currentTxType = btn.dataset.txFilter || "";
  document.querySelectorAll(".ftab").forEach((b) => {
    b.classList.toggle("active", b === btn);
  });
  loadTransactions();
}

function syncTxTabs() {
  document.querySelectorAll(".ftab").forEach((b) => {
    b.classList.toggle("active", (b.dataset.txFilter || "") === currentTxType);
  });
}

async function loadTransactions() {
  try {
    const params = new URLSearchParams();
    const cat = document.getElementById("filterCategory").value;
    const from = document.getElementById("filterDateFrom").value;
    const to = document.getElementById("filterDateTo").value;
    const search = document.getElementById("filterSearch").value;

    if (currentTxType) params.set("type", currentTxType);
    if (cat) params.set("category_id", cat);
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    if (search) params.set("search", search);

    const data = await api(`/api/transactions?${params.toString()}`);
    renderTxSummary(data);
    renderTransactionTable(data);
  } catch (err) {
    console.error(err);
  }
}

function renderTxSummary(data) {
  const income = (data.transactions || []).filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = (data.transactions || []).filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = income - expenses;

  document.getElementById("txSumIncome").textContent = formatCurrency(income);
  document.getElementById("txSumExpense").textContent = formatCurrency(expenses);
  const balEl = document.getElementById("txSumBalance");
  balEl.textContent = formatCurrency(balance);
  balEl.style.color = balance >= 0 ? "var(--success)" : "var(--danger)";
}

function renderTransactionTable(data) {
  const tbody = document.getElementById("transactionsTableBody");
  const txs = data.transactions || [];

  if (txs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="no-data">
            <span class="no-data-icon">📝</span>
            No se encontraron transacciones
          </div>
        </td>
      </tr>`;
    document.getElementById("txPagination").textContent = "0 transacciones";
    return;
  }

  tbody.innerHTML = txs
    .map((tx) => (String(tx.id) === String(editingRowId) ? renderEditableRow(tx) : renderStaticRow(tx)))
    .join("");

  document.getElementById("txPagination").textContent = `${data.total} transaccion${data.total !== 1 ? "es" : ""}`;
}

function renderStaticRow(tx) {
  return `
    <tr data-id="${tx.id}">
      <td>${formatDate(tx.date)}</td>
      <td title="${escHtml(tx.description)}">${escHtml(tx.description)}</td>
      <td>
        <span class="tx-category">
          <span class="tx-category-dot" style="background:${tx.category_color}"></span>
          ${tx.category_icon} ${escHtml(tx.category_name)}
        </span>
      </td>
      <td>
        <span class="tx-type-badge tx-type-${tx.type}">${tx.type === "income" ? "Ingreso" : "Gasto"}</span>
      </td>
      <td>
        <span class="tx-amount ${tx.type}">
          ${tx.type === "income" ? "+" : "-"}${formatCurrency(tx.amount)}
        </span>
      </td>
      <td>
        <div class="table-actions">
          <button class="action-btn" onclick="startRowEdit(${tx.id})" title="Editar en línea">✏️</button>
          <button class="action-btn" onclick="editTransaction(${tx.id})" title="Editar completo">📋</button>
          <button class="action-btn delete" onclick="deleteTransaction(${tx.id}, '${escHtml(tx.description).replace(/'/g, "\\'")}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`;
}

function renderEditableRow(tx) {
  return `
    <tr class="row-editing" data-id="${tx.id}" data-type="${tx.type}">
      <td><input type="date" class="inline-input" id="inline-date-${tx.id}" value="${tx.date}"></td>
      <td><input type="text" class="inline-input" id="inline-desc-${tx.id}" value="${escHtml(tx.description)}" maxlength="200"></td>
      <td>
        <input type="hidden" id="inline-cat-val-${tx.id}" value="${tx.category_id}">
        <select class="inline-input" id="inline-cat-${tx.id}" onchange="updateInlineCategories(${tx.id})">
          ${categoryOptionsHtml(tx.type, tx.category_id)}
        </select>
      </td>
      <td>
        <select class="inline-input" id="inline-type-${tx.id}" onchange="updateInlineCategories(${tx.id})">
          <option value="expense"${tx.type === "expense" ? " selected" : ""}>Gasto</option>
          <option value="income"${tx.type === "income" ? " selected" : ""}>Ingreso</option>
        </select>
      </td>
      <td><input type="number" class="inline-input" id="inline-amount-${tx.id}" value="${tx.amount}" min="1" step="100"></td>
      <td>
        <div class="table-actions">
          <button class="action-btn save" onclick="saveRowEdit(${tx.id})" title="Guardar">💾</button>
          <button class="action-btn cancel" onclick="cancelRowEdit()" title="Cancelar">✖️</button>
        </div>
      </td>
    </tr>`;
}

function updateInlineCategories(id) {
  const type = document.getElementById(`inline-type-${id}`).value;
  const select = document.getElementById(`inline-cat-${id}`);
  select.innerHTML = categoryOptionsHtml(type, document.getElementById(`inline-cat-val-${id}`).value);
}

function startRowEdit(id) {
  editingRowId = id;
  loadTransactionsIntoTable();
}

async function loadTransactionsIntoTable() {
  try {
    const params = new URLSearchParams();
    const cat = document.getElementById("filterCategory").value;
    const from = document.getElementById("filterDateFrom").value;
    const to = document.getElementById("filterDateTo").value;
    const search = document.getElementById("filterSearch").value;

    if (currentTxType) params.set("type", currentTxType);
    if (cat) params.set("category_id", cat);
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    if (search) params.set("search", search);

    const data = await api(`/api/transactions?${params.toString()}`);
    renderTransactionTable(data);
  } catch (err) {
    console.error(err);
  }
}

async function saveRowEdit(id) {
  const data = {
    date: document.getElementById(`inline-date-${id}`).value,
    description: document.getElementById(`inline-desc-${id}`).value,
    amount: parseFloat(document.getElementById(`inline-amount-${id}`).value),
    type: document.getElementById(`inline-type-${id}`).value,
    category_id: parseInt(document.getElementById(`inline-cat-${id}`).value, 10),
  };

  if (!data.date || !data.description || !data.amount || !data.category_id) {
    showToast("Completa todos los campos de la fila", "warning");
    return;
  }

  try {
    await api(`/api/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) });
    showToast("Transacción actualizada ✅");
    editingRowId = null;
    await refreshAfterSave();
  } catch (err) {
    console.error(err);
  }
}

function cancelRowEdit() {
  editingRowId = null;
  loadTransactionsIntoTable();
}

async function exportTransactionsCsv() {
  const params = new URLSearchParams();
  const cat = document.getElementById("filterCategory").value;
  const from = document.getElementById("filterDateFrom").value;
  const to = document.getElementById("filterDateTo").value;
  const search = document.getElementById("filterSearch").value;

  if (currentTxType) params.set("type", currentTxType);
  if (cat) params.set("category_id", cat);
  if (from) params.set("date_from", from);
  if (to) params.set("date_to", to);
  if (search) params.set("search", search);

  try {
    const res = await fetch(`/api/transactions/export.csv?${params.toString()}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transacciones.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    showToast("No se pudo exportar el CSV", "error");
  }
}

function openQuickIncome() {
  openTransactionModal(null, "income");
}

function openQuickExpense() {
  openTransactionModal(null, "expense");
}

function openTransactionModal(tx = null, presetType = null) {
  const modal = document.getElementById("transactionModal");
  const form = document.getElementById("transactionForm");
  const title = document.getElementById("txModalTitle");
  const type = presetType || (tx ? tx.type : "expense");

  form.reset();
  document.getElementById("txId").value = "";
  setTxFormTypeValue(type);

  if (tx) {
    title.textContent = "Editar Transacción";
    document.getElementById("txId").value = tx.id;
    document.getElementById("txAmount").value = tx.amount;
    document.getElementById("txDescription").value = tx.description;
    document.getElementById("txDate").value = tx.date;
    updateTxCategoryOptions();
    document.getElementById("txCategory").value = tx.category_id;
  } else {
    title.textContent = type === "income" ? "Nuevo Ingreso" : "Nuevo Gasto";
    document.getElementById("txDate").value = new Date().toISOString().split("T")[0];
    updateTxCategoryOptions();
  }

  modal.classList.add("active");
  const amount = document.getElementById("txAmount");
  if (amount) {
    requestAnimationFrame(() => amount.focus());
  }
}

function setTxFormType(btn) {
  setTxFormTypeValue(btn.dataset.type);
}

function setTxFormTypeValue(type) {
  document.getElementById("txType").value = type;
  document.querySelectorAll("#transactionModal .type-option").forEach((b) => {
    b.classList.toggle("active", b.dataset.type === type);
  });
  document.getElementById("txModalTitle").textContent =
    type === "income" ? "Nuevo Ingreso" : "Nuevo Gasto";
  updateTxCategoryOptions();
  if (document.getElementById("txId").value) {
    document.getElementById("txModalTitle").textContent = "Editar Transacción";
  }
}

function closeTransactionModal() {
  document.getElementById("transactionModal").classList.remove("active");
}

async function handleTransactionSubmit(e) {
  e.preventDefault();

  const id = document.getElementById("txId").value;
  const submitBtn = document.getElementById("txSubmitBtn");
  const data = {
    amount: parseFloat(document.getElementById("txAmount").value),
    description: document.getElementById("txDescription").value,
    type: document.getElementById("txType").value,
    category_id: parseInt(document.getElementById("txCategory").value, 10),
    date: document.getElementById("txDate").value,
  };

  const originalLabel = submitBtn ? submitBtn.textContent : "";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando…";
  }

  try {
    if (id) {
      await api(`/api/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) });
      showToast("Transacción actualizada");
    } else {
      await api("/api/transactions", { method: "POST", body: JSON.stringify(data) });
      showToast(data.type === "income" ? "Ingreso guardado 💰" : "Gasto guardado 💸");
    }
    closeTransactionModal();
    editingRowId = null;
    await refreshAfterSave();
  } catch (err) {
    console.error(err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }
}

async function editTransaction(id) {
  try {
    const tx = await api(`/api/transactions/${id}`);
    openTransactionModal(tx);
  } catch (err) {
    console.error(err);
  }
}

function deleteTransaction(id, desc) {
  showConfirm(`¿Eliminar la transacción "${desc}"?`, async () => {
    try {
      await api(`/api/transactions/${id}`, { method: "DELETE" });
      showToast("Transacción eliminada");
      await refreshAfterSave();
    } catch (err) {
      console.error(err);
    }
  });
}