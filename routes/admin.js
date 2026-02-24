const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../db/pool');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// ── Multer storage ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── In-memory token store (maps token → email) ───────────────────────────────
const validTokens = new Map(); // token → email

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
    const token = req.headers['x-admin-token'];
    // Accept token from simple login or Google OAuth session
    if (token && validTokens.has(token)) return next();
    if (req.session?.isAdmin && req.session?.adminToken === token) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

// ── POST /api/admin/login (password-based, kept as fallback) ─────────────────
router.post('/login', (req, res) => {
    const { password } = req.body;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'aeon2024';
    if (password === ADMIN_PASSWORD) {
        const token = crypto.randomUUID();
        validTokens.set(token, 'admin');
        return res.json({ token });
    }
    res.status(401).json({ error: 'Invalid password' });
});

// ── POST /api/admin/logout ────────────────────────────────────────────────────
router.post('/logout', auth, (req, res) => {
    const token = req.headers['x-admin-token'];
    validTokens.delete(token);
    res.json({ message: 'Logged out' });
});

// ── GET /api/admin/products ───────────────────────────────────────────────────
router.get('/products', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM products ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ── POST /api/admin/products ──────────────────────────────────────────────────
router.post('/products', auth, upload.array('images', 10), async (req, res) => {
    try {
        const { name, category, price, description, featured } = req.body;
        const images = (req.files || []).map(f => `/uploads/${f.filename}`);
        const { rows } = await pool.query(
            `INSERT INTO products (name, category, price, description, images, featured)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, category, parseFloat(price) || 0, description || '', JSON.stringify(images), featured === 'true']
        );
        // Upsert category
        await pool.query(`INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [category]);
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ── PUT /api/admin/products/:id ───────────────────────────────────────────────
router.put('/products/:id', auth, upload.array('images', 10), async (req, res) => {
    try {
        const { name, category, price, description, featured, keepImages } = req.body;
        const newFiles = (req.files || []).map(f => `/uploads/${f.filename}`);

        // Get existing images
        const { rows: existing } = await pool.query(`SELECT images FROM products WHERE id = $1`, [req.params.id]);
        if (!existing.length) return res.status(404).json({ error: 'Not found' });

        const existingImages = keepImages === 'false' ? [] : (existing[0].images || []);
        const images = [...existingImages, ...newFiles];

        const { rows } = await pool.query(
            `UPDATE products SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        price = COALESCE($3, price),
        description = COALESCE($4, description),
        images = $5,
        featured = COALESCE($6, featured),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
            [name, category, price ? parseFloat(price) : null, description, JSON.stringify(images), featured !== undefined ? featured === 'true' : null, req.params.id]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ── DELETE /api/admin/products/:id ────────────────────────────────────────────
router.delete('/products/:id', auth, async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, email, name, avatar, role, created_at FROM users ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ── Export token store (for Google OAuth to register new tokens) ──────────────
module.exports = router;
module.exports.validTokens = validTokens;
