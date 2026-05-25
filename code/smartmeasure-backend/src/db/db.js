const { Pool } = require('pg');
require('dotenv').config();

// Supports two modes:
// - Local development: uses individual DB_* variables from .env
// - Azure (production): uses individual DB_* variables with SSL
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false }  // Required for Azure PostgreSQL
      }
);

// Test connection when server starts
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Connected to PostgreSQL database');
    release();
  }
});

module.exports = pool;