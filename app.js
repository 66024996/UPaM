// app.js
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;
const bcrypt = require('bcrypt');
const session = require('express-session');
const mysql = require('mysql2/promise');

// ตั้งค่า view engine เป็น ejs
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// middleware สำหรับอ่านไฟล์ static (css, js, img)
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

require('dotenv').config();


app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 วัน
}));

function isLoggedIn(req, res, next) {
  if (req.session.userId) {
    return next(); // ผ่าน ตรวจสอบแล้ว
  }
  res.redirect('/login'); // ไม่ล็อกอิน -> ไปหน้า login
}

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
  res.render('ListAdmin');
});

app.get('/Bookingblood', (req, res) => {
  res.render('Bookingblood');
});


app.get('/login', (req, res) => {
  res.render('login'); // render date.ejs
});


app.get('/Staffphy', (req, res) => {
  res.render('Staffphy');
});

app.get('/Staffblood', (req, res) => {
  res.render('Staffblood');
});


app.get('/register', (req, res) => {
  res.render('register'); // render date.ejs
});

app.post('/bookingphy', async (req, res) => {
  const { service_id, appointment_date, time_slot } = req.body;

  if (!req.session || !req.session.userId || !req.session.email) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนทำการจอง' });
  }

  const user_id = req.session.userId;
  const user_email = req.session.email;

  if (!service_id || !appointment_date || !time_slot) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  try {
    // ตรวจสอบเวลาที่ถูกจองแล้ว
    const [existing] = await pool.execute(
      `SELECT id FROM appointments 
       WHERE appointment_date = ? AND time_slot = ? AND status = 'จองแล้ว'`,
      [appointment_date, time_slot]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'เวลานี้ถูกจองแล้ว' });
    }

    // ทำการจอง
    const [result] = await pool.execute(
      `INSERT INTO appointments 
       (user_id, email, service_id, appointment_date, time_slot, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, 'จองแล้ว', NOW(), NOW())`,
      [user_id, user_email, service_id, appointment_date, time_slot]
    );

    const bookingId = result.insertId.toString().padStart(5, '0');

    res.json({ 
      success: true, 
      message: 'จองคิวสำเร็จ!', 
      appointment_id: result.insertId, 
      booking_code: bookingId 
    });

  } catch (err) {
    console.error('❌ Booking Error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.post('/bookingblood', async (req, res) => {
  if (!req.session || !req.session.userId || !req.session.email) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนทำการจอง' });
  }

  const { services, totalPrice, appointment_date, time_slot, problem } = req.body;
  const user_id = req.session.userId;
  const user_email = req.session.email;

  if (!services || !appointment_date || !time_slot) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  try {
    // ตรวจสอบเวลาที่ถูกจองแล้ว
    const [existing] = await pool.execute(
      `SELECT id FROM blood_appointments 
       WHERE appointment_date = ? AND time_slot = ? AND status = 'จองแล้ว'`,
      [appointment_date, time_slot]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'เวลานี้ถูกจองแล้ว' });
    }

    // บันทึกการจอง
    const [result] = await pool.execute(
      `INSERT INTO blood_appointments 
       (user_id, email, services, total_price, appointment_date, time_slot, problem, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'จองแล้ว', NOW(), NOW())`,
      [user_id, user_email, JSON.stringify(services), totalPrice, appointment_date, time_slot, problem]
    );

    const bookingId = result.insertId.toString().padStart(5, '0');

    res.json({
      success: true,
      message: 'จองคิวสำเร็จ!',
      appointment_id: result.insertId,
      booking_code: bookingId
    });
  } catch (err) {
    console.error('❌ Booking Error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});


app.get('/', (req, res) => {
  res.redirect('/home'); 
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  try {
    // ดึงข้อมูลผู้ใช้จาก DB
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user = rows[0];

    // ตรวจสอบรหัสผ่าน
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    // สร้าง session
    req.session.userId = user.id;
    req.session.email = user.email;

    res.redirect('/home');
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'ออกจากระบบไม่สำเร็จ' });
    }
    res.clearCookie('connect.sid'); // ลบ cookie session
    res.redirect('/login'); // กลับไปหน้า login
  });
});


//  Start Server
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
