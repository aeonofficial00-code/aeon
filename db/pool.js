const { Pool } = require('pg');

// Enable SSL for any external DB (Render, etc) — not for local Postgres
const isExternal = process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes('localhost') &&
    !process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isExternal ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL error:', err);
});

module.exports = pool;
