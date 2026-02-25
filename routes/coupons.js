/**
 * routes/coupons.js – Coupon/discount code system
 * POST /api/coupons/apply  { code, subtotal }  -> { discount, finalTotal, coupon }
 * POST /api/admin/coupons  – create coupon (admin only)
 */
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// ── POST /api/coupons/apply ───────────────────────────────────────────────────
router.post('/apply', express.json(), async (req, res) => {
    const { code, subtotal } = req.body;
    if (!code || !subtotal) return res.status(400).json({ error: 'code and subtotal required' });

    try {
        const { rows } = await pool.query(
            `SELECT * FROM coupons
             WHERE UPPER(code)=UPPER($1) AND active=true
             AND (expires_at IS NULL OR expires_at > NOW())
             AND (max_uses IS NULL OR uses_count < max_uses)`,
            [code.trim()]
        );
        if (!rows.length) return res.status(404).json({ error: 'Invalid or expired coupon' });
        const coupon = rows[0];

        if (parseFloat(subtotal) < parseFloat(coupon.min_order || 0))
            return res.status(400).json({ error: `Minimum order of ₹${coupon.min_order} required` });

        let discount = 0;
        if (coupon.discount_type === 'percent') {
            discount = Math.round((parseFloat(subtotal) * parseFloat(coupon.discount_value)) / 100);
        } else {
            discount = Math.min(parseFloat(coupon.discount_value), parseFloat(subtotal));
        }

        res.json({
            discount,
            couponId: coupon.id,
            code: coupon.code,
            description: coupon.discount_type === 'percent'
                ? `${coupon.discount_value}% off`
                : `₹${discount} off`
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Increment coupon uses (called after order success) ────────────────────────
router.post('/used/:id', async (req, res) => {
    try {
        await pool.query(`UPDATE coupons SET uses_count=uses_count+1 WHERE id=$1`, [req.params.id]);
        res.json({ ok: true });
    } catch { res.json({ ok: false }); }
});

module.exports = router;
