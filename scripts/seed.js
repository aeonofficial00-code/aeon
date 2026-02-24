/**
 * scripts/seed.js – Walks categoriess/ folder and seeds products into PostgreSQL.
 * Skips existing products (ON CONFLICT DO NOTHING by image URL check).
 * Safe to run multiple times.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

const categoriesDir = path.join(__dirname, '..', 'categoriess');

const priceRanges = {
    'AD NECKLACE': [1499, 2499],
    'AEON signature Sp Collection': [1999, 3499],
    'Anklets': [599, 999],
    'Anti- tarnish bangles': [799, 1499],
    'Anti- tarnish watch Bangles': [1299, 2199],
    'Earrings': [499, 1299],
    'GOLD LAYERED HARAM': [2499, 4999],
    'Gold plated Necklaces': [1499, 2999],
    'Gold plated Rings': [699, 1299],
    'Gold plated bangles': [899, 1799],
    'MANTRA COLLECTION': [1299, 2499],
    "Men's collection": [999, 2499],
    'Wedding set': [3499, 6999]
};

const descriptions = {
    'AD NECKLACE': 'Stunning American Diamond necklace, perfect for weddings and special occasions.',
    'AEON signature Sp Collection': 'Exclusive AEON signature pieces crafted with premium materials and elegant design.',
    'Anklets': 'Delicate gold-plated anklets that add a charming touch to every step.',
    'Anti- tarnish bangles': 'Premium anti-tarnish bangles that retain their golden shine for years.',
    'Anti- tarnish watch Bangles': 'Elegant watch bangles with anti-tarnish coating – timeless and durable.',
    'Earrings': 'Exquisite earrings for every occasion from casual to bridal.',
    'GOLD LAYERED HARAM': 'Royal gold-layered haram necklace, a statement piece for festive wear.',
    'Gold plated Necklaces': 'Elegant gold-plated necklaces that radiate sophistication.',
    'Gold plated Rings': 'Stunning gold-plated rings with intricate designs for a royal look.',
    'Gold plated bangles': 'Classic gold-plated bangles, perfect for daily wear or special occasions.',
    'MANTRA COLLECTION': 'Spiritual and stylish Mantra collection – wear your intentions.',
    "Men's collection": 'Bold and contemporary jewellery designed exclusively for men.',
    'Wedding set': 'Complete bridal jewellery sets curated for your most special day.'
};

function randomPrice([min, max]) {
    const raw = Math.floor(Math.random() * (max - min + 1)) + min;
    return Math.round(raw / 99) * 99 + 99;
}

function productName(cat, idx) {
    const suffixes = ['Classic', 'Elite', 'Royal', 'Luxe', 'Signature', 'Premium', 'Heritage', 'Grace', 'Opulent', 'Regal'];
    const cleanCat = cat.replace(/[^a-zA-Z ]/g, '').trim().split(' ').slice(-1)[0];
    return `AEON ${cleanCat} – ${suffixes[idx % suffixes.length]} Edition`;
}

async function seed() {
    const client = await pool.connect();
    try {
        // Ensure extension + tables exist (lightweight inline version)
        await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
        await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(500) NOT NULL,
        category VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL DEFAULT 0,
        description TEXT,
        images JSONB NOT NULL DEFAULT '[]',
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

        const catDirs = fs.readdirSync(categoriesDir).filter(f =>
            fs.statSync(path.join(categoriesDir, f)).isDirectory()
        );

        let inserted = 0;
        for (const cat of catDirs) {
            // Upsert category
            await client.query(
                `INSERT INTO categories (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
                [cat, descriptions[cat] || '']
            );

            const catDir = path.join(categoriesDir, cat);
            const files = fs.readdirSync(catDir).filter(f => /\.(png|jpg|jpeg|webp|gif)$/i.test(f));

            let idx = 0;
            for (let i = 0; i < files.length;) {
                const take = Math.min(2, files.length - i);
                const imgs = [];
                for (let j = 0; j < take; j++) {
                    imgs.push(`/categoriess/${encodeURIComponent(cat)}/${encodeURIComponent(files[i])}`);
                    i++;
                }
                const price = randomPrice(priceRanges[cat] || [999, 2499]);
                const name = productName(cat, idx);
                const featured = idx === 0;

                // Check if product with same first image already exists
                const exists = await client.query(
                    `SELECT 1 FROM products WHERE images->0 = $1 LIMIT 1`,
                    [JSON.stringify(imgs[0])]
                );
                if (exists.rows.length === 0) {
                    await client.query(
                        `INSERT INTO products (name, category, price, description, images, featured)
             VALUES ($1, $2, $3, $4, $5, $6)`,
                        [name, cat, price, descriptions[cat] || '', JSON.stringify(imgs), featured]
                    );
                    inserted++;
                }
                idx++;
            }
        }
        console.log(`✅ Seeded ${inserted} products from ${catDirs.length} categories.`);
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
