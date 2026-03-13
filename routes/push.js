const express = require('express');
const webpush = require('web-push');
const fs = require('fs-extra');
const path = require('path');

const router = express.Router();

// Paths for persistence
const VAPID_KEY_PATH = path.join(__dirname, '../data/vapid.json');
const SUBS_PATH = path.join(__dirname, '../data/subscriptions.json');

// Ensure data dir exists
fs.ensureDirSync(path.join(__dirname, '../data'));

// Initialize VAPID Keys dynamically
let vapidKeys = {};
if (fs.existsSync(VAPID_KEY_PATH)) {
    vapidKeys = fs.readJsonSync(VAPID_KEY_PATH);
} else {
    try {
        vapidKeys = webpush.generateVAPIDKeys();
        fs.writeJsonSync(VAPID_KEY_PATH, vapidKeys);
        console.log('✅ Generated new VAPID keys for Web Push');
    } catch (err) {
        console.warn('⚠️ Could not generate VAPID keys. Web Push will fail if dependencies are missing.');
    }
}

if (vapidKeys.publicKey && vapidKeys.privateKey) {
    webpush.setVapidDetails(
        'mailto:admin@aeon.com',
        vapidKeys.publicKey,
        vapidKeys.privateKey
    );
}

// ── Endpoints ────────────────────────────────────────────────────────────────
router.get('/vapidPublicKey', (req, res) => {
    if (!vapidKeys.publicKey) return res.status(500).json({ error: 'VAPID keys not generated' });
    res.json({ publicKey: vapidKeys.publicKey });
});

router.post('/subscribe', async (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription' });
    }

    try {
        let subs = [];
        if (fs.existsSync(SUBS_PATH)) subs = fs.readJsonSync(SUBS_PATH);
        
        // Save if not already exists
        if (!subs.some(s => s.endpoint === subscription.endpoint)) {
            subs.push(subscription);
            fs.writeJsonSync(SUBS_PATH, subs);
        }
        res.status(201).json({ message: 'Subscribed successfully' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

router.post('/unsubscribe', async (req, res) => {
    const { endpoint } = req.body;
    try {
        if (fs.existsSync(SUBS_PATH)) {
            let subs = fs.readJsonSync(SUBS_PATH);
            subs = subs.filter(s => s.endpoint !== endpoint);
            fs.writeJsonSync(SUBS_PATH, subs);
        }
        res.json({ message: 'Unsubscribed successfully' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// Broadcast helper for admin panel
router.broadcast = async function(payload) {
    let subs = [];
    if (fs.existsSync(SUBS_PATH)) subs = fs.readJsonSync(SUBS_PATH);
    if (!subs.length || !vapidKeys.publicKey) return 0;

    const payloadString = JSON.stringify(payload);
    let successCount = 0;
    let staleEndpoints = [];

    await Promise.all(subs.map(async sub => {
        try {
            await webpush.sendNotification(sub, payloadString);
            successCount++;
        } catch (err) {
            // 410 Gone / 404 Not Found means the subscription is no longer valid
            if (err.statusCode === 410 || err.statusCode === 404) {
                staleEndpoints.push(sub.endpoint);
            } else {
                console.error('Push error:', err);
            }
        }
    }));

    // Cleanup stale subscriptions
    if (staleEndpoints.length > 0) {
        subs = subs.filter(s => !staleEndpoints.includes(s.endpoint));
        fs.writeJsonSync(SUBS_PATH, subs);
    }

    return successCount;
};

module.exports = router;
