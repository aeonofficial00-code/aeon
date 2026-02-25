/**
 * routes/orders.js  – Cart checkout & Razorpay payment flow
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const pool = require('../db/pool');

// ── Razorpay instance ─────────────────────────────────────────────────────────
const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

const DELIVERY_THRESHOLD = 999;   // free delivery above ₹999
const DELIVERY_CHARGE = 99;    // ₹99 delivery below threshold

// ── POST /api/orders/create ───────────────────────────────────────────────────
// Body: { items: [{id,name,price,qty,thumb}], address: {name,phone,line1,city,state,pincode}, email? }
router.post('/create', express.json(), async (req, res) => {
    try {
        const { items, address, email } = req.body;
        if (!items?.length) return res.status(400).json({ error: 'Cart is empty' });
        if (!address?.name || !address?.phone || !address?.line1 || !address?.pincode)
            return res.status(400).json({ error: 'Incomplete address' });

        // Validate items against DB prices (prevent price tampering)
        const ids = items.map(i => i.id);
        const { rows: dbProducts } = await pool.query(
            `SELECT id::text, price FROM products WHERE id = ANY($1::uuid[])`, [ids]
        );
        const priceMap = Object.fromEntries(dbProducts.map(p => [p.id, parseFloat(p.price)]));

        let subtotal = 0;
        const validatedItems = items.map(item => {
            const dbPrice = priceMap[item.id] ?? parseFloat(item.price);
            const qty = Math.max(1, parseInt(item.qty) || 1);
            subtotal += dbPrice * qty;
            return { ...item, price: dbPrice, qty };
        });

        const deliveryCharge = subtotal >= DELIVERY_THRESHOLD ? 0 : DELIVERY_CHARGE;
        const total = subtotal + deliveryCharge;
        const totalPaise = Math.round(total * 100); // Razorpay uses paise

        // Create Razorpay order
        const rzpOrder = await rzp.orders.create({
            amount: totalPaise,
            currency: 'INR',
            receipt: `aeon_${Date.now()}`,
            notes: { customer: address.name, phone: address.phone }
        });

        // Save pending order to DB
        const userId = req.user?.id || null;
        const { rows } = await pool.query(
            `INSERT INTO orders (user_id, guest_email, items, address, subtotal, delivery_charge, total, razorpay_order_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING id`,
            [userId, email || null, JSON.stringify(validatedItems), JSON.stringify(address),
                subtotal, deliveryCharge, total, rzpOrder.id]
        );

        res.json({
            orderId: rows[0].id,
            razorpayOrderId: rzpOrder.id,
            amount: totalPaise,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID,
            prefill: {
                name: address.name,
                email: email || req.user?.email || '',
                contact: address.phone
            }
        });
    } catch (err) {
        console.error('Order create error:', err.message);
        if (err.message?.includes('key_id') || err.message?.includes('key_secret')) {
            return res.status(500).json({ error: 'Razorpay not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/orders/verify ───────────────────────────────────────────────────
// Called after successful Razorpay payment to verify signature and mark paid
router.post('/verify', express.json(), async (req, res) => {
    try {
        const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        // Verify HMAC signature
        const body = razorpayOrderId + '|' + razorpayPaymentId;
        const expected = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
            .update(body)
            .digest('hex');

        if (expected !== razorpaySignature) {
            return res.status(400).json({ error: 'Payment verification failed. Invalid signature.' });
        }

        // Mark order as paid
        const { rows } = await pool.query(
            `UPDATE orders SET status='paid', razorpay_payment_id=$1, razorpay_signature=$2, updated_at=NOW()
       WHERE id=$3 RETURNING *`,
            [razorpayPaymentId, razorpaySignature, orderId]
        );

        // Send confirmation emails (non-blocking)
        if (rows[0]) {
            const { sendOrderConfirmation, sendAdminOrderAlert } = require('../utils/mailer');
            sendOrderConfirmation(rows[0]).catch(e => console.warn('Email error:', e.message));
            sendAdminOrderAlert(rows[0]).catch(e => console.warn('Admin email error:', e.message));
        }

        res.json({ success: true, orderId });
    } catch (err) {
        console.error('Order verify error:', err.message);
        res.status(500).json({ error: err.message });
    }
});


// ── GET /api/orders/my ────────────────────────────────────────────────────────
router.get('/my', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in to view orders' });
    try {
        const { rows } = await pool.query(
            `SELECT id, items, address, subtotal, delivery_charge, total, status, razorpay_payment_id, created_at
       FROM orders WHERE user_id=$1 ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM orders WHERE id=$1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Order not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
