
// server.js
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');
const helmet = require('helmet');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const cors = require('cors');
const validator = require('validator');


// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;


// Security middleware
app.use(helmet()); // Set security HTTP headers
app.use(xss()); // Prevent XSS attacks
app.use(hpp()); // Prevent HTTP Parameter Pollution
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGIN : '*',
  methods: ['GET', 'POST'],
  credentials: true
}));


// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
  });
  app.use('/api/', limiter);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));





// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Set to true in production with proper SSL cert
  }
});

// Initialize database table
async function initDb() {
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS links (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    client.release();
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// API Routes
app.post('/api/links', async (req, res) => {
  try {
    const { url } = req.body;
    
    // Basic validation
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Simple URL validation
    try {
      new URL(url);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    const client = await pool.connect();
    const result = await client.query(
      'INSERT INTO links (url) VALUES ($1) RETURNING *',
      [url]
    );
    client.release();
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error saving link:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/links', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT * FROM links ORDER BY created_at DESC'
    );
    client.release();
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching links:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve the HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database and start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});