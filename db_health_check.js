require('dotenv').config();
const pool = require('./db/pool');

async function check() {
    try {
        console.log('--- DB Health Check ---');
        const { rows: stats } = await pool.query('SELECT 1 as "ok"');
        console.log('Connection:', stats[0]?.ok ? 'OK' : 'FAIL');

        const { rows: count } = await pool.query('SELECT COUNT(*) FROM products');
        console.log('Products Count:', count[0]?.count);

        const { rows: cols } = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'products'");
        console.table(cols);

        process.exit(0);
    } catch (err) {
        console.error('❌ Health check failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

check();
