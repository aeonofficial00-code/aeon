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

function renderCartItems() {
  const list = document.getElementById('cart-items-list');
  const footer = document.getElementById('cart-footer');
  if (!list) return;

  if (!cart.length) {
    list.innerHTML = `
      <div class="cart-empty">
        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 01-8 0"/>
        </svg>
        <p>Your cart is empty</p>
        <a href="#collections" class="btn btn-gold" style="width:auto;" onclick="closeCart()">Shop Now</a>
      </div>
    `;
    if (footer) footer.style.display = 'none';
    return;
  }

  list.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img class="cart-item-img" src="${item.images && item.images[0] ? item.images[0] : ''}" alt="${item.name}" />
      <div class="cart-item-info">
        <p class="cart-item-name">${item.name}</p>
        <p class="cart-item-cat">${item.category}</p>
        <p class="cart-item-price">₹${(item.price * (item.qty || 1)).toLocaleString('en-IN')} ${item.qty > 1 ? `<small style="color:var(--text-muted);">×${item.qty}</small>` : ''}</p>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">✕</button>
    </div>
  `).join('');

  const total = cart.reduce((s, i) => s + i.price * (i.qty || 1), 0);
  const totalEl = document.getElementById('cart-total');
  if (totalEl) totalEl.textContent = `₹${total.toLocaleString('en-IN')}`;
  if (footer) footer.style.display = 'block';
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
      userSlot.style.gap = '12px';
      userSlot.innerHTML = `
              ${user.isAdmin ? `<a href="/admin" class="nav-icon-btn" title="Admin Dashboard" style="font-size:11px;letter-spacing:1.5px;color:var(--gold);padding:0 10px;text-transform:uppercase;text-decoration:none;font-weight:600;border:1px solid rgba(201,169,110,0.3);border-radius:6px;">Admin ↗</a>` : ''}
              <span style="font-size:12px;letter-spacing:0.5px;color:var(--text-muted);">Hi, ${firstName}</span>
              <a href="/auth/logout" style="font-size:11px;letter-spacing:1px;color:rgba(255,255,255,0.3);text-decoration:none;transition:color 0.2s;" onmouseover="this.style.color='#ff8080'" onmouseout="this.style.color='rgba(255,255,255,0.3)'">Sign out</a>
            `;
    } else {
      userSlot.innerHTML = `
              <a href="/login" class="nav-icon-btn" title="Sign in" style="font-size:11px;letter-spacing:1px;color:var(--text-muted);padding:0 6px;text-decoration:none;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-right:4px;vertical-align:middle;"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Sign in
              </a>
            `;
    }
  }).catch(() => { });
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
