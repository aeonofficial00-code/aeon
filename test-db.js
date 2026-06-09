require('dotenv').config();
const pool = require('./db/pool');
pool.query("SELECT id, status, tracking_id, tracking_updated_at FROM orders WHERE tracking_id IS NOT NULL")
    .then(r => { console.log(r.rows); pool.end(); })
    .catch(e => { console.error(e); pool.end(); });
