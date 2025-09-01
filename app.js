const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const app = express();
const PORT = 3000;
const bcrypt = require('bcrypt');


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


app.set('view engine', 'ejs');


const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'non1150',
  database: 'Upam',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    console.log('✅ Database Connected:', rows[0].result);
  } catch (err) {
    console.error('❌ Database Connection Failed:', err);
  }
}
testConnection();



app.post('/register', async (req, res) => {
  console.log('📌 Received Data:', req.body);

  const { 
    title, first_name, last_name, 
    permanent_address, current_address, use_permanent_as_current,
    birth_date, phone, congenital_disease, drug_allergy,
    newsletter, medical_data_consent, email, password
  } = req.body;

  const safe = (val) => (val === undefined ? null : val);

  if (!title || !first_name || !last_name || !permanent_address || !birth_date || !phone || !email || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  try {
    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ บันทึก users ก่อน
    const [userResult] = await pool.execute(
      `INSERT INTO users (email, password) VALUES (?, ?)`,
      [safe(email), hashedPassword]
    );

    const userId = userResult.insertId;

    // ✅ บันทึก personal_info โดยอ้างอิง user_id
    await pool.execute(
      `INSERT INTO personal_info 
       (user_id, title, first_name, last_name, permanent_address, current_address, use_permanent_as_current,
        birth_date, phone, congenital_disease, drug_allergy, newsletter, medical_data_consent, email , password) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        safe(title),
        safe(first_name),
        safe(last_name),
        safe(permanent_address),
        safe(current_address),
        safe(use_permanent_as_current),
        safe(birth_date),
        safe(phone),
        safe(congenital_disease),
        safe(drug_allergy),
        safe(newsletter),
        safe(medical_data_consent),
        email,
        hashedPassword
      ]
    );

    res.json({ success: true, message: 'ลงทะเบียนสำเร็จ!' });

  } catch (err) {
    console.error('❌ Database Insert Error:', err.message);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});


app.get('/ListAdmin', (req, res) => {
  res.render('ListAdmin'); 
});

app.get('/home', (req, res) => {
  res.render('home'); 
});

app.get('/BookingCard', (req, res) => {
  res.render('BookingCard'); 
});

app.get('/bookingphy', (req, res) => {
  res.render('bookingphy'); // render date.ejs
});

app.get('/ListAdmin', (req, res) => {
  res.render('ListAdmin'); // render date.ejs
});

app.get('/Bookingblood', (req, res) => {
  res.render('Bookingblood'); // render date.ejs
});

app.get('/Login', (req, res) => {
  res.render('Login'); // render date.ejs
});

app.get('/Staffphy', (req, res) => {
  res.render('Staffphy'); // render date.ejs
});

app.get('/Staffblood', (req, res) => {
  res.render('Staffblood'); // render date.ejs
});

app.get('/register', (req, res) => {
  res.render('register'); // render date.ejs
});

app.post('/bookingphy', async (req, res) => {
  const { user_id, service_id, appointment_date, time_slot } = req.body;

  if (!user_id || !service_id || !appointment_date || !time_slot) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  try {
    
    const [existing] = await pool.execute(
      `SELECT id FROM appointments 
       WHERE appointment_date = ? AND time_slot = ? AND status = 'จองแล้ว'`,
      [appointment_date, time_slot]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'เวลานี้ถูกจองแล้ว' });
    }

    
    const [result] = await pool.execute(
      `INSERT INTO appointments 
       (user_id, service_id, appointment_date, time_slot, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, 'จองแล้ว', NOW(), NOW())`,
      [user_id, service_id, appointment_date, time_slot]
    );

    
    const bookingId = result.insertId.toString().padStart(5, '0');

    res.json({ 
      success: true, 
      message: 'จองคิวสำเร็จ!', 
      appointment_id: result.insertId, 
    });

  } catch (err) {
    console.error('Booking Error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.get('/', (req, res) => {
  res.redirect('/home'); // หรือ res.render('home'); ถ้ามีไฟล์ home.ejs
});


//  Start Server
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));