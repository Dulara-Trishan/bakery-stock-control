const STORAGE_KEY = 'bakery-stock-control-v1';

const state = loadState();

const els = {
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.tab-panel'),
  materialForm: document.getElementById('materialForm'),
  productForm: document.getElementById('productForm'),
  recipeForm: document.getElementById('recipeForm'),
  productionForm: document.getElementById('productionForm'),
  materialId: document.getElementById('materialId'),
  materialName: document.getElementById('materialName'),
  materialUnit: document.getElementById('materialUnit'),
  materialStock: document.getElementById('materialStock'),
  materialMin: document.getElementById('materialMin'),
  materialTarget: document.getElementById('materialTarget'),
  productId: document.getElementById('productId'),
  productName: document.getElementById('productName'),
  recipeProduct: document.getElementById('recipeProduct'),
  recipeMaterial: document.getElementById('recipeMaterial'),
  recipeQty: document.getElementById('recipeQty'),
  productionProduct: document.getElementById('productionProduct'),
  productionQty: document.getElementById('productionQty'),
  materialsBody: document.getElementById('materialsBody'),
  productsBody: document.getElementById('productsBody'),
  recipeCards: document.getElementById('recipeCards'),
  usagePreview: document.getElementById('usagePreview'),
  dashboardStockBody: document.getElementById('dashboardStockBody'),
  productionLogBody: document.getElementById('productionLogBody'),
  statMaterials: document.getElementById('statMaterials'),
  statLow: document.getElementById('statLow'),
  statProducts: document.getElementById('statProducts'),
  statRefill: document.getElementById('statRefill'),
  clearMaterialBtn: document.getElementById('clearMaterialBtn'),
  clearProductBtn: document.getElementById('clearProductBtn'),
  resetBtn: document.getElementById('resetBtn'),
  seedBtn: document.getElementById('seedBtn'),
};

bindEvents();
renderAll();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : { materials: [], products: [], recipes: [], productionLogs: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function id() {
  return Math.random().toString(36).slice(2, 10);
}

function bindEvents() {
  els.tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

  els.materialForm.addEventListener('submit', e => {
    e.preventDefault();
    const payload = {
      id: els.materialId.value || id(),
      name: els.materialName.value.trim(),
      unit: els.materialUnit.value.trim(),
      stock: Number(els.materialStock.value),
      minLimit: Number(els.materialMin.value),
      refillTarget: Number(els.materialTarget.value),
    };
    const index = state.materials.findIndex(m => m.id === payload.id);
    if (index >= 0) state.materials[index] = payload;
    else state.materials.push(payload);
    saveState();
    clearMaterialForm();
    renderAll();
  });

  els.productForm.addEventListener('submit', e => {
    e.preventDefault();
    const payload = { id: els.productId.value || id(), name: els.productName.value.trim() };
    const index = state.products.findIndex(p => p.id === payload.id);
    if (index >= 0) state.products[index] = payload;
    else state.products.push(payload);
    saveState();
    clearProductForm();
    renderAll();
  });

  els.recipeForm.addEventListener('submit', e => {
    e.preventDefault();
    const recipe = {
      id: id(),
      productId: els.recipeProduct.value,
      materialId: els.recipeMaterial.value,
      qtyPerUnit: Number(els.recipeQty.value),
    };
    const exists = state.recipes.find(r => r.productId === recipe.productId && r.materialId === recipe.materialId);
    if (exists) {
      exists.qtyPerUnit = recipe.qtyPerUnit;
    } else {
      state.recipes.push(recipe);
    }
    saveState();
    els.recipeForm.reset();
    renderAll();
  });

  els.productionForm.addEventListener('submit', e => {
    e.preventDefault();
    const productId = els.productionProduct.value;
    const qty = Number(els.productionQty.value);
    const product = state.products.find(p => p.id === productId);
    const recipeItems = state.recipes.filter(r => r.productId === productId);

    if (!product) return alert('Please select a product.');
    if (!recipeItems.length) return alert('This product has no recipe items yet.');

    const shortages = [];
    recipeItems.forEach(item => {
      const material = state.materials.find(m => m.id === item.materialId);
      const required = item.qtyPerUnit * qty;
      if (!material || material.stock < required) {
        shortages.push(`${material?.name || 'Unknown'} needs ${required} ${material?.unit || ''}`);
      }
    });

    if (shortages.length) {
      alert('Not enough stock for this production:\n\n' + shortages.join('\n'));
      return;
    }

    recipeItems.forEach(item => {
      const material = state.materials.find(m => m.id === item.materialId);
      material.stock = round(material.stock - (item.qtyPerUnit * qty));
    });

    state.productionLogs.unshift({
      id: id(),
      productId,
      qty,
      timestamp: new Date().toISOString(),
    });
    state.productionLogs = state.productionLogs.slice(0, 100);

    saveState();
    els.productionForm.reset();
    updateUsagePreview();
    renderAll();
    switchTab('dashboard');
  });

  els.productionProduct.addEventListener('change', updateUsagePreview);
  els.productionQty.addEventListener('input', updateUsagePreview);
  els.clearMaterialBtn.addEventListener('click', clearMaterialForm);
  els.clearProductBtn.addEventListener('click', clearProductForm);
  els.resetBtn.addEventListener('click', resetAll);
  els.seedBtn.addEventListener('click', seedData);
}

function switchTab(tabId) {
  els.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  els.panels.forEach(p => p.classList.toggle('active', p.id === tabId));
}

function renderAll() {
  renderMaterialOptions();
  renderProductOptions();
  renderMaterialsTable();
  renderProductsTable();
  renderRecipes();
  renderDashboard();
  renderLogs();
  updateUsagePreview();
}

function renderMaterialOptions() {
  const options = ['<option value="">Select material</option>']
    .concat(state.materials.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${m.unit})</option>`))
    .join('');
  els.recipeMaterial.innerHTML = options;
}

function renderProductOptions() {
  const options = ['<option value="">Select product</option>']
    .concat(state.products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`))
    .join('');
  els.recipeProduct.innerHTML = options;
  els.productionProduct.innerHTML = options;
}

function renderMaterialsTable() {
  if (!state.materials.length) {
    els.materialsBody.innerHTML = `<tr><td colspan="6" class="muted">No materials added yet.</td></tr>`;
    return;
  }
  els.materialsBody.innerHTML = state.materials.map(material => {
    const refillNeed = Math.max(0, round(material.refillTarget - material.stock));
    return `
      <tr>
        <td>${escapeHtml(material.name)}<br><span class="muted">${escapeHtml(material.unit)}</span></td>
        <td>${material.stock} ${escapeHtml(material.unit)}</td>
        <td>${material.minLimit} ${escapeHtml(material.unit)}</td>
        <td>${material.refillTarget} ${escapeHtml(material.unit)}</td>
        <td>${badge(material)}</td>
        <td>
          <div class="inline-actions">
            <button onclick="editMaterial('${material.id}')">Edit</button>
            <button class="danger" onclick="deleteMaterial('${material.id}')">Delete</button>
          </div>
          <div class="muted">Refill: ${refillNeed} ${escapeHtml(material.unit)}</div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderProductsTable() {
  if (!state.products.length) {
    els.productsBody.innerHTML = `<tr><td colspan="3" class="muted">No products added yet.</td></tr>`;
    return;
  }
  els.productsBody.innerHTML = state.products.map(product => {
    const count = state.recipes.filter(r => r.productId === product.id).length;
    return `
      <tr>
        <td>${escapeHtml(product.name)}</td>
        <td>${count}</td>
        <td>
          <div class="inline-actions">
            <button onclick="editProduct('${product.id}')">Edit</button>
            <button class="danger" onclick="deleteProduct('${product.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderRecipes() {
  if (!state.products.length) {
    els.recipeCards.innerHTML = `<div class="empty-state">Add products first.</div>`;
    return;
  }
  els.recipeCards.innerHTML = state.products.map(product => {
    const items = state.recipes.filter(r => r.productId === product.id);
    const body = items.length ? `<ul>${items.map(item => {
      const material = state.materials.find(m => m.id === item.materialId);
      return `<li>${escapeHtml(material?.name || 'Unknown')} - ${item.qtyPerUnit} ${escapeHtml(material?.unit || '')}
        <button class="danger" style="margin-left:8px" onclick="deleteRecipe('${item.id}')">Remove</button>
      </li>`;
    }).join('')}</ul>` : `<div class="muted">No recipe items added yet.</div>`;
    return `<div class="recipe-box"><h3>${escapeHtml(product.name)}</h3>${body}</div>`;
  }).join('');
}

function renderDashboard() {
  const lowItems = state.materials.filter(m => m.stock <= m.minLimit);
  const refillItems = state.materials.filter(m => m.stock < m.refillTarget);

  els.statMaterials.textContent = state.materials.length;
  els.statLow.textContent = lowItems.length;
  els.statProducts.textContent = state.products.length;
  els.statRefill.textContent = refillItems.length;

  if (!state.materials.length) {
    els.dashboardStockBody.innerHTML = `<tr><td colspan="6" class="muted">No stock data available.</td></tr>`;
    return;
  }

  els.dashboardStockBody.innerHTML = state.materials.map(material => {
    const needToFill = Math.max(0, round(material.refillTarget - material.stock));
    return `
      <tr>
        <td>${escapeHtml(material.name)}</td>
        <td>${material.stock} ${escapeHtml(material.unit)}</td>
        <td>${material.minLimit} ${escapeHtml(material.unit)}</td>
        <td>${material.refillTarget} ${escapeHtml(material.unit)}</td>
        <td>${needToFill} ${escapeHtml(material.unit)}</td>
        <td>${badge(material)}</td>
      </tr>
    `;
  }).join('');
}

function renderLogs() {
  if (!state.productionLogs.length) {
    els.productionLogBody.innerHTML = `<tr><td colspan="3" class="muted">No production processed yet.</td></tr>`;
    return;
  }
  els.productionLogBody.innerHTML = state.productionLogs.map(log => {
    const product = state.products.find(p => p.id === log.productId);
    const time = new Date(log.timestamp).toLocaleString();
    return `
      <tr>
        <td>${time}</td>
        <td>${escapeHtml(product?.name || 'Unknown')}</td>
        <td>${log.qty}</td>
      </tr>
    `;
  }).join('');
}

function updateUsagePreview() {
  const productId = els.productionProduct.value;
  const qty = Number(els.productionQty.value || 0);
  if (!productId || !qty) {
    els.usagePreview.innerHTML = 'Select a product and quantity to see required materials.';
    return;
  }
  const recipeItems = state.recipes.filter(r => r.productId === productId);
  if (!recipeItems.length) {
    els.usagePreview.innerHTML = 'This product has no recipe setup yet.';
    return;
  }
  const items = recipeItems.map(item => {
    const material = state.materials.find(m => m.id === item.materialId);
    const required = round(item.qtyPerUnit * qty);
    const balanceAfter = material ? round(material.stock - required) : 0;
    return `<li>${escapeHtml(material?.name || 'Unknown')} - Required: <strong>${required} ${escapeHtml(material?.unit || '')}</strong> | Current: ${material?.stock ?? 0} | After production: ${balanceAfter}</li>`;
  }).join('');
  els.usagePreview.innerHTML = `<ul class="usage-list">${items}</ul>`;
}

function badge(material) {
  if (material.stock <= material.minLimit / 2) {
    return `<span class="badge critical">Critical</span>`;
  }
  if (material.stock <= material.minLimit) {
    return `<span class="badge low">Low</span>`;
  }
  return `<span class="badge ok">Good</span>`;
}

function clearMaterialForm() {
  els.materialForm.reset();
  els.materialId.value = '';
}

function clearProductForm() {
  els.productForm.reset();
  els.productId.value = '';
}

function resetAll() {
  if (!confirm('Delete all materials, products, recipes and logs?')) return;
  state.materials = [];
  state.products = [];
  state.recipes = [];
  state.productionLogs = [];
  saveState();
  renderAll();
}

function seedData() {
  if (!confirm('Load sample bakery data? Existing data will be replaced.')) return;
  state.materials = [
    { id: id(), name: 'Flour', unit: 'kg', stock: 100, minLimit: 40, refillTarget: 100 },
    { id: id(), name: 'Sugar', unit: 'kg', stock: 40, minLimit: 20, refillTarget: 50 },
    { id: id(), name: 'Butter', unit: 'kg', stock: 25, minLimit: 10, refillTarget: 30 },
    { id: id(), name: 'Eggs', unit: 'pcs', stock: 200, minLimit: 80, refillTarget: 250 },
  ];
  state.products = [
    { id: id(), name: 'Cake' },
    { id: id(), name: 'Bun' },
  ];
  state.recipes = [];
  const flour = state.materials.find(m => m.name === 'Flour').id;
  const sugar = state.materials.find(m => m.name === 'Sugar').id;
  const butter = state.materials.find(m => m.name === 'Butter').id;
  const eggs = state.materials.find(m => m.name === 'Eggs').id;
  const cake = state.products.find(p => p.name === 'Cake').id;
  const bun = state.products.find(p => p.name === 'Bun').id;
  state.recipes.push(
    { id: id(), productId: cake, materialId: flour, qtyPerUnit: 1 },
    { id: id(), productId: cake, materialId: sugar, qtyPerUnit: 0.4 },
    { id: id(), productId: cake, materialId: butter, qtyPerUnit: 0.2 },
    { id: id(), productId: cake, materialId: eggs, qtyPerUnit: 4 },
    { id: id(), productId: bun, materialId: flour, qtyPerUnit: 0.15 },
    { id: id(), productId: bun, materialId: sugar, qtyPerUnit: 0.03 }
  );
  state.productionLogs = [];
  saveState();
  renderAll();
}

function round(num) {
  return Math.round(num * 1000) / 1000;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

window.editMaterial = function(materialId) {
  const material = state.materials.find(m => m.id === materialId);
  if (!material) return;
  switchTab('materials');
  els.materialId.value = material.id;
  els.materialName.value = material.name;
  els.materialUnit.value = material.unit;
  els.materialStock.value = material.stock;
  els.materialMin.value = material.minLimit;
  els.materialTarget.value = material.refillTarget;
};

window.deleteMaterial = function(materialId) {
  if (!confirm('Delete this material?')) return;
  state.materials = state.materials.filter(m => m.id !== materialId);
  state.recipes = state.recipes.filter(r => r.materialId !== materialId);
  saveState();
  renderAll();
};

window.editProduct = function(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;
  switchTab('products');
  els.productId.value = product.id;
  els.productName.value = product.name;
};

window.deleteProduct = function(productId) {
  if (!confirm('Delete this product?')) return;
  state.products = state.products.filter(p => p.id !== productId);
  state.recipes = state.recipes.filter(r => r.productId !== productId);
  state.productionLogs = state.productionLogs.filter(l => l.productId !== productId);
  saveState();
  renderAll();
};

window.deleteRecipe = function(recipeId) {
  if (!confirm('Remove this recipe item?')) return;
  state.recipes = state.recipes.filter(r => r.id !== recipeId);
  saveState();
  renderAll();
};
