/**
 * scripts/seed.js
 * Reads all images from categoriess/ folder and stores them as base64
 * data URLs directly in PostgreSQL — so images persist on Render.
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
    "Men\u2019s collection": [999, 2499],
    'Wedding set': [3499, 6999]
};

const descriptions = {
    'AD NECKLACE': 'Stunning American Diamond necklace, crafted for weddings and celebrations.',
    'AEON signature Sp Collection': 'Exclusive AEON signature pieces with premium design and finish.',
    'Anklets': 'Delicate gold-plated anklets that add charm to every step.',
    'Anti- tarnish bangles': 'Premium anti-tarnish bangles that retain their golden shine for years.',
    'Anti- tarnish watch Bangles': 'Elegant watch bangles with anti-tarnish coating – timeless and durable.',
    'Earrings': 'Exquisite earrings for every occasion from casual to bridal.',
    'GOLD LAYERED HARAM': 'Royal gold-layered haram necklace – a statement piece for festive wear.',
    'Gold plated Necklaces': 'Elegant gold-plated necklaces radiating sophistication.',
    'Gold plated Rings': 'Stunning gold-plated rings with intricate designs for a royal look.',
    'Gold plated bangles': 'Classic gold-plated bangles, perfect for daily or special occasions.',
    'MANTRA COLLECTION': 'Spiritual and stylish Mantra collection – wear your intentions.',
    "Men\u2019s collection": 'Bold and contemporary jewellery designed exclusively for men.',
    'Wedding set': 'Complete bridal jewellery sets curated for your most special day.'
};

const suffixes = ['Classic', 'Elite', 'Royal', 'Luxe', 'Signature', 'Premium', 'Heritage', 'Grace', 'Opulent', 'Regal'];

function randomPrice([min, max]) {
    return Math.round((Math.floor(Math.random() * (max - min + 1)) + min) / 99) * 99 + 99;
}
function productName(cat, idx) {
    const word = cat.replace(/[^a-zA-Z ]/g, '').trim().split(' ').pop();
    return `AEON ${word} – ${suffixes[idx % suffixes.length]} Edition`;
}
function fileToBase64(filePath) {
    try {
        const buf = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase().replace('.', '');
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
            ext === 'png' ? 'image/png' :
                ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mime};base64,${buf.toString('base64')}`;
    } catch { return null; }
}
function collectImages(dir, depth = 0) {
    if (depth > 3) return [];
    let imgs = [];
    for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) imgs = imgs.concat(collectImages(full, depth + 1));
        else if (/\.(png|jpg|jpeg|webp|gif)$/i.test(f)) imgs.push(full);
    }
    return imgs;
}

async function seed() {
    const client = await pool.connect();
    try {
        // Ensure tables
        await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
        await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY, name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT, cover_data TEXT, cover_name VARCHAR(500),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(500) NOT NULL, category VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL DEFAULT 0, description TEXT,
        images JSONB NOT NULL DEFAULT '[]', featured BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

        const catDirs = fs.readdirSync(categoriesDir).filter(f =>
            fs.statSync(path.join(categoriesDir, f)).isDirectory()
        );

        let insertedProducts = 0;
        let insertedCats = 0;

        for (const cat of catDirs) {
            const catDir = path.join(categoriesDir, cat);
            const allImages = collectImages(catDir);
            if (!allImages.length) continue;

            const coverData = fileToBase64(allImages[0]);

            // Upsert category with cover image
            const catRes = await client.query(
                `INSERT INTO categories (name, description, cover_data, cover_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET
           description = EXCLUDED.description,
           cover_data = CASE WHEN categories.cover_data IS NULL THEN EXCLUDED.cover_data ELSE categories.cover_data END
         RETURNING id, name`,
                [cat, descriptions[cat] || cat, coverData, path.basename(allImages[0])]
            );
            if (catRes.rows[0]) insertedCats++;

            // Group images into products (2 images per product)
            let idx = 0;
            for (let i = 0; i < allImages.length;) {
                const take = Math.min(2, allImages.length - i);
                const imgData = [];
                for (let j = 0; j < take; j++, i++) {
                    const b64 = fileToBase64(allImages[i]);
                    if (b64) imgData.push(b64);
                }
                if (!imgData.length) continue;

                const name = productName(cat, idx);
                const price = randomPrice(priceRanges[cat] || [999, 2499]);
                const featured = idx === 0;

                // Check by name to avoid duplicates
                const exists = await client.query(`SELECT 1 FROM products WHERE name=$1 LIMIT 1`, [name]);
                if (!exists.rows.length) {
                    await client.query(
                        `INSERT INTO products (name, category, price, description, images, featured)
             VALUES ($1,$2,$3,$4,$5,$6)`,
                        [name, cat, price, descriptions[cat] || '', JSON.stringify(imgData), featured]
                    );
                    insertedProducts++;
                }
                idx++;
            }
        }
        console.log(`✅ Seeded ${insertedCats} categories and ${insertedProducts} products (images stored in DB).`);
    } catch (err) {
        console.error('❌ Seed failed:', err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => { console.error(err); process.exit(1); });
