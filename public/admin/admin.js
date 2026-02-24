/* ============================================
   AEON Admin Dashboard – admin.js
   ============================================ */

const TOKEN_KEY = 'aeon_admin_token';
let allProducts = [];
let deleteTargetId = null;
let isFeatured = false;
let editMode = false;

// ── AUTH ─────────────────────────────────────
function checkAuth() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) { window.location.href = '/admin/'; return; }
    loadProducts();
}

function getToken() { return sessionStorage.getItem(TOKEN_KEY); }

function logout() {
    fetch('/api/admin/logout', { method: 'POST', headers: { 'x-admin-token': getToken() } });
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.href = '/admin/';
}

// ── API HELPERS ───────────────────────────────
async function apiFetch(url, opts = {}) {
    const res = await fetch(url, {
        ...opts,
        headers: { 'x-admin-token': getToken(), ...(opts.headers || {}) }
    });
    if (res.status === 401) { window.location.href = '/admin/'; return null; }
    return res;
}

// ── LOAD PRODUCTS ─────────────────────────────
async function loadProducts() {
    try {
        const res = await apiFetch('/api/admin/products');
        allProducts = await res.json();
        renderTable(allProducts);
        updateStats(allProducts);
    } catch (e) {
        showToast('Error loading products.');
    }
}

function updateStats(products) {
    document.getElementById('stat-total').textContent = products.length;
    const cats = new Set(products.map(p => p.category)).size;
    document.getElementById('stat-cats').textContent = cats;
    document.getElementById('stat-featured').textContent = products.filter(p => p.featured).length;
    const avg = products.length ? Math.round(products.reduce((s, p) => s + p.price, 0) / products.length) : 0;
    document.getElementById('stat-avg').textContent = `₹${avg.toLocaleString('en-IN')}`;
}

function renderTable(products) {
    const tbody = document.getElementById('products-tbody');
    if (!products.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><div style="padding:50px;color:var(--text-muted);">No products found. Add your first product!</div></td></tr>';
        return;
    }
    tbody.innerHTML = products.map(p => `
    <tr>
      <td><img class="td-img" src="${p.images && p.images[0] || ''}" alt="${p.name}" /></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</td>
      <td><span style="font-size:12px;color:var(--gold);">${p.category}</span></td>
      <td style="font-weight:500;color:var(--gold);">₹${p.price.toLocaleString('en-IN')}</td>
      <td><span class="td-badge ${p.featured ? 'badge-featured' : 'badge-normal'}">${p.featured ? 'Featured' : 'Standard'}</span></td>
      <td>
        <div class="td-actions">
          <button class="icon-btn icon-btn-edit" onclick='openEditModal(${JSON.stringify(p).replace(/'/g, "&apos;")})' title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn icon-btn-del" onclick="openDeleteModal('${p.id}','${p.name.replace(/'/g, "\\'")}')" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterTable(query) {
    const q = query.toLowerCase();
    const filtered = allProducts.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
    renderTable(filtered);
}

// ── MODAL ─────────────────────────────────────
function openAddModal() {
    editMode = false;
    document.getElementById('modal-title').textContent = 'Add Product';
    document.getElementById('product-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('img-previews').innerHTML = '';
    isFeatured = false;
    updateToggle();
    document.getElementById('product-modal').classList.add('open');
}

function openEditModal(product) {
    editMode = true;
    document.getElementById('modal-title').textContent = 'Edit Product';
    document.getElementById('edit-id').value = product.id;
    document.getElementById('p-name').value = product.name;
    document.getElementById('p-category').value = product.category;
    document.getElementById('p-price').value = product.price;
    document.getElementById('p-description').value = product.description || '';
    isFeatured = product.featured || false;
    updateToggle();
    // Show existing images
    const previews = document.getElementById('img-previews');
    previews.innerHTML = (product.images || []).map((img, i) => `
    <div class="img-preview">
      <img src="${img}" alt="img ${i}" />
    </div>
  `).join('');
    document.getElementById('product-modal').classList.add('open');
}

function closeModal() {
    document.getElementById('product-modal').classList.remove('open');
}

function toggleFeatured() {
    isFeatured = !isFeatured;
    document.getElementById('p-featured').value = isFeatured;
    updateToggle();
}
function updateToggle() {
    const toggle = document.getElementById('featured-toggle');
    const label = document.getElementById('featured-label');
    if (isFeatured) { toggle.classList.add('on'); label.textContent = 'Featured on homepage'; }
    else { toggle.classList.remove('on'); label.textContent = 'Not featured'; }
    document.getElementById('p-featured').value = isFeatured;
}

function previewImages(files) {
    const container = document.getElementById('img-previews');
    container.innerHTML = '';
    Array.from(files).forEach((file, i) => {
        const reader = new FileReader();
        reader.onload = e => {
            const div = document.createElement('div');
            div.className = 'img-preview';
            div.innerHTML = `<img src="${e.target.result}" alt="preview ${i}" /><span class="img-preview-del" onclick="this.parentElement.remove()">✕</span>`;
            container.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

// ── SUBMIT ────────────────────────────────────
async function submitProduct() {
    const name = document.getElementById('p-name').value.trim();
    const category = document.getElementById('p-category').value;
    const price = document.getElementById('p-price').value;
    const description = document.getElementById('p-description').value.trim();
    const featured = document.getElementById('p-featured').value;
    const filesInput = document.getElementById('p-images');

    if (!name || !category || !price) { showToast('Please fill in all required fields.'); return; }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('category', category);
    formData.append('price', price);
    formData.append('description', description);
    formData.append('featured', featured);

    Array.from(filesInput.files).forEach(f => formData.append('images', f));

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerHTML = '⏳ Saving…';

    try {
        const editId = document.getElementById('edit-id').value;
        let res;
        if (editMode && editId) {
            res = await apiFetch(`/api/admin/products/${editId}`, { method: 'PUT', body: formData });
        } else {
            res = await apiFetch('/api/admin/products', { method: 'POST', body: formData });
        }
        if (res && res.ok) {
            showToast(editMode ? '✅ Product updated!' : '✅ Product added!');
            closeModal();
            loadProducts();
        } else {
            showToast('❌ Failed to save product.');
        }
    } catch (e) {
        showToast('❌ Error: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Product';
    }
}

// ── DELETE ────────────────────────────────────
function openDeleteModal(id, name) {
    deleteTargetId = id;
    document.getElementById('delete-name').textContent = name;
    document.getElementById('delete-modal').classList.add('open');
}

async function confirmDelete() {
    if (!deleteTargetId) return;
    const btn = document.getElementById('confirm-del-btn');
    btn.disabled = true; btn.textContent = 'Deleting…';
    try {
        const res = await apiFetch(`/api/admin/products/${deleteTargetId}`, { method: 'DELETE' });
        if (res && res.ok) {
            showToast('🗑️ Product deleted.');
            document.getElementById('delete-modal').classList.remove('open');
            loadProducts();
        } else {
            showToast('❌ Failed to delete.');
        }
    } catch (e) { showToast('❌ Error deleting product.'); }
    finally { btn.disabled = false; btn.textContent = 'Delete'; deleteTargetId = null; }
}

// ── TAB NAV ───────────────────────────────────
function showTab(tab) {
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

// ── DRAG & DROP ───────────────────────────────
const drop = document.getElementById('file-drop');
if (drop) {
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        document.getElementById('p-images').files = files;
        previewImages(files);
    });
}

// Close modals on overlay click
document.getElementById('product-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('delete-modal').addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById('delete-modal').classList.remove('open'); });
