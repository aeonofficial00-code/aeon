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
            `CREATE TABLE IF NOT EXISTS orders (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
              guest_email VARCHAR(255), items JSONB NOT NULL DEFAULT '[]',
              address JSONB NOT NULL DEFAULT '{}', subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
              delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0, total DECIMAL(10,2) NOT NULL DEFAULT 0,
              status VARCHAR(50) NOT NULL DEFAULT 'pending', razorpay_order_id VARCHAR(255),
              razorpay_payment_id VARCHAR(255), razorpay_signature VARCHAR(500),
              created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
            )`,
            `CREATE INDEX IF NOT EXISTS idx_orders_user_id  ON orders (user_id)`,
            `CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders (status)`,
            `CREATE INDEX IF NOT EXISTS idx_orders_razorpay ON orders (razorpay_order_id)`,
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
