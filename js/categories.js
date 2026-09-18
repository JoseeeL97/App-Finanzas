async function loadCategories(type = "") {
  try {
    const url = type ? `/api/categories?type=${type}` : "/api/categories";
    const categories = await api(url);
    renderCategoryGrid(categories);
  } catch (err) {
    console.error(err);
  }
}

function renderCategoryGrid(categories) {
  const grid = document.getElementById("categoriesGrid");

  if (!categories || categories.length === 0) {
    grid.innerHTML = '<div class="no-data" style="grid-column:1/-1;"><span class="no-data-icon">📁</span>No hay categorías</div>';
    return;
  }

  grid.innerHTML = categories
    .map(
      (cat) => `
      <div class="category-card" style="border-left-color: ${cat.color};">
        <div class="category-icon" style="background: ${cat.color}15;">${cat.icon}</div>
        <div class="category-info">
          <div class="category-name">${escHtml(cat.name)}</div>
          <div class="category-meta">
            ${cat.type === "income" ? "Ingreso" : "Gasto"} · ${cat.transaction_count} transacción${cat.transaction_count !== 1 ? "es" : ""}
          </div>
        </div>
        <div class="category-type-pill ${cat.type}">${cat.type === "income" ? "💰" : "💸"}</div>
        <div class="category-actions">
          <button class="action-btn" onclick="editCategory(${cat.id})" title="Editar">✏️</button>
          <button class="action-btn delete" onclick="deleteCategory(${cat.id}, '${escHtml(cat.name).replace(/'/g, "\\'")}')" title="Eliminar">🗑️</button>
        </div>
      </div>
    `
    )
    .join("");
}

function filterCategoryType(btn, type) {
  document.querySelectorAll(".section-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  currentCategoryFilter = type;
  loadCategories(type);
}

function initIconPicker() {
  const picker = document.getElementById("iconPicker");
  picker.innerHTML = ICONS.map(
    (icon) => `<div class="icon-option${icon === "📁" ? " selected" : ""}" data-icon="${icon}" onclick="selectIcon(this)">${icon}</div>`
  ).join("");
}

function selectIcon(el) {
  document.querySelectorAll(".icon-option").forEach((o) => o.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("catIcon").value = el.dataset.icon;
}

function initColorPicker() {
  const picker = document.getElementById("colorPicker");
  picker.innerHTML = COLORS.map(
    (color) =>
      `<div class="color-option${color === "#6366f1" ? " selected" : ""}" data-color="${color}" style="background:${color}" onclick="selectColor(this)"></div>`
  ).join("");
}

function selectColor(el) {
  document.querySelectorAll(".color-option").forEach((o) => o.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("catColor").value = el.dataset.color;
}

function setCatFormType(btn) {
  const type = btn.dataset.type;
  document.getElementById("catType").value = type;
  document.querySelectorAll("#categoryModal .type-option").forEach((b) => {
    b.classList.toggle("active", b.dataset.type === type);
  });
}

function openCategoryModal(cat = null) {
  const modal = document.getElementById("categoryModal");
  const form = document.getElementById("categoryForm");
  const title = document.getElementById("catModalTitle");

  form.reset();
  document.getElementById("catId").value = "";

  initIconPicker();
  initColorPicker();

  if (cat) {
    title.textContent = "Editar Categoría";
    document.getElementById("catId").value = cat.id;
    setCatFormType({ dataset: { type: cat.type } });
    document.getElementById("catName").value = cat.name;
    document.getElementById("catIcon").value = cat.icon;
    document.getElementById("catColor").value = cat.color;

    const iconEl = document.querySelector(`.icon-option[data-icon="${cat.icon}"]`);
    if (iconEl) {
      document.querySelectorAll(".icon-option").forEach((o) => o.classList.remove("selected"));
      iconEl.classList.add("selected");
    }
    const colorEl = document.querySelector(`.color-option[data-color="${cat.color}"]`);
    if (colorEl) {
      document.querySelectorAll(".color-option").forEach((o) => o.classList.remove("selected"));
      colorEl.classList.add("selected");
    }
  } else {
    title.textContent = "Nueva Categoría";
    setCatFormType({ dataset: { type: "expense" } });
  }

  modal.classList.add("active");
}

function closeCategoryModal() {
  document.getElementById("categoryModal").classList.remove("active");
}

async function handleCategorySubmit(e) {
  e.preventDefault();

  const id = document.getElementById("catId").value;
  const data = {
    name: document.getElementById("catName").value,
    type: document.getElementById("catType").value,
    icon: document.getElementById("catIcon").value,
    color: document.getElementById("catColor").value,
  };

  try {
    if (id) {
      await api(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(data) });
      showToast("Categoría actualizada");
    } else {
      await api("/api/categories", { method: "POST", body: JSON.stringify(data) });
      showToast("Categoría creada");
    }
    closeCategoryModal();
    loadCategories(currentCategoryFilter);
    await refreshAfterSave();
  } catch (err) {
    console.error(err);
  }
}

async function editCategory(id) {
  try {
    const cat = await api(`/api/categories/${id}`);
    openCategoryModal(cat);
  } catch (err) {
    console.error(err);
  }
}

function deleteCategory(id, name) {
  showConfirm(`¿Eliminar la categoría "${name}"?`, async () => {
    try {
      await api(`/api/categories/${id}`, { method: "DELETE" });
      showToast("Categoría eliminada");
      loadCategories(currentCategoryFilter);
      await refreshAfterSave();
    } catch (err) {
      console.error(err);
    }
  });
}