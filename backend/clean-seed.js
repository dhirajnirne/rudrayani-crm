const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://rudrayani:rudrayani_dev_pass@localhost:5432/rudrayani_crm',
});

async function cleanAndSeed() {
  try {
    console.log('Cleaning transactional data...');

    // Use TRUNCATE CASCADE to handle FK constraints automatically
    const truncateTables = [
      'allocation_logs',
      'location_pings',
      'attendance',
      'reminders',
      'field_visits',
      'attachments',
      'ptps',
      'call_logs',
      'bucket_movements',
      'payments',
      'import_review_items',
      'customer_month_snapshots',
      'customers',
      'import_runs',
      'import_templates',
      'products',
      'buckets',
      'teams',
      'branches',
      'companies',
    ];

    const truncateSQL = truncateTables.map(table => `TRUNCATE TABLE ${table} CASCADE`).join('; ');
    await pool.query(truncateSQL);

    console.log('✓ Database cleaned');

    // Now seed fresh data
    const fs = require('fs');
    const sql = fs.readFileSync('./scripts/seed-final.sql', 'utf8');

    console.log('Seeding fresh data...');
    await pool.query(sql);
    console.log('✓ Fresh data seeded');

    process.exit(0);
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanAndSeed();
