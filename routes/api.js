const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// ── Helper: parse base64 buffer from DB value ─────────────────────────────────
function sendBase64Image(res, data) {
    if (!data) return res.status(404).end();
    const comma = data.indexOf(',');
    const meta = data.substring(5, comma);         // e.g. "image/png;base64"
    const mime = meta.split(';')[0];
    const buf = Buffer.from(data.substring(comma + 1), 'base64');
    res.set('Content-Type', mime)
        .set('Cache-Control', 'public, max-age=86400')
        .send(buf);
}

// ── GET /api/categories ───────────────────────────────────────────────────────
// Returns lightweight list – cover is a URL, not base64
router.get('/categories', async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.description,
        c.parent_id,
        (SELECT COUNT(*) FROM products p WHERE LOWER(p.category) = LOWER(c.name)) AS count,
        CASE WHEN c.cover_data IS NOT NULL THEN '/api/categories/' || c.id || '/cover' ELSE NULL END AS cover
      FROM categories c
      ORDER BY c.parent_id NULLS FIRST, c.name
    `);
        // Build subcategories map
        const cats = rows.map(r => ({ ...r, count: parseInt(r.count), subcategories: [] }));
        const byId = Object.fromEntries(cats.map(c => [c.id, c]));
        const top = [];
        cats.forEach(c => {
            if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].subcategories.push(c);
            else if (!c.parent_id) top.push(c);
        });
        res.json(cats); // flat list with subcategories nested
    } catch (err) {
        console.error('/api/categories error:', err.message);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

// ── GET /api/subcategories?parent=Name ────────────────────────────────
router.get('/subcategories', async (req, res) => {
    try {
        const { parent } = req.query;
        if (!parent) return res.json([]);
        const { rows } = await pool.query(
            `SELECT c.id, c.name, (SELECT COUNT(*) FROM products p WHERE LOWER(p.category) = LOWER(c.name)) AS count
             FROM categories c
             JOIN categories p ON c.parent_id = p.id
             WHERE LOWER(p.name) = LOWER($1)
             ORDER BY c.name`,
            [parent]
        );
        res.json(rows.map(r => ({ ...r, count: parseInt(r.count) })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/categories/:id/cover (serve binary image, cached) ────────────────
router.get('/categories/:id/cover', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT cover_data FROM categories WHERE id=$1`, [req.params.id]
        );
        sendBase64Image(res, rows[0]?.cover_data);
    } catch (err) { res.status(500).end(); }
});

// ── GET /api/products ─────────────────────────────────────────────────────────
// Lightweight list – no images in response, thumb is a URL
router.get('/products', async (req, res) => {
    try {
        const { category } = req.query;
        const cat = category ? decodeURIComponent(category) : null;
        const { rows } = await pool.query(
            `SELECT p.id, p.name, p.category, p.price, p.description, p.featured, p.is_on_sale, p.sale_price, p.stock, p.stock_status, p.created_at,
              '/api/products/' || p.id || '/thumb' AS thumb
       FROM products p
       LEFT JOIN categories c ON LOWER(p.category) = LOWER(c.name)
       LEFT JOIN categories parent ON c.parent_id = parent.id
       ${cat ? "WHERE LOWER(p.category) = LOWER($1) OR LOWER(parent.name) = LOWER($1)" : ""}
       ORDER BY p.featured DESC, p.created_at DESC`,
            cat ? [cat] : []
        );
        res.json(rows);
    } catch (err) {
        console.error('/api/products error:', err.message);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

// ── GET /api/products/:id/thumb (serve first image as binary) ─────────────────
router.get('/products/:id/thumb', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT images->0 AS img FROM products WHERE id=$1`, [req.params.id]
        );
        const raw = rows[0]?.img;
        // raw might be a JSON string (e.g. "\"data:image/...\"") — unquote it
        const data = typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : null;
        sendBase64Image(res, data);
    } catch (err) { res.status(500).end(); }
});

// ── GET /api/products/:id (full product with images array) ────────────────────
router.get('/products/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM products WHERE id=$1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        const p = rows[0];
        // Build image URLs instead of returning raw base64
        const imageUrls = (p.images || []).map((_, i) => `/api/products/${p.id}/image/${i}`);
        res.json({ ...p, imageUrls, images: undefined });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// ── GET /api/products/:id/image/:idx (serve nth image as binary) ──────────────
router.get('/products/:id/image/:idx', async (req, res) => {
    try {
        const idx = parseInt(req.params.idx) || 0;
        const { rows } = await pool.query(
            `SELECT images->${idx} AS img FROM products WHERE id=$1`, [req.params.id]
        );
        const raw = rows[0]?.img;
        const data = typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : null;
        sendBase64Image(res, data);
    } catch (err) { res.status(500).end(); }
});

// ── GET /api/featured ─────────────────────────────────────────────────────────
router.get('/featured', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, name, category, price, description, featured, stock_status, created_at,
              '/api/products/' || id || '/thumb' AS thumb
       FROM products WHERE featured=true ORDER BY created_at DESC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// ── GET /api/sale ──────────────────────────────────────────────────────
router.get('/sale', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, name, category, price, sale_price, is_on_sale, description, stock_status, created_at,
              '/api/products/' || id || '/thumb' AS thumb
       FROM products WHERE is_on_sale=true ORDER BY created_at DESC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// ── GET /api/products/:id/reviews ─────────────────────────────────────────────
router.get('/products/:id/reviews', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, reviewer_name, rating, comment, created_at
             FROM reviews WHERE product_id=$1 ORDER BY created_at DESC`,
            [req.params.id]
        );
        const avg = rows.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length) : 0;
        res.json({ reviews: rows, avg: Math.round(avg * 10) / 10, count: rows.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/products/:id/reviews ───────────────────────────────────────────
router.post('/products/:id/reviews', express.json(), async (req, res) => {
    const { name, rating, comment } = req.body;
    if (!name || !rating || rating < 1 || rating > 5)
        return res.status(400).json({ error: 'Name and rating (1-5) required' });
    try {
        const userId = req.isAuthenticated?.() ? req.user?.id : null;
        const { rows } = await pool.query(
            `INSERT INTO reviews (product_id, user_id, reviewer_name, rating, comment)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [req.params.id, userId, name.slice(0, 60), parseInt(rating), comment?.slice(0, 500) || null]
        );
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/stats (admin revenue dashboard) ──────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const [orders, products, users, revenue] = await Promise.all([
            pool.query(`SELECT COUNT(*), status FROM orders GROUP BY status`),
            pool.query(`SELECT COUNT(*) FROM products`),
            pool.query(`SELECT COUNT(*) FROM users`),
            pool.query(`SELECT COALESCE(SUM(total),0) AS revenue FROM orders WHERE status IN ('paid','delivered','shipped')`)
        ]);
        const statusMap = {};
        orders.rows.forEach(r => statusMap[r.status] = parseInt(r.count));
        res.json({
            totalOrders: Object.values(statusMap).reduce((a, b) => a + b, 0),
            pending: statusMap.pending || 0,
            revenue: parseFloat(revenue.rows[0].revenue),
            products: parseInt(products.rows[0].count),
            users: parseInt(users.rows[0].count)
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/debug ────────────────────────────────────────────────────────────
router.get('/debug', async (req, res) => {
    try {
        const [cats, prods] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM categories'),
            pool.query('SELECT COUNT(*) FROM products')
        ]);
        res.json({ status: 'ok', categories: parseInt(cats.rows[0].count), products: parseInt(prods.rows[0].count) });
    } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

module.exports = router;
