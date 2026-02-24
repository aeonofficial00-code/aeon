-- AEON Jewellery – PostgreSQL Schema
-- Run via: node db/migrate.js

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  google_id   VARCHAR(255) UNIQUE,
  email       VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(255),
  avatar      VARCHAR(500),
  role        VARCHAR(50) NOT NULL DEFAULT 'customer',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── CATEGORIES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── PRODUCTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(500) NOT NULL,
  category    VARCHAR(255) NOT NULL,
  price       DECIMAL(10, 2) NOT NULL DEFAULT 0,
  description TEXT,
  images      JSONB NOT NULL DEFAULT '[]',
  featured    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── SESSIONS (connect-pg-simple uses this auto) ───────────────────────────────
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_featured  ON products (featured);
CREATE INDEX IF NOT EXISTS idx_users_google_id    ON users (google_id);
CREATE INDEX IF NOT EXISTS idx_users_email        ON users (email);
