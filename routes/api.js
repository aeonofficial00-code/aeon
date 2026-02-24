const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/products  (optional ?category= filter)
router.get('/products', async (req, res) => {
    try {
        const { category } = req.query;
        let query, params;
        if (category) {
            query = `SELECT * FROM products WHERE LOWER(category) = LOWER($1) ORDER BY featured DESC, created_at DESC`;
            params = [decodeURIComponent(category)];
        } else {
            query = `SELECT * FROM products ORDER BY featured DESC, created_at DESC`;
            params = [];
        }
        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/products/:id
router.get('/products/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/categories – distinct categories with cover image and count
router.get('/categories', async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT
        category AS name,
        COUNT(*) AS count,
        (
          SELECT images->0
          FROM products p2
          WHERE p2.category = p.category
          ORDER BY featured DESC, created_at ASC
          LIMIT 1
        ) AS cover
      FROM products p
      GROUP BY category
      ORDER BY category ASC
    `);
        const mapped = rows.map(r => ({
            name: r.name,
            count: parseInt(r.count),
            cover: r.cover || null
        }));
        res.json(mapped);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/featured
router.get('/featured', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM products WHERE featured = true ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
