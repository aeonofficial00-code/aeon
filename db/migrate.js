/**
 * db/migrate.js – Runs schema.sql to create tables if they don't exist.
 * Safe to run multiple times (uses IF NOT EXISTS).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    try {
        await pool.query(sql);
        console.log('✅ Database migration complete.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        throw err;
    } finally {
        await pool.end();
    }
}

migrate();
