require('dotenv').config();
const fs = require('fs');
const pool = require('../db/pool');

async function run() {
    const rawSql = fs.readFileSync('./db/render_backup.sql', 'utf8');
    const statements = rawSql.split(';').filter(s => s.trim().length > 0);
    for (let i = 0; i < statements.length; i++) {
        let sql = statements[i].trim();
        if (!sql) continue;
        try {
            await pool.query(sql);
        } catch (e) {
            fs.writeFileSync('failed_sql.txt', sql);
            console.error(`Error on statement ${i + 1}:`, e.message);
            console.error("Statement saved to failed_sql.txt");
            process.exit(1);
        }
    }
    console.log("Success!");
    process.exit(0);
}

run();
