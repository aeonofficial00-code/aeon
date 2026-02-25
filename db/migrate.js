/**
 * db/migrate.js – Creates tables and adds any missing columns.
 * Safe to run multiple times (uses IF NOT EXISTS).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
    const client = await pool.connect();
    try {
        // 1. Run base schema (CREATE TABLE IF NOT EXISTS)
        const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
        await client.query(sql);

        // 2. Add any new columns that may be missing from older DB instances
        const alterations = [
            `ALTER TABLE categories ADD COLUMN IF NOT EXISTS cover_data  TEXT`,
            `ALTER TABLE categories ADD COLUMN IF NOT EXISTS cover_name  VARCHAR(500)`,
            `ALTER TABLE products   ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW()`,
        ];
        for (const sql of alterations) {
            await client.query(sql);
        }

        console.log('✅ Database migration complete.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
