let allCategories = [];
let allBudgets = [];
let categoryChartInstance = null;
let trendChartInstance = null;
let pendingConfirmAction = null;
let currentCategoryFilter = "";
let currentTxType = "";
let editingRowId = null;

const ICONS = [
  "💰", "💵", "💳", "🏦", "📈", "💼", "🎁", "🏠", "🍔", "🍕",
  "🛒", "🚗", "🚌", "✈️", "🎮", "🎬", "📚", "💊", "🏥", "👕",
  "💡", "📱", "💻", "🎵", "🐾", "🏋️", "☕", "📦", "🔧", "🎨",
  "⚽", "🏖️", "🎄", "🎂", "📷", "📝", "🔑", "🌍"
];

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#6b7280", "#78716c", "#1f2937"
];

const LOADER_MIN_MS = 900;
const loaderStart = performance.now();

document.addEventListener("DOMContentLoaded", () => {
  const failsafe = setTimeout(hideAppLoader, 8000);
  initApp()
    .catch((err) => console.error(err))
    .finally(() => {
      clearTimeout(failsafe);
      const remaining = Math.max(0, LOADER_MIN_MS - (performance.now() - loaderStart));
      setTimeout(hideAppLoader, remaining);
    });
});

function hideAppLoader() {
  const loader = document.getElementById("appLoader");
  if (!loader || loader.classList.contains("hidden")) return;
  loader.classList.add("hidden");
  setTimeout(() => loader.remove(), 700);
}

async function initApp() {
  setupNavigation();
  setupDatePicker();
  setupFilters();
  initIconPicker();
  initColorPicker();
  setPeriodDefaults();
  setWelcome();
  initDarkMode();
  await loadAllCategories();
  loadSidebarBalance();
  navigateTo(location.hash.slice(1) || "dashboard");
}

function setupNavigation() {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      navigateTo(section);
      history.pushState(null, "", `#${section}`);
    });
  });

  window.addEventListener("popstate", () => {
    navigateTo(location.hash.slice(1) || "dashboard");
  });

  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    const sidebar = document.getElementById("sidebar");
    const toggle = document.getElementById("menuToggle");
    if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== toggle) {
      sidebar.classList.remove("open");
    }
  });
}

function setupDatePicker() {
  const now = new Date();
  document.getElementById("dateDisplay").textContent = now.toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function setWelcome() {
  const now = new Date();
  const hour = now.getHours();
  let greeting = "Buenas noches";
  if (hour < 12) greeting = "Buenos días";
  else if (hour < 19) greeting = "Buenas tardes";

  const el = document.getElementById("welcomeText");
  if (el) el.textContent = `${greeting}! 👋`;
  const sub = document.getElementById("dashSubtitle");
  if (sub) {
    sub.textContent =
      "Resumen de tus finanzas · " +
      now.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  }
}

function setPeriodDefaults() {
  const current = getCurrentMonth();
  document.getElementById("dashboardMonth").value = current;
  document.getElementById("budgetMonth").value = current;
}

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function setupFilters() {
  let debounceTimer;
  const debounce = (fn, ms = 320) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, ms);
  };

  document.getElementById("filterCategory").addEventListener("change", () => debounce(loadTransactions));
  document.getElementById("filterDateFrom").addEventListener("change", () => debounce(loadTransactions));
  document.getElementById("filterDateTo").addEventListener("change", () => debounce(loadTransactions));
  document.getElementById("filterSearch").addEventListener("input", () => debounce(loadTransactions));
  document.getElementById("budgetMonth").addEventListener("change", loadBudgets);
}

function navigateTo(section) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));

  const sectionEl = document.getElementById(`${section}-section`);
  const navEl = document.querySelector(`.nav-link[data-section="${section}"]`);

  if (sectionEl) sectionEl.classList.add("active");
  if (navEl) navEl.classList.add("active");

  const titles = {
    dashboard: "Dashboard",
    transactions: "Transacciones",
    categories: "Categorías",
    budgets: "Presupuestos",
  };
  document.getElementById("pageTitle").textContent = titles[section] || "Dashboard";

  document.getElementById("sidebar").classList.remove("open");

  switch (section) {
    case "dashboard":
      loadDashboard();
      break;
    case "transactions":
      syncTxTabs();
      loadTransactions();
      break;
    case "categories":
      loadCategories(currentCategoryFilter);
      break;
    case "budgets":
      loadBudgets();
      break;
  }
}

function goToTransactions() {
  navigateTo("transactions");
  history.pushState(null, "", "#transactions");
}

async function api(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error en la solicitud");
    return data;
  } catch (err) {
    showToast(err.message, "error");
    throw err;
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMonthLabel(monthStr) {
  if (!monthStr) return "";
  const [year, month] = monthStr.split("-");
  const date = new Date(year, month - 1);
  return date.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
}

function daysInMonth(year, month) {
  return new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
}

function prevMonthStr(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function escHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icons = { success: "✅", error: "❌", warning: "⚠️" };
  toast.innerHTML = `<span>${icons[type] || ""}</span> ${escHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

async function loadAllCategories() {
  try {
    allCategories = await api("/api/categories");
    populateFilterCategories();
    updateTxCategoryOptions();
  } catch (err) {
    console.error(err);
  }
}

function populateFilterCategories() {
  const select = document.getElementById("filterCategory");
  const current = select.value;
  select.innerHTML = '<option value="">Todas las categorías</option>';
  allCategories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = `${cat.icon} ${cat.name}`;
    select.appendChild(opt);
  });
  select.value = current;
}

function categoryOptionsHtml(type, selectedId) {
  return allCategories
    .filter((c) => c.type === type)
    .map((c) => `<option value="${c.id}"${Number(selectedId) === c.id ? " selected" : ""}>${c.icon} ${escHtml(c.name)}</option>`)
    .join("");
}

function updateTxCategoryOptions() {
  const type = document.getElementById("txType").value || "expense";
  const select = document.getElementById("txCategory");
  select.innerHTML = categoryOptionsHtml(type, select.value);
}

async function loadSidebarBalance() {
  try {
    const data = await api("/api/dashboard/summary?date_from=2000-01-01&date_to=2100-12-31");
    const el = document.getElementById("sidebarBalance");
    el.textContent = formatCurrency(data.savings);
    el.style.color = data.savings >= 0 ? "var(--success)" : "var(--danger)";
  } catch (err) {
    console.error(err);
  }
}

async function refreshAfterSave() {
  try {
    await loadTransactions();
  } catch (err) {
    console.error(err);
  }
  loadAllCategories();
  loadSidebarBalance();

  const active = document.querySelector(".section.active");
  const sectionId = active ? active.id : "";
  if (sectionId === "dashboard-section") {
    loadDashboard();
  } else if (sectionId === "budgets-section") {
    loadBudgets();
  } else if (sectionId === "categories-section") {
    loadCategories(currentCategoryFilter);
  }
}

function initDarkMode() {
  if (localStorage.getItem("finanzapp-dark") === "1") {
    document.body.classList.add("dark");
  }
}

function toggleDarkMode() {
  const on = document.body.classList.toggle("dark");
  localStorage.setItem("finanzapp-dark", on ? "1" : "0");
}

function showConfirm(message, action) {
  document.getElementById("confirmMessage").textContent = message;
  document.getElementById("confirmDialog").classList.add("active");
  pendingConfirmAction = action;
}

function closeConfirm() {
  document.getElementById("confirmDialog").classList.remove("active");
  pendingConfirmAction = null;
}

function confirmAction() {
  if (pendingConfirmAction) pendingConfirmAction();
  closeConfirm();
}