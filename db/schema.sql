-- AEON Jewellery – Full PostgreSQL Schema (up-to-date)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  google_id   VARCHAR(255) UNIQUE,
  email       VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(255),
  avatar      VARCHAR(500),
  role        VARCHAR(50) NOT NULL DEFAULT 'customer',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);

-- ── CATEGORIES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  cover_data  TEXT,             -- base64 data URL for cover image
  cover_name  VARCHAR(500),     -- original filename
  parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PRODUCTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(500) NOT NULL,
  category        VARCHAR(255) NOT NULL,
  price           DECIMAL(10,2) NOT NULL DEFAULT 0,
  description     TEXT,
  images          JSONB NOT NULL DEFAULT '[]',   -- array of base64 data URLs
  featured        BOOLEAN NOT NULL DEFAULT FALSE,
  stock           INTEGER,                        -- NULL = unlimited
  stock_status    VARCHAR(50) NOT NULL DEFAULT 'in_stock', -- in_stock | low_stock | out_of_stock
  is_on_sale      BOOLEAN NOT NULL DEFAULT FALSE,
  sale_price      DECIMAL(10,2),
  available_sizes TEXT[],                          -- e.g. {'2.4','2.6','18inch'}
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_featured  ON products (featured);

-- ── ORDERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_email         VARCHAR(255),
  items               JSONB NOT NULL DEFAULT '[]',
  address             JSONB NOT NULL DEFAULT '{}',
  subtotal            DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_charge     DECIMAL(10,2) NOT NULL DEFAULT 0,
  total               DECIMAL(10,2) NOT NULL DEFAULT 0,
  status              VARCHAR(50) NOT NULL DEFAULT 'pending',
  razorpay_order_id   VARCHAR(255),
  razorpay_payment_id VARCHAR(255),
  razorpay_signature  VARCHAR(500),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id  ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay ON orders (razorpay_order_id);

-- ── REVIEWS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          SERIAL PRIMARY KEY,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews (product_id);

-- ── COUPONS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(50) UNIQUE NOT NULL,
  discount_type   VARCHAR(20) NOT NULL DEFAULT 'percent',  -- percent | fixed
  discount_value  DECIMAL(10,2) NOT NULL,
  min_order       DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_uses        INTEGER,
  uses_count      INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── SESSION ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);

-- ── PRE-ORDER LISTINGS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS preorder_listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(500) NOT NULL,
  category        VARCHAR(255) NOT NULL DEFAULT '',
  description     TEXT,
  price           DECIMAL(10,2) NOT NULL DEFAULT 0,
  image           TEXT,                          -- base64 data URL
  expected_delivery VARCHAR(100),                -- e.g. "April 2026"
  closes_at       TIMESTAMPTZ,                   -- NULL = open indefinitely
  max_slots       INTEGER DEFAULT NULL,          -- NULL = unlimited
  available_sizes JSONB DEFAULT NULL,            -- e.g. ["2.4","2.6","18inch"]
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── PRE-BOOK REQUESTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prebook_requests (
  id              SERIAL PRIMARY KEY,
  listing_id      UUID NOT NULL REFERENCES preorder_listings(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prebook_listing ON prebook_requests (listing_id);
CREATE INDEX IF NOT EXISTS idx_prebook_user    ON prebook_requests (user_id);
