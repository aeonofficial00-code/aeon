/* ================================================
   AEON Jewellery – Shared JS (main.js)
   Cart, Nav, Helpers, Product Card Renderer
   ================================================ */

// ── CART STATE ────────────────────────────────────
let cart = JSON.parse(localStorage.getItem('aeon_cart') || '[]');

function saveCart() {
  localStorage.setItem('aeon_cart', JSON.stringify(cart));
  updateCartUI();
}

function addToCart(product) {
  const existing = cart.find(i => i.id === product.id);
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  saveCart();
  showToast(`Added "${product.name}" to cart! 🛍️`);
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  saveCart();
}

function updateCartUI() {
  const count = cart.reduce((s, i) => s + (i.qty || 1), 0);
  const countEl = document.getElementById('cart-count');
  if (countEl) {
    countEl.textContent = count;
    countEl.classList.toggle('has-items', count > 0);
  }
  renderCartItems();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(1, (item.qty || 1) + delta);
  saveCart();
}

function renderCartItems() {
  const list = document.getElementById('cart-items-list');
  const footer = document.getElementById('cart-footer');
  if (!list) return;

  if (!cart.length) {
    list.innerHTML = `
      <div class="cart-empty">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.3;margin-bottom:14px;">
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
        </svg>
        <p style="margin-bottom:18px;color:var(--text-muted);font-size:14px;">Your cart is empty</p>
        <a href="/#collections" class="btn btn-gold" style="font-size:11px;padding:10px 22px;" onclick="closeCart()">Shop Collections</a>
      </div>`;
    if (footer) footer.style.display = 'none';
    return;
  }

  list.innerHTML = cart.map(item => {
    const imgSrc = item.thumb || (item.images && item.images[0]) || '';
    const linePrice = parseFloat(item.price) * (item.qty || 1);
    return `
    <div class="cart-item" style="border-bottom:1px solid rgba(201,169,110,0.07);padding:14px 0;display:flex;gap:12px;align-items:center;">
      <img src="${imgSrc}" alt="${item.name}" style="width:60px;height:60px;border-radius:10px;object-fit:cover;border:1px solid rgba(201,169,110,0.1);background:#1a1a1a;flex-shrink:0;" onerror="this.style.display='none'"/>
      <div style="flex:1;min-width:0;">
        <p style="font-size:13px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</p>
        <p style="font-size:11px;color:var(--text-muted);margin:2px 0 8px;letter-spacing:0.5px;">${item.category}</p>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="display:flex;align-items:center;gap:0;border:1px solid rgba(201,169,110,0.2);border-radius:20px;overflow:hidden;">
            <button onclick="changeQty('${item.id}',-1)" style="background:none;border:none;color:var(--gold);width:28px;height:26px;cursor:pointer;font-size:14px;transition:background 0.2s;" onmouseover="this.style.background='rgba(201,169,110,0.1)'" onmouseout="this.style.background='none'">−</button>
            <span style="font-size:12px;color:var(--text);min-width:20px;text-align:center;">${item.qty || 1}</span>
            <button onclick="changeQty('${item.id}',1)" style="background:none;border:none;color:var(--gold);width:28px;height:26px;cursor:pointer;font-size:14px;transition:background 0.2s;" onmouseover="this.style.background='rgba(201,169,110,0.1)'" onmouseout="this.style.background='none'">+</button>
          </div>
          <span style="font-size:13px;color:var(--gold);font-weight:600;">₹${linePrice.toLocaleString('en-IN')}</span>
        </div>
      </div>
      <button onclick="removeFromCart('${item.id}')" style="background:none;border:none;color:rgba(255,255,255,0.2);font-size:16px;cursor:pointer;flex-shrink:0;padding:4px;transition:color 0.2s;" onmouseover="this.style.color='rgba(255,100,100,0.7)'" onmouseout="this.style.color='rgba(255,255,255,0.2)'">✕</button>
    </div>`;
  }).join('');

  const subtotal = cart.reduce((s, i) => s + parseFloat(i.price) * (i.qty || 1), 0);
  const deliveryFree = subtotal >= 999;
  const delivery = deliveryFree ? 0 : 99;
  const total = subtotal + delivery;

  const totalEl = document.getElementById('cart-total');
  if (totalEl) totalEl.textContent = `₹${total.toLocaleString('en-IN')}`;

  // Inject breakdown + checkout button into footer
  if (footer) {
    footer.style.display = 'block';
    footer.innerHTML = `
      <div style="border-top:1px solid rgba(201,169,110,0.08);padding-top:14px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:6px;">
          <span>Subtotal</span><span>₹${subtotal.toLocaleString('en-IN')}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px;">
          <span>Delivery</span><span style="color:${deliveryFree ? '#5cb85c' : 'inherit'}">${deliveryFree ? 'FREE' : '₹99'}</span>
        </div>
        ${deliveryFree ? '' : '<p style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">Add ₹' + (999 - Math.round(subtotal)) + ' more for free delivery</p>'}
        <div style="display:flex;justify-content:space-between;font-size:15px;color:var(--gold);font-weight:600;margin-top:10px;padding-top:10px;border-top:1px solid rgba(201,169,110,0.08);">
          <span>Total</span><span>₹${total.toLocaleString('en-IN')}</span>
        </div>
      </div>
      <a href="/checkout" onclick="closeCart()" style="
        display:flex;align-items:center;justify-content:center;gap:8px;
        background:linear-gradient(135deg,#9E7A40,var(--gold),#E8C98A);
        color:#0a0a0a;text-decoration:none;border-radius:12px;
        padding:14px;font-size:12px;font-weight:700;letter-spacing:2px;
        text-transform:uppercase;transition:all 0.25s;
        box-shadow:0 4px 20px rgba(201,169,110,0.2);"
        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 30px rgba(201,169,110,0.35)'"
        onmouseout="this.style.transform='none';this.style.boxShadow='0 4px 20px rgba(201,169,110,0.2)'">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        Proceed to Checkout
      </a>
      <p style="text-align:center;font-size:10px;color:rgba(255,255,255,0.2);margin-top:8px;letter-spacing:1px;">🔒 Secured by Razorpay</p>`;
  }
}


// ── CART DRAWER ───────────────────────────────────
function openCart() {
  document.getElementById('cart-drawer')?.classList.add('open');
  document.getElementById('cart-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.getElementById('cart-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── TOAST ─────────────────────────────────────────
function showToast(message, duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-icon">✦</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100px)'; toast.style.transition = '0.3s ease'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ── PRODUCT CARD RENDERER ─────────────────────────
function renderProductCard(p) {
  // Use URL endpoint (thumb) preferring over raw images array
  const img = p.thumb || (p.images && p.images[0]) || '';
  return `
    <div class="product-card reveal" onclick="location.href='product.html?id=${p.id}'">
      <div class="product-img-wrap">
        <img class="product-img" src="${img}" alt="${p.name}" loading="lazy" />
        ${p.featured ? '<span class="product-badge">Featured</span>' : ''}
        <div class="product-actions">
          <button class="btn-cart" onclick="event.stopPropagation(); addToCart(${JSON.stringify({ id: p.id, name: p.name, category: p.category, price: p.price, thumb: img }).replace(/"/g, '&quot;')})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
            Add to Cart
          </button>
        </div>
        <div class="product-glow"></div>
      </div>
      <div class="product-info">
        <p class="product-category">${p.category}</p>
        <h3 class="product-name">${p.name}</h3>
        <p class="product-price">₹${parseFloat(p.price).toLocaleString('en-IN')} <span>incl. taxes</span></p>
      </div>
    </div>
  `;
}

// ── NAV ───────────────────────────────────────────
function setupNav() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 30);
    const btt = document.getElementById('back-to-top');
    if (btt) btt.classList.toggle('visible', window.scrollY > 400);
  });

  document.getElementById('cart-btn')?.addEventListener('click', openCart);
  document.getElementById('cart-close')?.addEventListener('click', closeCart);
  document.getElementById('cart-overlay')?.addEventListener('click', closeCart);
  document.getElementById('search-btn')?.addEventListener('click', openSearch);

  // Load user state from session
  loadUserState();
}

// ── USER STATE (Google Auth) ──────────────────────
let currentUser = null;

function loadUserState() {
  const userSlot = document.getElementById('nav-user-slot');
  if (!userSlot) return;
  fetch('/auth/me').then(r => r.json()).then(({ user }) => {
    currentUser = user;
    if (user) {
      const firstName = user.name ? user.name.split(' ')[0] : 'Account';
      userSlot.style.cssText = 'display:flex;align-items:center;gap:8px;';
      userSlot.innerHTML = `
        ${user.isAdmin ? `
          <a href="/admin" style="
            display:inline-flex;align-items:center;gap:4px;
            padding:4px 11px 4px 8px;border-radius:20px;
            background:linear-gradient(135deg,rgba(158,122,64,0.2),rgba(201,169,110,0.12));
            border:1px solid rgba(201,169,110,0.35);
            color:var(--gold);font-size:9.5px;letter-spacing:2px;
            text-transform:uppercase;font-weight:600;text-decoration:none;
            transition:all 0.25s;backdrop-filter:blur(6px);
            box-shadow:0 0 12px rgba(201,169,110,0.08);"
            onmouseover="this.style.background='rgba(201,169,110,0.18)';this.style.borderColor='rgba(201,169,110,0.6)';this.style.boxShadow='0 0 18px rgba(201,169,110,0.2)'"
            onmouseout="this.style.background='linear-gradient(135deg,rgba(158,122,64,0.2),rgba(201,169,110,0.12))';this.style.borderColor='rgba(201,169,110,0.35)';this.style.boxShadow='0 0 12px rgba(201,169,110,0.08)'">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.85"><path d="M5 16L3 5l5.5 5L12 2l3.5 8L21 5l-2 11H5z"/></svg>
            Admin
          </a>` : ''}
        <div style="display:flex;align-items:center;gap:6px;padding:0 2px;border-left:1px solid rgba(255,255,255,0.07);padding-left:8px;">
          <span style="font-size:11.5px;color:rgba(255,255,255,0.45);letter-spacing:0.3px;">${firstName}</span>
          <span style="color:rgba(255,255,255,0.1);font-size:10px;">·</span>
          <a href="/orders" style="
            font-size:10.5px;letter-spacing:0.5px;
            color:rgba(255,255,255,0.3);text-decoration:none;
            transition:color 0.2s;"
            onmouseover="this.style.color='var(--gold)'"
            onmouseout="this.style.color='rgba(255,255,255,0.3)'">Orders</a>
          <span style="color:rgba(255,255,255,0.1);font-size:10px;">·</span>
          <a href="/auth/logout" style="
            font-size:10.5px;letter-spacing:0.5px;
            color:rgba(255,255,255,0.2);text-decoration:none;
            transition:color 0.2s;"
            onmouseover="this.style.color='rgba(255,100,100,0.7)'"
            onmouseout="this.style.color='rgba(255,255,255,0.2)'">out</a>
        </div>
      `;
      // Show mobile orders link
      const mobileOrders = document.getElementById('mobile-orders-link');
      if (mobileOrders) mobileOrders.style.display = 'block';
    } else {
      userSlot.style.cssText = 'display:flex;align-items:center;';
      userSlot.innerHTML = `
        <a href="/login" style="
          display:inline-flex;align-items:center;gap:5px;
          font-size:10.5px;letter-spacing:1.5px;text-transform:uppercase;
          color:rgba(255,255,255,0.35);text-decoration:none;
          transition:color 0.2s;padding:0 2px;"
          onmouseover="this.style.color='var(--gold)'"
          onmouseout="this.style.color='rgba(255,255,255,0.35)'">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Sign in
        </a>
      `;
    }
  }).catch(() => { });
}

// ── SEARCH ────────────────────────────────────────
let _searchCache = null, _searchTimer = null;

function openSearch() {
  const overlay = document.getElementById('search-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('search-input')?.focus(), 80);
  if (!_searchCache) fetch('/api/products').then(r => r.json()).then(d => { _searchCache = d; }).catch(() => { });
}

function closeSearch() {
  document.getElementById('search-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '<p class="search-hint">Type to search products…</p>';
}

function handleSearchOverlayClick(e) {
  if (e.target === document.getElementById('search-overlay')) closeSearch();
}

function doSearch(q) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => _runSearch(q.trim()), 180);
}

function _runSearch(q) {
  const results = document.getElementById('search-results');
  if (!q) { results.innerHTML = '<p class="search-hint">Type to search products…</p>'; return; }
  const src = _searchCache || [];
  const matches = src.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(q.toLowerCase())
  ).slice(0, 10);
  if (!matches.length) { results.innerHTML = '<p class="search-hint">No products found for "' + q + '"</p>'; return; }
  results.innerHTML = matches.map((p, i) => {
    const img = p.thumb || '';
    return `<a class="search-result-item" href="/product.html?id=${p.id}" onclick="closeSearch()" style="animation-delay:${i * 30}ms">
      <img class="search-result-img" src="${img}" alt="${p.name}" onerror="this.style.display='none'"/>
      <div style="flex:1;min-width:0;">
        <div class="search-result-name">${p.name}</div>
        <div class="search-result-cat">${p.category}</div>
      </div>
      <div class="search-result-price">₹${parseFloat(p.price).toLocaleString('en-IN')}</div>
    </a>`;
  }).join('');
}


// ── MOBILE MENU ───────────────────────────────────
function setupMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (!hamburger || !mobileMenu) return;
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
    document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
  });
}
window.closeMobileMenu = function () {
  document.getElementById('hamburger')?.classList.remove('open');
  document.getElementById('mobile-menu')?.classList.remove('open');
  document.body.style.overflow = '';
};

// ── INIT ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  setupMobileMenu();
  updateCartUI();
});
