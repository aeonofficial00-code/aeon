require('dotenv').config();
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function uploadToCloudinary(base64Str, folder) {
    if (!base64Str || typeof base64Str !== 'string' || !base64Str.startsWith('data:image')) return base64Str;
    try {
        const result = await cloudinary.uploader.upload(base64Str, { folder });
        return result.secure_url;
    } catch (err) {
        console.error('Cloudinary upload error:', err.message);
        throw err;
    }
}

async function run() {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
        console.error('ERROR: Missing Cloudinary credentials in .env');
        console.error('Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET');
        process.exit(1);
    }

    try {
        console.log('── Migrating Categories to Cloudinary ──');
        const { rows: categories } = await pool.query(`SELECT id, name, cover_data FROM categories WHERE cover_data LIKE 'data:image%'`);
        console.log(`Found ${categories.length} categories to migrate.`);
        for (const cat of categories) {
            console.log(`Uploading cover for category: ${cat.name}`);
            const url = await uploadToCloudinary(cat.cover_data, 'aeon/categories');
            await pool.query(`UPDATE categories SET cover_data = $1 WHERE id = $2`, [url, cat.id]);
        }
        
        console.log('\n── Migrating Products to Cloudinary ──');
        // Retrieve products whose images array contains at least one data URI
        const { rows: products } = await pool.query(`SELECT id, name, images FROM products WHERE images::text LIKE '%data:image%'`);
        console.log(`Found ${products.length} products to migrate.`);
        
        for (const prod of products) {
            console.log(`Uploading images for product: ${prod.name}`);
            let updated = false;
            const newImages = [];
            for (const img of (prod.images || [])) {
                if (typeof img === 'string' && img.startsWith('data:image')) {
                    const url = await uploadToCloudinary(img, 'aeon/products');
                    newImages.push(url);
                    updated = true;
                } else {
                    newImages.push(img);
                }
            }
            if (updated) {
                await pool.query(`UPDATE products SET images = $1::jsonb WHERE id = $2`, [JSON.stringify(newImages), prod.id]);
            }
        }
        
        console.log('\n✅ Migration Complete! All base64 images have been moved to Cloudinary.');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    }
}

run();
