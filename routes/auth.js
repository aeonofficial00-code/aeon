const express = require('express');
const passport = require('passport');
const router = express.Router();
const pool = require('../db/pool');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// ── Google OAuth init ─────────────────────────────────────────────────────────
// GET /auth/google  (add ?redirect=admin for admin flow)
router.get('/google', (req, res, next) => {
    const redirect = req.query.redirect || 'home';
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: redirect
    })(req, res, next);
});

// GET /auth/google/callback
router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login?error=auth_failed' }),
    async (req, res) => {
        const redirect = req.query.state || 'home';
        const email = req.user?.email?.toLowerCase() || '';

        if (redirect === 'admin') {
            if (ADMIN_EMAILS.includes(email)) {
                // Issue an admin session token stored in the session
                req.session.adminToken = require('crypto').randomBytes(32).toString('hex');
                req.session.isAdmin = true;
                return res.redirect('/admin/?auth=google');
            } else {
                return res.redirect('/admin/?error=not_admin');
            }
        }

        // Regular user – go to home
        res.redirect('/');
    }
);

// GET /auth/logout
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

// GET /auth/me – returns current user (used by frontend)
router.get('/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            avatar: req.user.avatar,
            role: req.user.role,
            isAdmin: req.session.isAdmin || ADMIN_EMAILS.includes((req.user.email || '').toLowerCase())
        }
    });
});

// GET /auth/admin-token – returns admin token for API calls (after Google login)
router.get('/admin-token', (req, res) => {
    if (!req.session.isAdmin || !req.session.adminToken) {
        return res.status(401).json({ error: 'Not an admin' });
    }
    res.json({ token: req.session.adminToken });
});

module.exports = router;
