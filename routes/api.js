const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/products
router.get('/products', async (req, res) => {
    try {
        const { category } = req.query;
        let q, p;
        if (category) {
            q = `SELECT id, name, category, price, description, images, featured, created_at FROM products WHERE LOWER(category)=LOWER($1) ORDER BY featured DESC, created_at DESC`;
            p = [decodeURIComponent(category)];
        } else {
            q = `SELECT id, name, category, price, description, images, featured, created_at FROM products ORDER BY featured DESC, created_at DESC`;
            p = [];
        }
        const { rows } = await pool.query(q, p);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

// GET /api/products/:id  (includes full images base64)
router.get('/products/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM products WHERE id=$1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// GET /api/categories
router.get('/categories', async (req, res) => {
    try {
        const { rows: cats } = await pool.query(`
      SELECT c.id, c.name, c.description, c.cover_name,
        (SELECT COUNT(*) FROM products p WHERE LOWER(p.category)=LOWER(c.name)) AS count
      FROM categories c ORDER BY c.name
    `);
        // Build response: cover comes from categories.cover_data via a separate small query
        const result = [];
        for (const cat of cats) {
            const coverRow = await pool.query(`SELECT cover_data FROM categories WHERE id=$1`, [cat.id]);
            result.push({
                name: cat.name,
                description: cat.description,
                count: parseInt(cat.count),
                cover: coverRow.rows[0]?.cover_data || null
            });
        }
        res.json(result);
    } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

// GET /api/featured
router.get('/featured', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, name, category, price, description, images, featured, created_at FROM products WHERE featured=true ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

module.exports = router;
