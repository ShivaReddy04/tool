const { Pool } = require('pg');

async function test() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dart'
  });
  
  try {
    const res = await pool.query('SELECT * FROM connections');
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

test();
