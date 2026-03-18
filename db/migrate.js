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
      `CREATE TABLE IF NOT EXISTS reviews (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
              user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
              reviewer_name VARCHAR(100) NOT NULL DEFAULT 'Anonymous',
              rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
              comment TEXT,
              created_at TIMESTAMPTZ DEFAULT NOW()
            )`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews (product_id)`,
      `CREATE TABLE IF NOT EXISTS coupons (
              id SERIAL PRIMARY KEY,
              code VARCHAR(30) NOT NULL UNIQUE,
              discount_type VARCHAR(10) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
              discount_value NUMERIC(10,2) NOT NULL,
              min_order NUMERIC(10,2) DEFAULT 0,
              max_uses INTEGER DEFAULT NULL,
              uses_count INTEGER DEFAULT 0,
              active BOOLEAN DEFAULT true,
              expires_at TIMESTAMPTZ DEFAULT NULL,
              created_at TIMESTAMPTZ DEFAULT NOW()
            )`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS stock           INTEGER DEFAULT NULL`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_status    VARCHAR(20) DEFAULT 'in_stock'`,
      `ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2) DEFAULT NULL`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_on_sale BOOLEAN DEFAULT false`,
      `CREATE TABLE IF NOT EXISTS preorder_listings (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              name VARCHAR(500) NOT NULL,
              category VARCHAR(255) NOT NULL DEFAULT '',
              description TEXT,
              price DECIMAL(10,2) NOT NULL DEFAULT 0,
              image TEXT,
              expected_delivery VARCHAR(100),
              closes_at TIMESTAMPTZ,
              max_slots INTEGER DEFAULT NULL,
              available_sizes JSONB DEFAULT NULL,
              is_active BOOLEAN NOT NULL DEFAULT TRUE,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              updated_at TIMESTAMPTZ DEFAULT NOW()
            )`,
      `CREATE TABLE IF NOT EXISTS prebook_requests (
              id SERIAL PRIMARY KEY,
              listing_id UUID NOT NULL REFERENCES preorder_listings(id) ON DELETE CASCADE,
              user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
              quantity INTEGER NOT NULL DEFAULT 1,
              created_at TIMESTAMPTZ DEFAULT NOW()
            )`,
      `CREATE INDEX IF NOT EXISTS idx_prebook_listing ON prebook_requests (listing_id)`,
      `CREATE INDEX IF NOT EXISTS idx_prebook_user ON prebook_requests (user_id)`,
      `ALTER TABLE preorder_listings ADD COLUMN IF NOT EXISTS available_sizes JSONB DEFAULT NULL`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS available_colors TEXT[] DEFAULT NULL`,
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
