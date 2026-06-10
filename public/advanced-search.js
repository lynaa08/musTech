/**
 * Advanced Search Component for Mus Tech
 * Include this script in your HTML after the API loading
 * 
 * Usage:
 * <div id="advanced-search-container"></div>
 * <script src="/advanced-search.js"></script>
 * <script>
 *   AdvancedSearch.init({
 *     containerId: 'advanced-search-container',
 *     resultsContainerId: 'search-results',
 *     onProductsLoaded: (products) => { ... }
 *   });
 * </script>
 */

const AdvancedSearch = (() => {
  let config = {
    containerId: "advanced-search-container",
    resultsContainerId: "search-results",
    onProductsLoaded: null,
  };

  let state = {
    query: "",
    minPrice: 0,
    maxPrice: 100000,
    selectedCategories: [],
    inStock: false,
    sort: "newest",
    currentPage: 0,
    pageSize: 20,
  };

  let categories = [];
  let priceRange = { min: 0, max: 100000 };

  // ── FETCH CATEGORIES ──────────────────────────────────
  async function loadCategories() {
    try {
      const response = await fetch("/api/products/categories/all");
      categories = await response.json();
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  }

  // ── FETCH PRICE RANGE ─────────────────────────────────
  async function loadPriceRange() {
    try {
      const response = await fetch("/api/search/price-range");
      priceRange = await response.json();
      state.minPrice = priceRange.min;
      state.maxPrice = priceRange.max;
    } catch (error) {
      console.error("Failed to load price range:", error);
    }
  }

  // ── SEARCH PRODUCTS ───────────────────────────────────
  async function searchProducts() {
    try {
      const params = new URLSearchParams();

      if (state.query) params.append("q", state.query);
      params.append("minPrice", state.minPrice);
      params.append("maxPrice", state.maxPrice);

      if (state.selectedCategories.length > 0) {
        params.append("categories", state.selectedCategories.join(","));
      }

      if (state.inStock) params.append("inStock", "true");

      params.append("sort", state.sort);
      params.append("limit", state.pageSize);
      params.append("offset", state.currentPage * state.pageSize);

      const response = await fetch(`/api/search/advanced?${params.toString()}`);
      const data = await response.json();

      if (config.onProductsLoaded) {
        config.onProductsLoaded(data);
      }

      displayResults(data);
    } catch (error) {
      console.error("Search error:", error);
    }
  }

  // ── DISPLAY RESULTS ───────────────────────────────────
  function displayResults(data) {
    const container = document.getElementById(config.resultsContainerId);
    if (!container) return;

    if (data.products.length === 0) {
      container.innerHTML =
        '<div class="no-results">❌ Aucun produit trouvé</div>';
      return;
    }

    let html = `<div class="search-results-header">
      <span class="result-count">${data.total} résultats trouvés</span>
    </div>
    <div class="products-grid">`;

    data.products.forEach((product) => {
      html += renderProductCard(product);
    });

    html += "</div>";

    // Pagination
    if (data.total > state.pageSize) {
      html += `<div class="pagination">`;
      const totalPages = Math.ceil(data.total / state.pageSize);

      for (let i = 0; i < totalPages; i++) {
        const isActive = i === state.currentPage ? "active" : "";
        html += `<button class="page-btn ${isActive}" data-page="${i}">${i + 1}</button>`;
      }

      html += `</div>`;
    }

    container.innerHTML = html;

    // Add pagination listeners
    document
      .querySelectorAll(".page-btn")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          state.currentPage = parseInt(e.target.dataset.page);
          searchProducts();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });
  }

  // ── RENDER PRODUCT CARD ───────────────────────────────
  function renderProductCard(product) {
    const img = product.img || product.images?.[0] || "/placeholder.jpg";
    const discount = product.oldPrice
      ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
      : 0;

    return `
      <div class="product-card">
        <div class="product-image">
          <img src="${img}" alt="${product.name}" />
          ${product.badge ? `<span class="badge">${product.badge}</span>` : ""}
          ${discount > 0 ? `<span class="discount">-${discount}%</span>` : ""}
        </div>
        <div class="product-info">
          <h3>${product.name}</h3>
          <p class="category">${product.cat}</p>
          <div class="price-section">
            <span class="price">${product.price.toLocaleString()} DA</span>
            ${product.oldPrice ? `<span class="old-price">${product.oldPrice.toLocaleString()} DA</span>` : ""}
          </div>
          <p class="stock ${product.status === "out_of_stock" ? "out" : "in"}">
            ${product.status === "out_of_stock" ? "❌ Rupture" : `✅ ${product.stock} en stock`}
          </p>
          <button class="add-to-cart-btn" data-id="${product.id}">
            🛒 Ajouter au panier
          </button>
        </div>
      </div>
    `;
  }

  // ── RENDER SEARCH INTERFACE ───────────────────────────
  function renderSearchUI() {
    const container = document.getElementById(config.containerId);
    if (!container) return;

    let html = `
    <div class="advanced-search">
      <div class="search-header">
        <h2>🔍 Recherche Avancée</h2>
      </div>

      <div class="search-container">
        <!-- SEARCH INPUT -->
        <div class="search-input-group">
          <input 
            type="text" 
            id="search-input" 
            class="search-input"
            placeholder="Rechercher par nom ou description..." 
            value="${state.query}"
          />
        </div>

        <div class="filters-section">
          <!-- PRICE RANGE -->
          <div class="filter-group">
            <h4>💰 Prix (DA)</h4>
            <div class="price-range-group">
              <div class="price-inputs">
                <input 
                  type="number" 
                  id="min-price" 
                  class="price-input"
                  placeholder="Min" 
                  value="${state.minPrice}"
                  min="${priceRange.min}"
                  max="${priceRange.max}"
                />
                <span>-</span>
                <input 
                  type="number" 
                  id="max-price" 
                  class="price-input"
                  placeholder="Max" 
                  value="${state.maxPrice}"
                  min="${priceRange.min}"
                  max="${priceRange.max}"
                />
              </div>
              <input 
                type="range" 
                id="price-slider"
                class="price-slider"
                min="${priceRange.min}"
                max="${priceRange.max}"
                value="${state.maxPrice}"
              />
              <div class="price-label">
                ${priceRange.min.toLocaleString()} DA - ${priceRange.max.toLocaleString()} DA
              </div>
            </div>
          </div>

          <!-- CATEGORIES -->
          <div class="filter-group">
            <h4>📦 Catégories</h4>
            <div class="categories-list">
              ${categories
                .map(
                  (cat) => `
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    class="category-checkbox"
                    value="${cat.name}"
                    ${state.selectedCategories.includes(cat.name) ? "checked" : ""}
                  />
                  <span>${cat.icon} ${cat.name}</span>
                </label>
              `
                )
                .join("")}
            </div>
          </div>

          <!-- STOCK FILTER -->
          <div class="filter-group">
            <h4>📊 Stock</h4>
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                id="in-stock-filter"
                ${state.inStock ? "checked" : ""}
              />
              <span>En stock uniquement</span>
            </label>
          </div>

          <!-- SORT -->
          <div class="filter-group">
            <h4>⬆️ Trier par</h4>
            <select id="sort-select" class="sort-select">
              <option value="newest" ${state.sort === "newest" ? "selected" : ""}>Les plus récents</option>
              <option value="price_low" ${state.sort === "price_low" ? "selected" : ""}>Prix croissant</option>
              <option value="price_high" ${state.sort === "price_high" ? "selected" : ""}>Prix décroissant</option>
              <option value="rating" ${state.sort === "rating" ? "selected" : ""}>Meilleur avis</option>
            </select>
          </div>

          <!-- CLEAR FILTERS -->
          <button id="clear-filters-btn" class="clear-filters-btn">
            🔄 Réinitialiser les filtres
          </button>
        </div>
      </div>
    </div>
    `;

    container.innerHTML = html;

    // ── ADD EVENT LISTENERS ───────────────────────────────
    document.getElementById("search-input").addEventListener("input", (e) => {
      state.query = e.target.value;
      state.currentPage = 0;
      searchProducts();
    });

    document.getElementById("min-price").addEventListener("change", (e) => {
      state.minPrice = Math.max(parseInt(e.target.value) || 0, priceRange.min);
      state.currentPage = 0;
      searchProducts();
    });

    document.getElementById("max-price").addEventListener("change", (e) => {
      state.maxPrice = Math.min(
        parseInt(e.target.value) || priceRange.max,
        priceRange.max
      );
      state.currentPage = 0;
      searchProducts();
    });

    document.getElementById("price-slider").addEventListener("input", (e) => {
      state.maxPrice = parseInt(e.target.value);
      document.getElementById("max-price").value = state.maxPrice;
      state.currentPage = 0;
      searchProducts();
    });

    document
      .querySelectorAll(".category-checkbox")
      .forEach((checkbox) => {
        checkbox.addEventListener("change", (e) => {
          if (e.target.checked) {
            state.selectedCategories.push(e.target.value);
          } else {
            state.selectedCategories = state.selectedCategories.filter(
              (cat) => cat !== e.target.value
            );
          }
          state.currentPage = 0;
          searchProducts();
        });
      });

    document.getElementById("in-stock-filter").addEventListener("change", (e) => {
      state.inStock = e.target.checked;
      state.currentPage = 0;
      searchProducts();
    });

    document.getElementById("sort-select").addEventListener("change", (e) => {
      state.sort = e.target.value;
      state.currentPage = 0;
      searchProducts();
    });

    document
      .getElementById("clear-filters-btn")
      .addEventListener("click", clearFilters);
  }

  // ── CLEAR ALL FILTERS ─────────────────────────────────
  function clearFilters() {
    state.query = "";
    state.minPrice = priceRange.min;
    state.maxPrice = priceRange.max;
    state.selectedCategories = [];
    state.inStock = false;
    state.sort = "newest";
    state.currentPage = 0;
    renderSearchUI();
    searchProducts();
  }

  // ── INITIALIZE ────────────────────────────────────────
  async function init(customConfig) {
    Object.assign(config, customConfig);
    await loadCategories();
    await loadPriceRange();
    renderSearchUI();
    searchProducts();
  }

  return { init, clearFilters };
})();
