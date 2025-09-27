// utils/appointments.js
const pool = require('../db'); // ปรับ path ให้ตรงกับ MySQL pool ของคุณ

// Mapping status UI <-> DB
const mapStatusToDB = (status) => {
  switch (status) {
    case 'pending': return 'จองแล้ว';
    case 'confirmed': return 'ยืนยันแล้ว';
    case 'cancelled': return 'ยกเลิกแล้ว';
    case 'completed': return 'เสร็จสิ้น';
    default: return status;
  }
};

const normalizeStatus = (status) => {
  switch (status) {
    case 'จองแล้ว': return 'pending';
    case 'ยืนยันแล้ว': return 'confirmed';
    case 'ยกเลิกแล้ว': return 'cancelled';
    case 'เสร็จสิ้น': return 'completed';
    default: return status;
  }
};

// สร้าง WHERE clause + params
const buildWhereClause = ({ status, date }) => {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('a.status = ?');
    params.push(mapStatusToDB(status));
  }

  if (date) {
    conditions.push('a.appointment_date = ?');
    params.push(date);
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, params };
};

// ฟังก์ชันดึง appointments (physical/blood)
const getAppointments = async ({ type, status, date, limit = 1000, offset = 0 }) => {
  let appointments = [];
  const { clause, params } = buildWhereClause({ status, date });

  const limitNum = Math.max(1, Math.min(parseInt(limit), 5000));
  const offsetNum = Math.max(0, parseInt(offset));

  const typesToQuery = !type ? ['physical', 'blood'] : [type];

  for (const t of typesToQuery) {
    let query = '';
    if (t === 'physical') {
      query = `
        SELECT 
          a.id,
          'physical' AS appointment_type,
          CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
          p.email,
          p.phone,
          s.name AS service,
          DATE_FORMAT(a.appointment_date, '%d/%m/%Y') AS appointment_date,
          a.appointment_date AS raw_date,
          a.time_slot,
          a.status,
          COALESCE(a.total_price, 0) AS total_price,
          a.created_at,
          a.updated_at
        FROM appointments a
        JOIN personal_info p ON a.user_id = p.user_id
        LEFT JOIN services s ON a.service_id = s.id
        ${clause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
      `;
    } else if (t === 'blood') {
      query = `
        SELECT 
          a.id,
          'blood' AS appointment_type,
          CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
          p.email,
          p.phone,
          'ตรวจเลือด' AS service,
          DATE_FORMAT(a.appointment_date, '%d/%m/%Y') AS appointment_date,
          a.appointment_date AS raw_date,
          a.time_slot,
          a.status,
          COALESCE(a.total_price, 0) AS total_price,
          a.created_at,
          a.updated_at
        FROM blood_appointments a
        JOIN personal_info p ON a.user_id = p.user_id
        ${clause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
      `;
    }

    try {
      const queryParams = [...params, limitNum, offsetNum];
      const [rows] = await pool.execute(query, queryParams);
      appointments.push(...rows);
    } catch (err) {
      console.error(`Error fetching ${t} appointments:`, err);
    }
  }

  // Normalize status + type text
  appointments = appointments.map(a => ({
    ...a,
    status: normalizeStatus(a.status),
    statusText: a.status,
    typeText: a.appointment_type === 'physical' ? 'นัดหมายทั่วไป' : 'ตรวจเลือด'
  }));

  // Sort by created_at desc
  appointments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return appointments;
};

module.exports = { mapStatusToDB, normalizeStatus, buildWhereClause, getAppointments };
