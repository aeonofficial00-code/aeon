/**
 * scripts/compress_existing_images.js
 * This script fetches all products, compresses their base64 images using 'sharp',
 * and updates them in the database. This will drastically reduce DB size and egress.
 */
require('dotenv').config();
const pool = require('../db/pool');
const sharp = require('sharp');

async function compress() {
    console.log('🚀 Starting image compression migration...');
    const client = await pool.connect();
    try {
        const { rows: products } = await client.query('SELECT id, images FROM products');
        console.log(`Found ${products.length} products to process.`);

        for (const product of products) {
            if (!product.images || !product.images.length) continue;
            
            let updated = false;
            const newImages = [];

            for (const imgBase64 of product.images) {
                if (!imgBase64.startsWith('data:image/')) {
                    newImages.push(imgBase64);
                    continue;
                }

                try {
                    const [_meta, base64Data] = imgBase64.split(';base64,');
                    const buffer = Buffer.from(base64Data, 'base64');
                    
                    // Compress using sharp: resize to max 1000px, convert to jpeg, quality 60
                    const compressedBuffer = await sharp(buffer)
                        .resize({ width: 1000, withoutEnlargement: true })
                        .jpeg({ quality: 60 })
                        .toBuffer();
                    
                    const compressedBase64 = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;
                    
                    // Only update if the compressed version is actually smaller
                    if (compressedBase64.length < imgBase64.length) {
                        newImages.push(compressedBase64);
                        updated = true;
                    } else {
                        newImages.push(imgBase64);
                    }
                } catch (err) {
                    console.error(`Failed to compress image for product ${product.id}:`, err.message);
                    newImages.push(imgBase64);
                }
            }

            if (updated) {
                await client.query('UPDATE products SET images = $1 WHERE id = $2', [JSON.stringify(newImages), product.id]);
                console.log(`✅ Compressed images for product: ${product.id}`);
            }
        }
        console.log('🎉 Migration complete!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

compress();
