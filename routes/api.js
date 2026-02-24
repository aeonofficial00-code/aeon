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
        c.name,
        c.description,
        (SELECT COUNT(*) FROM products p WHERE LOWER(p.category) = LOWER(c.name)) AS count,
        CASE WHEN c.cover_data IS NOT NULL THEN '/api/categories/' || c.id || '/cover' ELSE NULL END AS cover
      FROM categories c
      ORDER BY c.name
    `);
        res.json(rows.map(r => ({ ...r, count: parseInt(r.count) })));
    } catch (err) {
        console.error('/api/categories error:', err.message);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
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
            `SELECT id, name, category, price, description, featured, created_at,
              '/api/products/' || id || '/thumb' AS thumb
       FROM products
       ${cat ? "WHERE LOWER(category) = LOWER($1)" : ""}
       ORDER BY featured DESC, created_at DESC`,
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
            `SELECT id, name, category, price, description, featured, created_at,
              '/api/products/' || id || '/thumb' AS thumb
       FROM products WHERE featured=true ORDER BY created_at DESC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// ── GET /api/debug (check DB state on Render) ─────────────────────────────────
router.get('/debug', async (req, res) => {
    try {
        const [cats, prods] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM categories'),
            pool.query('SELECT COUNT(*) FROM products')
        ]);
        res.json({
            status: 'ok',
            categories: parseInt(cats.rows[0].count),
            products: parseInt(prods.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
