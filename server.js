require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db/pool');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// ── Database migration on startup ─────────────────────────────────────────────
async function runMigration() {
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    if (!fs.existsSync(schemaPath)) return;
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    try {
        await pool.query(sql);
        console.log('✅ DB migration complete.');
    } catch (err) {
        console.warn('⚠️  DB migration warning (may already exist):', err.message);
    }
}

// ── Passport Google Strategy ──────────────────────────────────────────────────
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER_CLIENT_SECRET',
    callbackURL: `${APP_URL}/auth/google/callback`,
    scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails?.[0]?.value || '';
        const name = profile.displayName || '';
        const avatar = profile.photos?.[0]?.value || '';
        const googleId = profile.id;

        const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
        const role = ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'customer';

        // Upsert user
        const { rows } = await pool.query(
            `INSERT INTO users (google_id, email, name, avatar, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (google_id) DO UPDATE
         SET email = EXCLUDED.email,
             name = EXCLUDED.name,
             avatar = EXCLUDED.avatar,
             role = EXCLUDED.role
       RETURNING *`,
            [googleId, email, name, avatar, role]
        );
        return done(null, rows[0]);
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
        done(null, rows[0] || false);
    } catch (err) {
        done(err);
    }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session (DB-backed, required for Render)
app.use(session({
    store: new PgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'aeon-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/categoriess', express.static(path.join(__dirname, 'categoriess')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Explicit page routes (so /login and /admin work without .html)
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html')));

// Ensure uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Routes ────────────────────────────────────────────────────────────────────
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');
const authRouter = require('./routes/auth');
const ordersRouter = require('./routes/orders');
const couponsRouter = require('./routes/coupons');

app.use('/api', apiRouter);
app.use('/api/admin', adminRouter);
app.use('/auth', authRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/coupons', couponsRouter);

// ── Page routes ───────────────────────────────────────────────────────────────
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/order-success', (req, res) => res.sendFile(path.join(__dirname, 'public', 'order-success.html')));
app.get('/orders', (req, res) => res.sendFile(path.join(__dirname, 'public', 'orders.html')));

// ── Sitemap.xml ───────────────────────────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
    const base = APP_URL;
    try {
        const [{ rows: products }, { rows: cats }] = await Promise.all([
            pool.query(`SELECT id, updated_at FROM products ORDER BY updated_at DESC`),
            pool.query(`SELECT name FROM categories`)
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const urls = [
            `<url><loc>${base}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
            ...cats.map(c => `<url><loc>${base}/category.html?c=${encodeURIComponent(c.name)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
            ...products.map(p => `<url><loc>${base}/product.html?id=${p.id}</loc><lastmod>${(p.updated_at || new Date()).toISOString().slice(0, 10)}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`)
        ];
        res.header('Content-Type', 'application/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
    } catch (e) {
        res.status(500).send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');
    }
});

// ── robots.txt ────────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nSitemap: ${APP_URL}/sitemap.xml`);
});

// ── Catch-all (serve index.html or 404) ──────────────────────────────────────
app.get('/{*splat}', (req, res) => {
    const file = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(file)) res.sendFile(file);
    else {
        const notFound = path.join(__dirname, 'public', '404.html');
        res.status(404).sendFile(fs.existsSync(notFound) ? notFound : file);
    }
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
    // Only run DB migration if DATABASE_URL is set
    if (process.env.DATABASE_URL) {
        await runMigration();
    } else {
        console.warn('⚠️  DATABASE_URL not set. Running without database (API routes will fail).');
        console.warn('   Copy .env.example to .env and fill in your values.');
    }

    app.listen(PORT, () => {
        console.log(`✨ AEON Jewellery running at http://localhost:${PORT}`);
        if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'PLACEHOLDER_CLIENT_ID') {
            console.warn('⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
        }
    });
}

start();
