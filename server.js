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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use(express.static(path.join(__dirname, 'public')));
app.use('/categoriess', express.static(path.join(__dirname, 'categoriess')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Routes ────────────────────────────────────────────────────────────────────
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');
const authRouter = require('./routes/auth');

app.use('/api', apiRouter);
app.use('/api/admin', adminRouter);
app.use('/auth', authRouter);

// ── Catch-all (serve index.html) ─────────────────────────────────────────────
app.get('/{*splat}', (req, res) => {
    const file = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(file)) res.sendFile(file);
    else res.status(404).send('Not found');
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
