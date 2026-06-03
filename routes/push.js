const express = require('express');
const webpush = require('web-push');
const pool = require('../db/pool');

const router = express.Router();

// ── VAPID Keys ────────────────────────────────────────────────────────────────
// Keys are stored in environment variables for production persistence.
// On first run they are auto-generated and printed to logs so you can set them in Render.
let vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    try {
        vapidKeys = webpush.generateVAPIDKeys();
        // Print so the admin can copy them to Render env vars
        console.log('⚠️  VAPID keys not set in environment. Generated new ones — add these to Render:');
        console.log('  VAPID_PUBLIC_KEY =', vapidKeys.publicKey);
        console.log('  VAPID_PRIVATE_KEY =', vapidKeys.privateKey);
    } catch (err) {
        console.warn('⚠️ Could not generate VAPID keys:', err.message);
    }
}

if (vapidKeys.publicKey && vapidKeys.privateKey) {
    webpush.setVapidDetails(
        'mailto:admin@aeon.com',
        vapidKeys.publicKey,
        vapidKeys.privateKey
    );
}

// ── Auto-create table if not exists ──────────────────────────────────────────
pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT UNIQUE NOT NULL,
        subscription JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )
`).then(() => console.log('✅ push_subscriptions table ready'))
  .catch(err => console.error('❌ Failed to create push_subscriptions table:', err.message));

// ── Endpoints ─────────────────────────────────────────────────────────────────
router.get('/vapidPublicKey', (req, res) => {
    if (!vapidKeys.publicKey) return res.status(500).json({ error: 'VAPID keys not configured' });
    res.json({ publicKey: vapidKeys.publicKey });
});

router.post('/subscribe', async (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription object' });
    }
    try {
        await pool.query(
            `INSERT INTO push_subscriptions (endpoint, subscription)
             VALUES ($1, $2)
             ON CONFLICT (endpoint) DO UPDATE SET subscription = EXCLUDED.subscription`,
            [subscription.endpoint, JSON.stringify(subscription)]
        );
        res.status(201).json({ message: 'Subscribed successfully' });
    } catch (e) {
        console.error('Subscribe error:', e);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

router.post('/unsubscribe', async (req, res) => {
    const { endpoint } = req.body;
    try {
        await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
        res.json({ message: 'Unsubscribed successfully' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// ── Broadcast helper (used by /api/admin/push/send) ──────────────────────────
router.broadcast = async function (payload) {
    if (!vapidKeys.publicKey) return 0;

    const { rows } = await pool.query('SELECT subscription FROM push_subscriptions');
    if (!rows.length) return 0;

    const payloadString = JSON.stringify(payload);
    let successCount = 0;
    const staleEndpoints = [];

    await Promise.all(rows.map(async ({ subscription }) => {
        const sub = typeof subscription === 'string' ? JSON.parse(subscription) : subscription;
        try {
            await webpush.sendNotification(sub, payloadString);
            successCount++;
        } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
                staleEndpoints.push(sub.endpoint);
            } else {
                console.error('Push send error:', err.message);
            }
        }
    }));

    // Clean up expired/invalid subscriptions
    if (staleEndpoints.length > 0) {
        await pool.query(
            'DELETE FROM push_subscriptions WHERE endpoint = ANY($1::text[])',
            [staleEndpoints]
        );
        console.log(`🧹 Removed ${staleEndpoints.length} stale push subscription(s)`);
    }

    return successCount;
};

module.exports = router;
