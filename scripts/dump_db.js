/**
 * Dumps the Render PostgreSQL database to a local SQL file.
 * Usage: node scripts/dump_db.js
 * Output: db/render_backup.sql
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const OUT = path.join(__dirname, '../db/render_backup.sql');

const tables = ['users', 'categories', 'products', 'orders', 'reviews', 'coupons', 'preorder_listings', 'prebook_requests'];

async function dump() {
    const out = fs.createWriteStream(OUT);
    const write = (s) => out.write(s + '\n');

    write('-- AEON Jewellery DB Backup');
    write(`-- Generated: ${new Date().toISOString()}`);
    write('');
    write('SET client_encoding = \'UTF8\';');
    write('SET standard_conforming_strings = on;');
    write('');

    for (const table of tables) {
        try {
            // Get column names
            const { rows: cols } = await pool.query(
                `SELECT column_name, data_type FROM information_schema.columns
                 WHERE table_name = $1 ORDER BY ordinal_position`, [table]
            );
            if (!cols.length) { console.log(`⚠ Table '${table}' not found, skipping`); continue; }

            const { rows } = await pool.query(`SELECT * FROM ${table}`);
            write(`-- ── ${table.toUpperCase()} (${rows.length} rows) ──`);
            write(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`);

            const colMap = Object.fromEntries(cols.map(c => [c.column_name, c.data_type]));
            const colNames = cols.map(c => c.column_name);

            for (const row of rows) {
                const vals = colNames.map(col => {
                    const v = row[col];
                    const dataType = colMap[col];

                    if (v === null || v === undefined) return 'NULL';
                    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
                    if (typeof v === 'number') {
                        if (isNaN(v) || !isFinite(v)) return 'NULL';  // NaN → NULL
                        return v;
                    }
                    if (v instanceof Date) return `'${v.toISOString()}'`;

                    if (dataType === 'json' || dataType === 'jsonb') {
                        return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
                    }
                    if (dataType === 'ARRAY') {
                        if (!Array.isArray(v)) return 'NULL';
                        if (!v.length) return 'NULL';
                        const escaped = v.map(s => `'${String(s).replace(/'/g, "''")}'`);
                        return `ARRAY[${escaped.join(',')}]`;
                    }
                    if (Array.isArray(v)) {
                        return `'${JSON.stringify(v).replace(/'/g, "''")}'`; // Fallback to json text
                    }

                    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
                    // Number-like string that is NaN (e.g. sale_price stored as 'NaN')
                    if (String(v) === 'NaN') return 'NULL';
                    return `'${String(v).replace(/'/g, "''")}'`;

                });
                write(`INSERT INTO ${table} (${colNames.join(', ')}) VALUES (${vals.join(', ')});`);
            }
            write('');
            console.log(`✅ ${table}: ${rows.length} rows`);
        } catch (e) {
            console.error(`❌ ${table}: ${e.message}`);
        }
    }

    out.end();
    console.log(`\n📦 Backup saved to: ${OUT}`);
    await pool.end();
}

dump().catch(e => { console.error(e); process.exit(1); });
