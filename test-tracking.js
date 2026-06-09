require('dotenv').config();
const pool = require('./db/pool');
(async () => {
    try {
        const { rows } = await pool.query('SELECT tracking_id, tracking_data, tracking_updated_at FROM orders WHERE id=$1', ['75815ff9-a34e-40d2-86ea-aa0790a1eb6f']);
        console.log('Rows:', rows[0]);
        const apiKey = process.env.PARCELSAPP_API_KEY;
        const resp = await fetch('https://parcelsapp.com/api/v3/shipments/tracking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shipments: [{ trackingId: rows[0].tracking_id, destinationCountry: 'India' }],
                language: 'en',
                apiKey
            })
        });
        const data = await resp.json();
        console.log('Data:', JSON.stringify(data, null, 2));
    } catch(e) { console.error(e); }
    pool.end();
})();
