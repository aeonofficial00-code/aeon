const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// ── Auth helper ───────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
    if (req.isAuthenticated?.() && req.user) return next();
    return res.status(401).json({ error: 'Please log in to pre-book an item.' });
}

function requireAdmin(req, res, next) {
    if (req.isAuthenticated?.() && ADMIN_EMAILS.includes((req.user?.email || '').toLowerCase())) return next();
    if (req.session?.isAdmin) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

// ── Helper: serve base64 image ────────────────────────────────────────────────
function sendBase64Image(res, data) {
    if (!data) return res.status(404).end();
    const comma = data.indexOf(',');
    const meta = data.substring(5, comma);
    const mime = meta.split(';')[0];
    const buf = Buffer.from(data.substring(comma + 1), 'base64');
    res.set('Content-Type', mime).set('Cache-Control', 'public, max-age=86400').send(buf);
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/preorders – active listings (no images in payload) ───────────────
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, name, category, description, price, expected_delivery,
                   closes_at, max_slots, is_active, created_at,
                   '/api/preorders/' || id || '/thumb' AS thumb,
                   (SELECT COUNT(*) FROM prebook_requests WHERE listing_id = pl.id) AS booked_count
            FROM preorder_listings pl
            WHERE is_active = true
            ORDER BY created_at DESC
        `);
        res.json(rows.map(r => ({ ...r, booked_count: parseInt(r.booked_count) })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/preorders/:id/thumb ──────────────────────────────────────────────
router.get('/:id/thumb', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT image FROM preorder_listings WHERE id=$1`, [req.params.id]);
        sendBase64Image(res, rows[0]?.image);
    } catch (err) { res.status(500).end(); }
});

// ── POST /api/preorders/:id/book – requires login ─────────────────────────────
router.post('/:id/book', requireAuth, express.json(), async (req, res) => {
    const { quantity = 1 } = req.body;
    const qty = Math.max(1, Math.min(10, parseInt(quantity) || 1));
    try {
        // Check listing exists and is active
        const { rows: listing } = await pool.query(
            `SELECT id, name, max_slots, closes_at FROM preorder_listings WHERE id=$1 AND is_active=true`,
            [req.params.id]
        );
        if (!listing.length) return res.status(404).json({ error: 'Pre-order listing not found or closed.' });

        const l = listing[0];

        // Check if closed by date
        if (l.closes_at && new Date(l.closes_at) < new Date()) {
            return res.status(400).json({ error: 'Pre-booking period has ended.' });
        }

        // Check max slots
        if (l.max_slots !== null) {
            const { rows: countRows } = await pool.query(
                `SELECT COALESCE(SUM(quantity),0) AS total FROM prebook_requests WHERE listing_id=$1`,
                [l.id]
            );
            if (parseInt(countRows[0].total) + qty > l.max_slots) {
                return res.status(400).json({ error: 'No slots remaining for this pre-order.' });
            }
        }

        // Check if user already booked this listing
        const { rows: existing } = await pool.query(
            `SELECT id FROM prebook_requests WHERE listing_id=$1 AND user_id=$2`,
            [l.id, req.user.id]
        );
        if (existing.length) {
            return res.status(400).json({ error: 'You have already pre-booked this item.' });
        }

        await pool.query(
            `INSERT INTO prebook_requests (listing_id, user_id, quantity) VALUES ($1,$2,$3)`,
            [l.id, req.user.id, qty]
        );

        res.json({ success: true, message: `Pre-booking confirmed for "${l.name}"! We'll contact you soon.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES  (all require admin auth)
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/preorders/admin/listings ─────────────────────────────────────────
router.get('/admin/listings', requireAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT pl.id, pl.name, pl.category, pl.price, pl.expected_delivery,
                   pl.closes_at, pl.max_slots, pl.is_active, pl.created_at,
                   (SELECT COUNT(*) FROM prebook_requests WHERE listing_id = pl.id) AS booked_count
            FROM preorder_listings pl ORDER BY pl.created_at DESC
        `);
        res.json(rows.map(r => ({ ...r, booked_count: parseInt(r.booked_count) })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/preorders/admin/bookings – all booking requests ──────────────────
router.get('/admin/bookings', requireAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT pbr.id, pbr.quantity, pbr.created_at,
                   pl.name AS listing_name, pl.price,
                   u.name AS user_name, u.email AS user_email
            FROM prebook_requests pbr
            JOIN preorder_listings pl ON pbr.listing_id = pl.id
            LEFT JOIN users u ON pbr.user_id = u.id
            ORDER BY pbr.created_at DESC
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/preorders/admin/listings ────────────────────────────────────────
router.post('/admin/listings', requireAdmin, express.json({ limit: '25mb' }), async (req, res) => {
    try {
        const { name, category, description, price, image, expected_delivery, closes_at, max_slots, is_active } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        const { rows } = await pool.query(
            `INSERT INTO preorder_listings (name, category, description, price, image, expected_delivery, closes_at, max_slots, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, category, price, expected_delivery, closes_at, max_slots, is_active, created_at`,
            [name.trim(), category || '', description || '', parseFloat(price) || 0,
            image || null, expected_delivery || null,
            closes_at || null, max_slots ? parseInt(max_slots) : null,
            is_active !== false]
        );
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/preorders/admin/listings/:id ────────────────────────────────────
router.put('/admin/listings/:id', requireAdmin, express.json({ limit: '25mb' }), async (req, res) => {
    try {
        const { name, category, description, price, image, expected_delivery, closes_at, max_slots, is_active } = req.body;
        const { rows } = await pool.query(
            `UPDATE preorder_listings SET
                name=$1, category=$2, description=$3, price=$4,
                ${image ? 'image=$5,' : ''}
                expected_delivery=$${image ? 6 : 5}, closes_at=$${image ? 7 : 6},
                max_slots=$${image ? 8 : 7}, is_active=$${image ? 9 : 8}, updated_at=NOW()
             WHERE id=$${image ? 10 : 9}
             RETURNING id, name, category, price, expected_delivery, closes_at, max_slots, is_active`,
            image
                ? [name, category || '', description || '', parseFloat(price) || 0, image, expected_delivery || null, closes_at || null, max_slots ? parseInt(max_slots) : null, is_active !== false, req.params.id]
                : [name, category || '', description || '', parseFloat(price) || 0, expected_delivery || null, closes_at || null, max_slots ? parseInt(max_slots) : null, is_active !== false, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/preorders/admin/listings/:id ─────────────────────────────────
router.delete('/admin/listings/:id', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM preorder_listings WHERE id=$1`, [req.params.id]);
        if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
