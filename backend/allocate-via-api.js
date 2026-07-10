const http = require('http');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://rudrayani:rudrayani_dev_pass@localhost:5432/rudrayani_crm',
});

const API_HOST = 'localhost';
const API_PORT = 4000;

let authToken = null;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function login() {
  console.log('Authenticating...');
  try {
    const response = await makeRequest('POST', '/api/auth/login', {
      phone: '9876543211',
      password: 'password123',
    });

    if (response.status !== 200 || !response.data.access_token) {
      throw new Error(`Login failed: ${response.data.message || response.status}`);
    }

    authToken = response.data.access_token;
    console.log('✓ Authenticated as Priya Sharma');
  } catch (err) {
    console.error('✗ Login failed:', err.message);
    throw err;
  }
}

async function getIds() {
  console.log('\nFetching customer and agent IDs...');
  try {
    const result = await pool.query(`
      SELECT
        (SELECT id FROM customers WHERE loan_number = 'HDFC-003' LIMIT 1) as cust_hdfc_003,
        (SELECT id FROM customers WHERE loan_number = 'ICICI-001' LIMIT 1) as cust_icici_001,
        (SELECT id FROM users WHERE full_name = 'Amit Kumar' AND is_telecaller = true LIMIT 1) as amit_id,
        (SELECT id FROM users WHERE full_name = 'Neha Singh' AND is_telecaller = true LIMIT 1) as neha_id,
        (SELECT id FROM users WHERE full_name = 'Zara Khan' AND is_field_agent = true LIMIT 1) as zara_id
    `);
    const ids = result.rows[0];
    console.log('✓ IDs retrieved');
    return ids;
  } catch (err) {
    console.error('✗ Failed to fetch IDs:', err.message);
    throw err;
  }
}

async function allocateCustomer(customerId, agentId, agentName) {
  try {
    const response = await makeRequest('POST', '/api/allocations/assign', {
      customer_ids: [customerId],
      agent_id: agentId,
    });

    if (response.status === 200) {
      console.log(`  ✓ Allocated to ${agentName}`);
      return true;
    } else {
      console.error(`  ✗ Failed: ${response.data.message || response.status}`);
      return false;
    }
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    return false;
  }
}

async function assignFieldAgent(customerId, agentId, agentName) {
  try {
    const response = await makeRequest('POST', '/api/allocations/assign-field-agent', {
      customer_ids: [customerId],
      agent_id: agentId,
    });

    if (response.status === 200) {
      console.log(`  ✓ Assigned field agent: ${agentName} [DUAL ASSIGNMENT]`);
      return true;
    } else {
      console.error(`  ✗ Failed: ${response.data.message || response.status}`);
      return false;
    }
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    return false;
  }
}

async function verifyAllocations(ids) {
  console.log('\nVerifying allocation history...');
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as log_count FROM allocation_logs WHERE customer_id = $1
    `, [ids.cust_icici_001]);

    const logCount = result.rows[0].log_count;
    console.log(`  ICICI-001 allocation logs: ${logCount}`);

    if (logCount >= 2) {
      console.log('  ✓ Dual assignment properly logged (primary + field)');
    } else {
      console.log('  ✗ Expected 2+ allocation logs, got ' + logCount);
    }
  } catch (err) {
    console.error('✗ Verification failed:', err.message);
  }
}

async function main() {
  try {
    await login();
    const ids = await getIds();

    console.log('\n=== Creating Allocations ===');

    // Allocate HDFC-003 to Amit Kumar
    console.log('HDFC-003:');
    await allocateCustomer(ids.cust_hdfc_003, ids.amit_id, 'Amit Kumar (Telecaller)');

    // Allocate ICICI-001 to Neha Singh (primary)
    console.log('\nICICI-001:');
    await allocateCustomer(ids.cust_icici_001, ids.neha_id, 'Neha Singh (Telecaller)');

    // Assign Zara Khan as field agent (dual)
    console.log('ICICI-001 Field Agent:');
    await assignFieldAgent(ids.cust_icici_001, ids.zara_id, 'Zara Khan');

    // Verify
    await verifyAllocations(ids);

    console.log('\n✓ Allocation setup complete!');
    console.log('\nYou can now login and test allocation history:');
    console.log('  Phone: 9876543211 (Priya Sharma)');
    console.log('  Password: password123');

    process.exit(0);
  } catch (err) {
    console.error('\n✗ Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
