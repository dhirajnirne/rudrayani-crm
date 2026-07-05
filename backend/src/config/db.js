const { Pool } = require("pg");

// Single shared connection pool for the app.
// DATABASE_URL comes from .env, e.g.:
// postgres://rudrayani:rudrayani_dev_pass@localhost:5432/rudrayani_crm
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
  process.exit(1);
});

module.exports = { pool };
