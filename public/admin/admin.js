/* ============================================
   AEON Admin Dashboard – admin.js (base64)
   ============================================ */

const TOKEN_KEY = 'aeon_admin_token';
let allProducts = [];
let allCategories = [];
let deleteTarget = null;
let editMode = false;
let isFeatured = false;
let currentTab = 'products';

// ── AUTH ─────────────────────────────────────
async function checkAuth() {
    let token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
        // Fallback: try getting token from server session (Google OAuth flow)
        try {
            const res = await fetch('/auth/admin-token');
            if (res.ok) {
                const data = await res.json();
                if (data.token) {
                    sessionStorage.setItem(TOKEN_KEY, data.token);
                    token = data.token;
                }
            }
        } catch (e) { }
    }
    if (!token) { window.location.href = '/admin/'; return; }
    loadDashboard();
}

function getToken() { return sessionStorage.getItem(TOKEN_KEY); }

function logout() {
    fetch('/api/admin/logout', { method: 'POST', headers: { 'x-admin-token': getToken() } }).catch(() => { });
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.href = '/admin/';
}

// ── API ──────────────────────────────────────
async function apiFetch(url, opts = {}) {
    const res = await fetch(url, {
        ...opts,
        headers: { 'x-admin-token': getToken(), 'Content-Type': 'application/json', ...(opts.headers || {}) }
    });
    if (res.status === 401) { window.location.href = '/admin/'; return null; }
    return res;
}

// ── INIT ─────────────────────────────────────
async function loadDashboard() {
    await Promise.all([loadProducts(), loadCategories(), loadDashStats()]);
}

async function loadDashStats() {
    try {
        const res = await fetch('/api/stats');
        if (!res.ok) return;
        const s = await res.json();
        const fmt = v => '₹' + Math.round(v).toLocaleString('en-IN');
        document.getElementById('stat-revenue').textContent = fmt(s.revenue);
        document.getElementById('stat-orders').textContent = s.totalOrders;
        document.getElementById('stat-pending').textContent = s.pending;
        document.getElementById('stat-total').textContent = s.products;
        document.getElementById('stat-users').textContent = s.users;
    } catch (e) { }
}

// ── TABS ─────────────────────────────────────
function showTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById('tab-' + tab);
    if (tabEl) tabEl.style.display = '';
    document.querySelectorAll(`[onclick="showTab('${tab}')"]`).forEach(el => el.classList.add('active'));
    if (tab === 'products') loadProducts();
    if (tab === 'categories') loadCategories();
    if (tab === 'users') loadUsers();
    if (tab === 'orders') loadAdminOrders();
    if (tab === 'preorders') loadAdminPreorders();
}

// ══════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════
async function loadProducts() {
    try {
        const res = await apiFetch('/api/admin/products');
        allProducts = await res.json();
        renderProductsTable(allProducts);
    } catch (e) { showToast('Error loading products.'); }
}

function renderProductsTable(products) {
    const tbody = document.getElementById('products-tbody');
    if (!products.length) { tbody.innerHTML = `<tr><td colspan="7" style="padding:50px;text-align:center;color:var(--text-muted)">No products found.</td></tr>`; return; }
    const stColors = { in_stock: '#5cb85c', low_stock: '#f0ad4e', out_of_stock: '#d9534f' };
    const stLabels = { in_stock: 'In Stock', low_stock: 'Low Stock', out_of_stock: 'Sold Out' };
    tbody.innerHTML = products.map(p => `
    <tr>
      <td><img class="td-img" src="" data-pid="${p.id}" alt="${p.name}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;background:#222;" /></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</td>
      <td><span style="font-size:12px;color:var(--gold);">${p.category}</span></td>
      <td style="font-weight:500;color:var(--gold);">₹${parseFloat(p.price).toLocaleString('en-IN')}</td>
      <td><div style="font-size:12px;color:${stColors[p.stock_status] || '#fff'};">${p.stock !== null ? p.stock + ' qty' : '\u221e'}</div><div style="font-size:10px;color:var(--text-muted);">${stLabels[p.stock_status] || ''}</div></td>
      <td><span class="td-badge ${p.featured ? 'badge-featured' : 'badge-normal'}">${p.featured ? 'Featured' : 'Standard'}</span></td>
      <td>
        <div class="td-actions">
          <button class="icon-btn icon-btn-edit" onclick="openEditProductModal('${p.id}')" title="Edit">✏️</button>
          <button class="icon-btn icon-btn-del" onclick="openDeleteModal('${p.id}','${p.name.replace(/'/g, "\\'")}','product')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
    // Lazy-load product thumbnails
    document.querySelectorAll('[data-pid]').forEach(async img => {
        const res = await apiFetch(`/api/admin/products/${img.dataset.pid}/images`).catch(() => null);
        if (!res) return;
        const { images } = await res.json().catch(() => ({ images: [] }));
        if (images && images[0]) img.src = images[0];
    });
}

function filterTable(q) {
    const filtered = allProducts.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase()));
    renderProductsTable(filtered);
}

// ── Product Modals ────────────────────────────
let productImages = []; // base64 array for current modal

function openAddProductModal() {
    editMode = false; productImages = [];
    document.getElementById('modal-title').textContent = 'Add Product';
    document.getElementById('product-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('img-previews').innerHTML = '';
    document.getElementById('p-stock').value = '';
    document.getElementById('p-stock-status').value = 'in_stock';
    document.getElementById('p-sale-price').value = '';
    isSaleOn = false; updateSaleToggle();
    populateCategorySelect();
    isFeatured = false; updateToggle();
    isPushOn = false; updatePushToggle();
    currentColors = []; renderColorChips();
    document.getElementById('product-modal').classList.add('open');
}

function syncStock() {
    const stockVal = document.getElementById('p-stock').value;
    const statusEl = document.getElementById('p-stock-status');
    if (stockVal === '0') {
        statusEl.value = 'out_of_stock';
    } else if (stockVal !== '' && parseInt(stockVal) > 0) {
        if (statusEl.value === 'out_of_stock') statusEl.value = 'in_stock';
    }
}
document.getElementById('p-stock')?.addEventListener('input', syncStock);

async function openEditProductModal(id) {
    editMode = true;
    const res = await apiFetch(`/api/admin/products/${id}/images`);
    const { images } = await res.json().catch(() => ({ images: [] }));
    productImages = images || [];
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modal-title').textContent = 'Edit Product';
    document.getElementById('edit-id').value = id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-price').value = p.price;
    document.getElementById('p-description').value = p.description || '';
    document.getElementById('p-stock').value = p.stock ?? '';
    document.getElementById('p-stock-status').value = p.stock_status || 'in_stock';
    document.getElementById('p-sale-price').value = p.sale_price ?? '';
    isSaleOn = p.is_on_sale || false; updateSaleToggle();
    isFeatured = p.featured || false; updateToggle();
    isPushOn = false; updatePushToggle();
    populateCategorySelect(p.category);
    // Load sizes
    currentSizes = Array.isArray(p.available_sizes) ? [...p.available_sizes] : [];
    renderSizeChips();
    // Load colors
    currentColors = Array.isArray(p.available_colors) ? [...p.available_colors] : [];
    renderColorChips();
    renderImagePreviews();
    document.getElementById('product-modal').classList.add('open');
}

function populateCategorySelect(selected = '') {
    const sel = document.getElementById('p-category');
    sel.innerHTML = `<option value="">Select category…</option>` +
        allCategories.map(c => `<option value="${c.name}" ${c.name === selected ? 'selected' : ''}>${c.name}</option>`).join('');
}

function closeProductModal() {
    document.getElementById('product-modal').classList.remove('open');
    currentSizes = [];
    renderSizeChips();
    currentColors = [];
    renderColorChips();
}

function toggleFeatured() { isFeatured = !isFeatured; updateToggle(); }
function updateToggle() {
    const t = document.getElementById('featured-toggle'), l = document.getElementById('featured-label');
    if (isFeatured) { t.classList.add('on'); l.textContent = 'Featured on homepage'; }
    else { t.classList.remove('on'); l.textContent = 'Not featured'; }
    document.getElementById('p-featured').value = isFeatured;
}

let isSaleOn = false;
function toggleSale() { isSaleOn = !isSaleOn; updateSaleToggle(); }
function updateSaleToggle() {
    const t = document.getElementById('sale-toggle'), l = document.getElementById('sale-label');
    if (!t) return;
    if (isSaleOn) { t.classList.add('on'); l.textContent = 'On Sale 🔥'; l.style.color = '#e07070'; }
    else { t.classList.remove('on'); l.textContent = 'Not on sale'; l.style.color = ''; }
}

let isPushOn = false;
function togglePush() { isPushOn = !isPushOn; updatePushToggle(); }
function updatePushToggle() {
    const t = document.getElementById('push-toggle'), l = document.getElementById('push-label');
    if (!t) return;
    if (isPushOn) { t.classList.add('on'); l.textContent = 'Send push alert'; l.style.color = '#5cb85c'; }
    else { t.classList.remove('on'); l.textContent = 'Do not send push alert'; l.style.color = 'var(--text)'; }
    document.getElementById('p-send-push').value = isPushOn.toString();
}

// ── SIZE PICKER ───────────────────────────────
let currentSizes = [];
function renderSizeChips() {
    const el = document.getElementById('size-chips');
    if (!el) return;
    el.innerHTML = currentSizes.map((s, i) =>
        `<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(201,169,110,0.12);border:1px solid rgba(201,169,110,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--gold);">
            ${s}
            <span onclick="currentSizes.splice(${i},1);renderSizeChips();" style="cursor:pointer;opacity:0.6;font-size:11px;">✕</span>
         </span>`
    ).join('');
}
function addSizeFromInput() {
    const inp = document.getElementById('size-input');
    const val = (inp?.value || '').trim();
    if (!val) return;
    if (!currentSizes.includes(val)) { currentSizes.push(val); renderSizeChips(); }
    inp.value = '';
}
function addSizePreset(sizes) {
    sizes.forEach(s => { if (!currentSizes.includes(s)) currentSizes.push(s); });
    renderSizeChips();
}
function clearSizes() { currentSizes = []; renderSizeChips(); }

// ── COLOR PICKER ──────────────────────────────
let currentColors = [];
function renderColorChips() {
    const el = document.getElementById('color-chips');
    if (!el) return;
    el.innerHTML = currentColors.map((c, i) =>
        `<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(201,169,110,0.12);border:1px solid rgba(201,169,110,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--gold);">
            ${c}
            <span onclick="currentColors.splice(${i},1);renderColorChips();" style="cursor:pointer;opacity:0.6;font-size:11px;">✕</span>
         </span>`
    ).join('');
}
function addColorFromInput() {
    const inp = document.getElementById('color-input');
    const val = (inp?.value || '').trim();
    if (!val) return;
    if (!currentColors.includes(val)) { currentColors.push(val); renderColorChips(); }
    inp.value = '';
}
function addColorPreset(colors) {
    colors.forEach(c => { if (!currentColors.includes(c)) currentColors.push(c); });
    renderColorChips();
}
function clearColors() { currentColors = []; renderColorChips(); }

// Image upload → base64
function handleImageFiles(files) {
    const promises = Array.from(files).map(f => new Promise(res => {
        const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(f);
    }));
    Promise.all(promises).then(dataUrls => {
        productImages = [...productImages, ...dataUrls];
        renderImagePreviews();
    });
}

function renderImagePreviews() {
    const c = document.getElementById('img-previews');
    c.innerHTML = productImages.map((src, i) => `
    <div class="img-preview" style="position:relative;display:inline-block;margin:4px;">
      <img src="${src}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid rgba(201,169,110,0.2);" />
      <span onclick="removeProductImage(${i})" style="position:absolute;top:-6px;right:-6px;background:#c00;color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;">✕</span>
    </div>
  `).join('');
}
function removeProductImage(i) { productImages.splice(i, 1); renderImagePreviews(); }

async function submitProduct() {
    const name = document.getElementById('p-name').value.trim();
    const category = document.getElementById('p-category').value;
    const price = document.getElementById('p-price').value;
    const description = document.getElementById('p-description').value.trim();
    const featured = document.getElementById('p-featured').value === 'true';
    if (!name || !category || !price) { showToast('Fill in all required fields.'); return; }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        const stock = document.getElementById('p-stock').value;
        const stock_status = document.getElementById('p-stock-status').value;
        const sale_price_val = document.getElementById('p-sale-price').value;
        const body = {
            name, category, price: parseFloat(price), description, featured, images: productImages,
            stock: stock !== '' ? parseInt(stock) : null, stock_status,
            is_on_sale: isSaleOn,
            sale_price: sale_price_val !== '' ? parseFloat(sale_price_val) : null,
            available_sizes: currentSizes.length ? currentSizes : null,
            available_colors: currentColors.length ? currentColors : null
        };
        const editId = document.getElementById('edit-id').value;
        const res = editMode && editId
            ? await apiFetch(`/api/admin/products/${editId}`, { method: 'PUT', body: JSON.stringify(body) })
            : await apiFetch('/api/admin/products', { method: 'POST', body: JSON.stringify(body) });

        if (res && res.ok) {
            // Read body ONCE — only needed for new products to get the new ID
            let actualId = editId;
            if (!editMode) {
                try {
                    const prodData = await res.json();
                    actualId = prodData.id;
                } catch (_) { }
            }

            showToast(editMode ? '✅ Updated!' : '✅ Product added!');

            // Send push notification broadcast if toggle is enabled
            if (isPushOn && actualId) {
                try {
                    const pushRes = await fetch('/api/admin/push/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() },
                        body: JSON.stringify({
                            title: `✨ New: ${name}`,
                            body: `${category} · ₹${parseFloat(price).toLocaleString('en-IN')} — Tap to view!`,
                            url: `/product.html?id=${actualId}`
                        })
                    });
                    if (pushRes.ok) {
                        const d = await pushRes.json();
                        showToast(`🔔 ${d.message || 'Push alert sent!'}`);
                    } else {
                        const d = await pushRes.json().catch(() => ({}));
                        showToast('⚠️ Push failed: ' + (d.error || 'Unknown'));
                        console.warn('Push send failed:', d);
                    }
                } catch (e) {
                    console.error('Push broadcast error:', e);
                    showToast('⚠️ Push error: ' + e.message);
                }
            }

            closeProductModal();
            loadProducts();
        }
        else { showToast('❌ Failed to save.'); }
    } catch (e) { showToast('❌ Error: ' + e.message); }
    finally { btn.disabled = false; btn.textContent = 'Save Product'; }
}

// ══════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════
async function loadCategories() {
    try {
        const res = await apiFetch('/api/admin/categories');
        allCategories = await res.json();
        renderCategoriesTable(allCategories);
    } catch (e) { showToast('Error loading categories.'); }
}

function renderCategoriesTable(cats) {
    const tbody = document.getElementById('categories-tbody');
    if (!tbody) return;
    if (!cats.length) { tbody.innerHTML = `<tr><td colspan="4" style="padding:50px;text-align:center;color:var(--text-muted)">No categories yet. Add your first!</td></tr>`; return; }
    tbody.innerHTML = cats.map(c => `
    <tr>
      <td><img src="/api/admin/categories/${c.id}/cover" style="width:48px;height:48px;object-fit:cover;border-radius:8px;background:#222;" onerror="this.style.display='none'" /></td>
      <td style="font-weight:500;">${c.parent_id ? '<span style="color:var(--text-muted);font-size:11px;margin-right:6px;">↳</span>' : ''}${c.name}</td>
      <td style="color:var(--text-muted);font-size:13px;">${c.description || '—'}</td>
      <td>
        <div class="td-actions">
          <button class="icon-btn icon-btn-edit" onclick="openEditCatModal(${JSON.stringify(c).replace(/"/g, '&quot;')})" title="Edit">✏️</button>
          <button class="icon-btn icon-btn-del" onclick="openDeleteModal(${c.id},'${c.name.replace(/'/g, "\\'")}','category')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

let catImageData = null;

function openAddCatModal() {
    catImageData = null;
    document.getElementById('cat-modal-title').textContent = 'Add Category';
    document.getElementById('cat-form').reset();
    document.getElementById('edit-cat-id').value = '';
    document.getElementById('cat-img-preview').innerHTML = '';
    populateParentCatSelect(null);
    document.getElementById('cat-modal').classList.add('open');
}

function openEditCatModal(cat) {
    catImageData = null;
    document.getElementById('cat-modal-title').textContent = 'Edit Category';
    document.getElementById('edit-cat-id').value = cat.id;
    document.getElementById('cat-name').value = cat.name;
    document.getElementById('cat-description').value = cat.description || '';
    document.getElementById('cat-img-preview').innerHTML = cat.cover_name
        ? `<img src="/api/admin/categories/${cat.id}/cover" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid rgba(201,169,110,0.2);" />`
        : '';
    populateParentCatSelect(cat.parent_id, cat.id);
    document.getElementById('cat-modal').classList.add('open');
}

function populateParentCatSelect(selectedId, excludeId = null) {
    const sel = document.getElementById('cat-parent');
    if (!sel) return;
    const topLevel = allCategories.filter(c => !c.parent_id && c.id !== excludeId);
    sel.innerHTML = '<option value="">— Top Level —</option>' +
        topLevel.map(c => `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${c.name}</option>`).join('');
}

function closeCatModal() { document.getElementById('cat-modal').classList.remove('open'); }

function handleCatImage(files) {
    const f = files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = e => {
        catImageData = { data: e.target.result, name: f.name };
        document.getElementById('cat-img-preview').innerHTML =
            `<img src="${e.target.result}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid rgba(201,169,110,0.2);" />`;
    };
    r.readAsDataURL(f);
}

async function submitCategory() {
    const name = document.getElementById('cat-name').value.trim();
    const desc = document.getElementById('cat-description').value.trim();
    const parent_id = document.getElementById('cat-parent')?.value || null;
    if (!name) { showToast('Category name is required.'); return; }
    const btn = document.getElementById('submit-cat-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        const body = { name, description: desc, parent_id: parent_id || null };
        if (catImageData) { body.cover_data = catImageData.data; body.cover_name = catImageData.name; }
        const editId = document.getElementById('edit-cat-id').value;
        const res = editId
            ? await apiFetch(`/api/admin/categories/${editId}`, { method: 'PUT', body: JSON.stringify(body) })
            : await apiFetch('/api/admin/categories', { method: 'POST', body: JSON.stringify(body) });
        if (res && res.ok) { showToast(editId ? '✅ Category updated!' : '✅ Category added!'); closeCatModal(); loadCategories(); }
        else { const e = await res.json().catch(() => { }); showToast('❌ ' + (e?.error || 'Failed')); }
    } catch (e) { showToast('❌ ' + e.message); }
    finally { btn.disabled = false; btn.textContent = 'Save Category'; }
}

// ══════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════
async function loadUsers() {
    try {
        const res = await apiFetch('/api/admin/users');
        const users = await res.json();
        const tbody = document.getElementById('users-tbody');
        if (!tbody) return;
        tbody.innerHTML = users.map(u => `
      <tr>
        <td>${u.name || '—'}</td>
        <td>${u.email}</td>
        <td><span class="td-badge ${u.role === 'admin' ? 'badge-featured' : 'badge-normal'}">${u.role}</span></td>
        <td style="color:var(--text-muted);font-size:12px;">${new Date(u.created_at).toLocaleDateString()}</td>
      </tr>
    `).join('');
    } catch (e) { showToast('Error loading users.'); }
}

// ══════════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════════
function openDeleteModal(id, name, type = 'product') {
    deleteTarget = { id, type };
    document.getElementById('delete-name').textContent = name;
    document.getElementById('delete-modal').classList.add('open');
}

async function confirmDelete() {
    if (!deleteTarget) return;
    const btn = document.getElementById('confirm-del-btn');
    btn.disabled = true; btn.textContent = 'Deleting…';
    try {
        const url = deleteTarget.type === 'category'
            ? `/api/admin/categories/${deleteTarget.id}`
            : `/api/admin/products/${deleteTarget.id}`;
        const res = await apiFetch(url, { method: 'DELETE' });
        if (res && res.ok) {
            showToast('🗑️ Deleted.');
            document.getElementById('delete-modal').classList.remove('open');
            if (deleteTarget.type === 'category') loadCategories(); else loadProducts();
        } else { showToast('❌ Failed to delete.'); }
    } catch (e) { showToast('❌ Error.'); }
    finally { btn.disabled = false; btn.textContent = 'Delete'; deleteTarget = null; }
}

// ── TOAST ─────────────────────────────────────
function showToast(msg) {
    let c = document.getElementById('admin-toast-container');
    if (!c) { c = document.createElement('div'); c.id = 'admin-toast-container'; c.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;'; document.body.appendChild(c); }
    const t = document.createElement('div');
    t.style.cssText = 'background:rgba(17,17,17,0.95);border:1px solid rgba(201,169,110,0.3);color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,0.4);animation:fadeUp 0.3s ease;';
    t.textContent = msg; c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ── Modal close on overlay click ──────────────
['product-modal', 'cat-modal', 'delete-modal', 'po-modal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => { if (e.target === e.currentTarget) e.target.classList.remove('open'); });
});

// ── Drag & drop ──────────────────────────────
const fileDrop = document.getElementById('file-drop');
if (fileDrop) {
    fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('drag-over'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
    fileDrop.addEventListener('drop', e => { e.preventDefault(); fileDrop.classList.remove('drag-over'); handleImageFiles(e.dataTransfer.files); });
}
