/**
 * Seed data — creates demo HR user, site, and staff members.
 * Run: node src/db/seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('./pool');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── HR admin user ──────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('admin123', 12);
    const hrId = uuidv4();
    await client.query(
      `INSERT INTO hr_users (id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'hr_admin')
       ON CONFLICT (email) DO NOTHING`,
      [hrId, 'admin@syncops.dev', passwordHash, 'SyncOps Admin']
    );
    console.log('✅ HR admin: admin@syncops.dev / admin123');

    // ── Site ───────────────────────────────────────────────────────────────
    const siteId = uuidv4();
    await client.query(
      `INSERT INTO sites (id, name, address, lat, lng, radius_meters, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [siteId, 'HQ Office', '123 Main Street, Nairobi', -1.2921, 36.8219, 150, hrId]
    );
    console.log('✅ Site: HQ Office (Nairobi)');

    // ── Staff members ──────────────────────────────────────────────────────
    const staffMembers = [
      { id: uuidv4(), employee_id: 'EMP-001', full_name: 'Alice Kamau', email: 'alice@example.com' },
      { id: uuidv4(), employee_id: 'EMP-002', full_name: 'Brian Odhiambo', email: 'brian@example.com' },
      { id: uuidv4(), employee_id: 'EMP-003', full_name: 'Carol Wanjiku', email: 'carol@example.com' },
      { id: uuidv4(), employee_id: 'EMP-004', full_name: 'David Mutua', email: 'david@example.com' },
      { id: uuidv4(), employee_id: 'EMP-005', full_name: 'Eva Njoroge', email: 'eva@example.com' },
    ];

    for (const s of staffMembers) {
      await client.query(
        `INSERT INTO staff (id, employee_id, full_name, email, site_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (employee_id) DO NOTHING`,
        [s.id, s.employee_id, s.full_name, s.email, siteId, hrId]
      );
    }
    console.log(`✅ ${staffMembers.length} staff members seeded`);

    // ── Demo attendance logs (last 7 days) ────────────────────────────────
    const today = new Date();
    for (let d = 6; d >= 0; d--) {
      const day = new Date(today);
      day.setDate(today.getDate() - d);

      for (const s of staffMembers.slice(0, 3)) {
        const clockIn = new Date(day);
        clockIn.setHours(8 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 30), 0, 0);
        const clockOut = new Date(clockIn);
        clockOut.setHours(clockIn.getHours() + 8 + Math.floor(Math.random() * 2));

        await client.query(
          `INSERT INTO attendance_logs
             (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m,
              distance_from_site_m, is_within_fence)
           VALUES ($1,$2,'clock_in',$3,$4,$5,$6,$7,true)`,
          [s.id, siteId, clockIn.toISOString(), -1.2921, 36.8219, 8.5, 42.3]
        );
        await client.query(
          `INSERT INTO attendance_logs
             (staff_id, site_id, action, timestamp_utc, lat, lng, gps_accuracy_m,
              distance_from_site_m, is_within_fence)
           VALUES ($1,$2,'clock_out',$3,$4,$5,$6,$7,true)`,
          [s.id, siteId, clockOut.toISOString(), -1.2921, 36.8219, 9.2, 38.1]
        );
      }
    }
    console.log('✅ Demo attendance logs seeded (7 days)');

    await client.query('COMMIT');
    console.log('\n🎉 Seed complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
