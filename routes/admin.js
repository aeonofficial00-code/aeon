const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db/pool');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// ── Token store ───────────────────────────────────────────────────────────────
const validTokens = new Map();

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (!token) return res.status(401).json({ error: 'No token' });
    if (req.session?.adminToken && req.session.adminToken === token) return next();
    if (req.session?.isAdmin) return next();
    if (req.isAuthenticated?.() && ADMIN_EMAILS.includes((req.user?.email || '').toLowerCase())) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

// ── GET /api/admin/orders – all orders with items + address ───────────────────
router.get('/orders', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, user_id, guest_email, items, address, subtotal, delivery_charge, total,
              status, razorpay_order_id, razorpay_payment_id, created_at
       FROM orders ORDER BY created_at DESC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/admin/orders/:id/status – update delivery status ───────────────
router.patch('/orders/:id/status', auth, express.json(), async (req, res) => {
    const allowed = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    const { status } = req.body;
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    try {
        await pool.query(
            `UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2`,
            [status, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/admin/login ─────────────────────────────────────────────────────
router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === (process.env.ADMIN_PASSWORD || 'aeon2024')) {
        const token = crypto.randomUUID();
        validTokens.set(token, 'admin');
        return res.json({ token });
    }
    res.status(401).json({ error: 'Invalid password' });
});

// ── POST /api/admin/logout ────────────────────────────────────────────────────
router.post('/logout', auth, (req, res) => {
    validTokens.delete(req.headers['x-admin-token']);
    res.json({ message: 'Logged out' });
});

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/categories ─────────────────────────────────────────────────
router.get('/categories', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, name, description, cover_name, created_at FROM categories ORDER BY name`);
        // Return cover data URLs separately for listing (don't send base64 in list view)
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/admin/categories/:id/cover ──────────────────────────────────────
router.get('/categories/:id/cover', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT cover_data, cover_name FROM categories WHERE id=$1`, [req.params.id]);
        if (!rows.length || !rows[0].cover_data) return res.status(404).send('');
        const data = rows[0].cover_data.split(',');
        const mime = data[0].split(':')[1].split(';')[0];
        const buf = Buffer.from(data[1], 'base64');
        res.set('Content-Type', mime).send(buf);
    } catch (err) { res.status(500).send(''); }
});

// ── POST /api/admin/categories ────────────────────────────────────────────────
router.post('/categories', auth, express.json({ limit: '25mb' }), async (req, res) => {
    try {
        const { name, description, cover_data, cover_name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const { rows } = await pool.query(
            `INSERT INTO categories (name, description, cover_data, cover_name)
       VALUES ($1,$2,$3,$4) RETURNING id, name, description, cover_name, created_at`,
            [name.trim(), description || '', cover_data || null, cover_name || null]
        );
        res.json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Category already exists' });
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /api/admin/categories/:id ────────────────────────────────────────────
router.put('/categories/:id', auth, express.json({ limit: '25mb' }), async (req, res) => {
    try {
        const { name, description, cover_data, cover_name } = req.body;
        const updates = [];
        const vals = [];
        if (name) { updates.push(`name=$${vals.push(name)}`); }
        if (description !== undefined) { updates.push(`description=$${vals.push(description)}`); }
        if (cover_data) { updates.push(`cover_data=$${vals.push(cover_data)}`); updates.push(`cover_name=$${vals.push(cover_name || '')}`); }
        if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
        vals.push(req.params.id);
        const { rows } = await pool.query(
            `UPDATE categories SET ${updates.join(',')} WHERE id=$${vals.length} RETURNING id, name, description, cover_name`,
            vals
        );
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/admin/categories/:id ─────────────────────────────────────────
router.delete('/categories/:id', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT name FROM categories WHERE id=$1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        await pool.query(`DELETE FROM categories WHERE id=$1`, [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/products ───────────────────────────────────────────────────
router.get('/products', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, name, category, price, description, featured, created_at FROM products ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/admin/products/:id/images ───────────────────────────────────────
// Returns just the images array (base64) for a product
router.get('/products/:id/images', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT images FROM products WHERE id=$1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ images: rows[0].images || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/admin/products – base64 JSON body ───────────────────────────────
router.post('/products', auth, express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { name, category, price, description, featured, images } = req.body;
        if (!name || !category) return res.status(400).json({ error: 'Name and category are required' });
        const { rows } = await pool.query(
            `INSERT INTO products (name, category, price, description, images, featured)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [name, category, parseFloat(price) || 0, description || '', JSON.stringify(images || []), featured === true || featured === 'true']
        );
        // Ensure category entry exists
        await pool.query(`INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [category]);
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/admin/products/:id ───────────────────────────────────────────────
router.put('/products/:id', auth, express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { name, category, price, description, featured, images } = req.body;
        const { rows } = await pool.query(
            `UPDATE products SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        price = COALESCE($3, price),
        description = COALESCE($4, description),
        images = COALESCE($5::jsonb, images),
        featured = COALESCE($6, featured),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
            [name || null, category || null, price ? parseFloat(price) : null, description || null,
            images ? JSON.stringify(images) : null, featured !== undefined ? (featured === true || featured === 'true') : null,
            req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/admin/products/:id ────────────────────────────────────────────
router.delete('/products/:id', auth, async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM products WHERE id=$1`, [req.params.id]);
        if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.validTokens = validTokens;
