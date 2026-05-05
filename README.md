# AEONV Jewellery – E-Commerce Website

A modern, luxury jewellery e-commerce website for the **AEONV** brand with an admin dashboard and Render.com deployment.

---

## 🚀 Quick Start (Local)

```bash
npm install
node scripts/seed.js   # seed products from categoriess/ images (auto-runs on Render build)
npm start              # starts on http://localhost:3000
```

## 🔐 Admin Dashboard

URL: `http://localhost:3000/admin`  
Default password: **`aeon2024`**

> **For production on Render:** Change `ADMIN_PASSWORD` in the Render dashboard → Environment Variables.

---

## 🌐 Deploy to Render.com

1. Push this project to a **GitHub repository**
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` – all settings are pre-configured
5. Set `ADMIN_PASSWORD` to a strong password in **Environment → Add Variable**
6. Click **Deploy** ✅

### Important Notes
- The `categoriess/` folder must be included in your commit (it contains the product images)
- Uploaded admin images go to `uploads/` – these will reset on Render free tier redeploys (use persistent disk or cloud storage for production)
- `data/products.json` persists during runtime but resets on redeploy – consider migrating to a database (MongoDB, Supabase) for production

---

## 📁 Project Structure

```
jewellery_shop/
├── server.js          # Express server entry point
├── routes/
│   ├── api.js         # Public API routes
│   └── admin.js       # Admin API routes (auth protected)
├── scripts/
│   └── seed.js        # Auto-seeds products from categoriess/
├── data/
│   └── products.json  # Product database (JSON file)
├── categoriess/       # Your original jewellery images (13 categories)
├── uploads/           # Admin-uploaded product images
├── public/
│   ├── index.html     # Homepage
│   ├── category.html  # Category page
│   ├── product.html   # Product detail page
│   ├── css/
│   │   └── styles.css # Luxury gold design system
│   ├── js/
│   │   └── main.js    # Shared JS (cart, nav, helpers)
│   └── admin/
│       ├── index.html    # Admin login
│       ├── dashboard.html # Admin product management
│       └── admin.js      # Admin JS logic
├── render.yaml        # Render.com deployment config
└── package.json
```

---

## 📦 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | All categories with cover image |
| GET | `/api/products` | All products (optional `?category=` filter) |
| GET | `/api/products/:id` | Single product |
| GET | `/api/featured` | Featured products only |
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/products` | All products (admin) |
| POST | `/api/admin/products` | Add product + images |
| PUT | `/api/admin/products/:id` | Edit product |
| DELETE | `/api/admin/products/:id` | Delete product |
