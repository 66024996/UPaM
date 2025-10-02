
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const multer = require("multer");
const bcrypt = require('bcrypt');
const session = require('express-session');
const mysql = require('mysql2/promise');
const requireAdmin = require('./middleware/isAdmin');
const requireDoctor = require('./middleware/requireDoctor');
const requireisLoggedIn = require('./middleware/isLoggedIn');
const upload = multer({ dest: "uploads/" });
const xlsx = require("xlsx");
const fs = require('fs');
const mime = require('mime-types');

require('dotenv').config();



app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));



app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads', 'appointment_results');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '_' + file.originalname.replace(/\s+/g, '_');
    cb(null, uniqueName);
  }
});
const allowedTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/jpg',
  'image/png'
];
const uploadResultFile = multer({
  storage: fileStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'));
  }
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


app.use(session({
  secret: process.env.SESSION_SECRET || 'defaultSecret123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

function isLoggedIn(req, res, next) {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
}

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login');
});

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

    const hashedPassword = await bcrypt.hash(password, 10);

    const [userResult] = await pool.execute(
      `INSERT INTO users (email, password) VALUES (?, ?)`,
      [safe(email), hashedPassword]
    );

    const userId = userResult.insertId;


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


app.get('/ListAdmin', isAdmin, (req, res) => {
  res.render('ListAdmin');
});

app.get('/home', isLoggedIn, (req, res) => {
  res.render('home');
});

app.get('/BookingCard', isLoggedIn, (req, res) => {
  res.render('BookingCard');
});


app.get('/bookingphy', isLoggedIn, (req, res) => {
  res.render('bookingphy');

});

app.get('/Bookingblood', isLoggedIn, (req, res) => {
  res.render('Bookingblood');
});


app.get('/login', (req, res) => {
  res.render('login');
});


app.get('/Staffphy', requireDoctor, (req, res) => {
  res.render('Staffphy');
});

app.get('/Staffblood', requireDoctor, (req, res) => {
  res.render('Staffblood');
});


app.get('/register', (req, res) => {
  res.render('register');
});

app.get('/userhistory', isLoggedIn, (req, res) => {
  res.render('userhistory');
});

app.post('/bookingphy', isLoggedIn, async (req, res) => {
  const { service_id, appointment_date, time_slot, problem, total_price } = req.body; // เพิ่ม problem

  if (!req.session || !req.session.userId || !req.session.email) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนทำการจอง' });
  }

  const user_id = req.session.userId;

  if (!service_id || !appointment_date || !time_slot || !problem) { // เพิ่ม validation
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
       (user_id, service_id, appointment_date, time_slot, problem, total_price, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'จองแล้ว', NOW(), NOW())`,
      [user_id, service_id, appointment_date, time_slot, problem, total_price] // เพิ่ม problem
    );

    const bookingId = result.insertId.toString().padStart(5, '0');

    res.json({
      success: true,
      message: 'จองคิวสำเร็จ!',
      appointment_id: result.insertId,
      booking_code: bookingId
    });

  } catch (err) {
    console.error('Booking Error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.post('/bookingblood', isLoggedIn, async (req, res) => {
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

    const [existing] = await pool.execute(
      `SELECT id FROM blood_appointments 
       WHERE appointment_date = ? AND time_slot = ? AND status = 'จองแล้ว'`,
      [appointment_date, time_slot]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'เวลานี้ถูกจองแล้ว' });
    }


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

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });

  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(400).json({ success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });

    
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.role = user.role;

    if (user.role === 'admin') return res.redirect('/admin/listadmin');
    if (user.role === 'doctor') return res.redirect('/Staffphy');
    res.redirect('/home'); 
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});


app.get('/api/user', async (req, res) => {
  try {
    console.log('session => ', req.session)

    const userId = req.session.userId
    const [result] = await pool.query('SELECT id, fullname, email, role, created_at, updated_at FROM users WHERE id = ?', [userId])

    res.status(200).json(result[0])
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
})

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'ออกจากระบบไม่สำเร็จ' });
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});
// ตรวจสอบ session ของผู้ใช้
app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    res.json({
      loggedIn: true,
      user: {
        id: req.session.userId,
        email: req.session.email,
        role: req.session.role
      }
    });
  } else {
    res.json({ loggedIn: false });
  }
});


app.get('/api/my-appointment', isLoggedIn, async (req, res) => {
  console.log('📊 Session Debug:', {
    sessionExists: !!req.session,
    sessionData: req.session,
    userId: req.session?.userId,
    cookies: req.headers.cookie
  });

  if (!req.session || !req.session.userId) {
    console.log('❌ No session or userId');
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.userId;
  console.log('✅ User ID found:', userId);

  try {

    const [appointments] = await pool.execute(`
      (
        SELECT 
        a.id,
        'physical' as appointment_type,
        CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
        p.email,
        s.name AS service,
        a.problem,  -- เปลี่ยนจาก NULL as problem
        DATE_FORMAT(a.appointment_date, '%d/%m/%Y') AS appointment_date,
        a.time_slot,
        a.status,
        COALESCE(a.total_price, 0) as total_price,
        a.created_at,
        a.updated_at
      FROM appointments a
      JOIN personal_info p ON a.user_id = p.user_id
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.user_id = ? 
        AND a.status IN ('จองแล้ว', 'ยืนยันแล้ว', 'confirmed')
        AND a.appointment_date >= CURDATE() - INTERVAL 7 DAY
      )
      UNION ALL
      (
        SELECT 
          b.id,
          'blood' as appointment_type,
          CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
          p.email,
          'ตรวจเลือด' AS service,
          b.problem,
          DATE_FORMAT(b.appointment_date, '%d/%m/%Y') AS appointment_date,
          b.time_slot,
          b.status,
          COALESCE(b.total_price, 0) as total_price,
          b.created_at,
          b.updated_at
        FROM blood_appointments b
        JOIN personal_info p ON b.user_id = p.user_id
        WHERE b.user_id = ? 
          AND b.status IN ('จองแล้ว', 'ยืนยันแล้ว', 'confirmed')
          AND b.appointment_date >= CURDATE() - INTERVAL 7 DAY
      )
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `, [userId, userId]);

    console.log('📅 Query results:', appointments);

    if (!appointments.length) {
      console.log('❌ No appointments found for user:', userId);
      return res.json({
        success: false,
        message: 'คุณยังไม่มีการจองล่าสุด หรือการจองเก่ากว่า 7 วัน'
      });
    }

    const latestAppointment = appointments[0];


    latestAppointment.can_cancel = ['จองแล้ว', 'ยืนยันแล้ว', 'confirmed'].includes(latestAppointment.status);
    latestAppointment.can_reschedule = ['จองแล้ว'].includes(latestAppointment.status);


    if (latestAppointment.total_price && latestAppointment.total_price > 0) {
      latestAppointment.formatted_price = `${parseFloat(latestAppointment.total_price).toLocaleString()} บาท`;
    } else {
      latestAppointment.formatted_price = 'ไม่ระบุ';
    }

    res.json({ success: true, appointment: latestAppointment });

  } catch (err) {
    console.error('❌ Get My Appointment Error:', err);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'
    });
  }
});

app.get('/api/doctor', async (req, res) => {
  try {
    const serviceType = req.query.type;

    let query = `
      SELECT 
        d.id,
        CONCAT(d.first_name, ' ', d.last_name) AS fullname,
        d.specialty,
        d.department,
        d.phone,
        d.license_number
      FROM doctors d
      WHERE 1=1
    `;

    if (serviceType === 'physiotherapy') {
      query += ` AND d.department = 'ทันตกรรม'`;  
    } else if (serviceType === 'blood') {
      query += ` AND d.department = 'ห้องปฏิบัติการ'`;
    }

    query += ` ORDER BY fullname`;

    const [doctors] = await pool.query(query);

    console.log(`✅ Found ${doctors.length} doctors for type: ${serviceType || 'all'}`);
    res.json(doctors);

  } catch (error) {
    console.error('❌ Error in /api/doctor:', error); // log full error
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});




app.post('/api/my-appointment/cancel', isLoggedIn, async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.userId;
  const { appointmentId, reason, type } = req.body;

  console.log('🚫 Cancel Request:', { appointmentId, reason, type, userId });


  if (!appointmentId || !reason || !type) {
    return res.status(400).json({
      success: false,
      message: 'กรุณาระบุรหัสการนัดหมาย เหตุผลในการยกเลิก และประเภทการจอง'
    });
  }

  if (!['physical', 'phy', 'blood'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'ประเภทการจองไม่ถูกต้อง'
    });
  }

  try {
    let checkQuery, updateQuery;

    if (type === 'blood') {

      checkQuery = `
        SELECT b.id, b.status, b.appointment_date, b.time_slot 
        FROM blood_appointments b
        WHERE b.id = ? AND b.user_id = ? 
          AND b.status IN ('จองแล้ว', 'ยืนยันแล้ว', 'confirmed')
      `;

      updateQuery = `
        UPDATE blood_appointments
        SET status = 'ยกเลิกแล้ว', updated_at = NOW()
        WHERE id = ? AND user_id = ?
      `;
    } else {

      checkQuery = `
        SELECT a.id, a.status, a.appointment_date, a.time_slot 
        FROM appointments a
        WHERE a.id = ? AND a.user_id = ? 
          AND a.status IN ('จองแล้ว', 'ยืนยันแล้ว', 'confirmed')
      `;

      updateQuery = `
        UPDATE appointments
        SET status = 'ยกเลิกแล้ว', updated_at = NOW()
        WHERE id = ? AND user_id = ?
      `;
    }


    const [existingRows] = await pool.execute(checkQuery, [appointmentId, userId]);

    if (!existingRows.length) {
      return res.json({
        success: false,
        message: 'ไม่พบการจองที่สามารถยกเลิกได้ หรือการจองถูกยกเลิกแล้ว'
      });
    }

    const appointment = existingRows[0];
    console.log('📋 Found appointment:', appointment);


    const appointmentDateTime = new Date(`${appointment.appointment_date} ${appointment.time_slot.split('-')[0]}:00`);
    const currentTime = new Date();
    const timeDifference = appointmentDateTime - currentTime;

    if (timeDifference > 0 && timeDifference < 2 * 60 * 60 * 1000) {
      return res.json({
        success: false,
        message: 'ไม่สามารถยกเลิกการนัดหมายได้ เนื่องจากเหลือเวลาน้อยกว่า 2 ชั่วโมง กรุณาติดต่อเจ้าหน้าที่'
      });
    }


    const [result] = await pool.execute(updateQuery, [appointmentId, userId]);

    if (result.affectedRows === 0) {
      return res.json({
        success: false,
        message: 'ไม่สามารถยกเลิกการนัดหมายได้ กรุณาลองใหม่อีกครั้ง'
      });
    }

    console.log(`✅ ${type} appointment ${appointmentId} cancelled by user ${userId}`);

    res.json({
      success: true,
      message: 'ยกเลิกการนัดหมายสำเร็จ'
    });

  } catch (err) {
    console.error('❌ Cancel Appointment Error:', err);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้งหรือติดต่อเจ้าหน้าที่'
    });
  }
});


// routes/admin.js
app.post('/api/admin/appointments/manage', requireAdmin, async (req, res) => {
  try {
    const { appointmentId, type, action, reason, new_date, new_time } = req.body;
    if (!appointmentId || !type || !action || !reason)
      return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบ' });

    // แปลงวันที่ถ้าเป็น reschedule
    let formattedDate = new_date;
    if (action === 'reschedule' && new_date.includes('/')) {
      const [day, month, year] = new_date.split('/');
      formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const table = type === 'blood' ? 'blood_appointments' : 'appointments';

    if (action === 'cancel') {
      await pool.execute(`UPDATE ${table} SET status='ยกเลิกแล้ว', updated_at=NOW() WHERE id=?`, [appointmentId]);
      return res.json({ success: true, message: 'ยกเลิกการนัดหมายสำเร็จ' });
    }

    if (action === 'reschedule') {
      // ตรวจสอบ slot ว่าง
      const [slotCheck] = await pool.execute(
        `SELECT COUNT(*) as count FROM ${table} WHERE appointment_date=? AND time_slot=? AND status IN ('จองแล้ว','ยืนยันแล้ว')`,
        [formattedDate, new_time]
      );
      if (slotCheck[0].count >= 3) return res.json({ success: false, message: 'ช่วงเวลานี้เต็มแล้ว' });

      // อัปเดตวันและเวลา
      await pool.execute(
        `UPDATE ${table} SET appointment_date=?, time_slot=?, status='เลื่อนแล้ว', updated_at=NOW() WHERE id=?`,
        [formattedDate, new_time, appointmentId]
      );
      return res.json({ success: true, message: 'เลื่อนการนัดหมายสำเร็จ' });
    }

    res.status(400).json({ success: false, message: 'action ไม่ถูกต้อง' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});



app.get('/api/time-slots/:date/:type', async (req, res) => {
  const { date, type } = req.params;

  if (!['physical', 'blood'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'ประเภทการจองไม่ถูกต้อง'
    });
  }

  try {
    const timeSlots = [
      { time: '09:00-10:00', display: '9:00 - 10:00 น.' },
      { time: '10:00-11:00', display: '10:00 - 11:00 น.' },
      { time: '11:00-12:00', display: '11:00 - 12:00 น.' },
      { time: '13:00-14:00', display: '13:00 - 14:00 น.' },
      { time: '14:00-15:00', display: '14:00 - 15:00 น.' },
      { time: '15:00-16:00', display: '15:00 - 16:00 น.' },
      { time: '16:00-17:00', display: '16:00 - 17:00 น.' }
    ];

    const maxPerSlot = 3;

    า
    let countQuery;
    if (type === 'blood') {
      countQuery = `
        SELECT time_slot, COUNT(*) as count 
        FROM blood_appointments 
        WHERE appointment_date = ? AND status IN ('จองแล้ว', 'ยืนยันแล้ว', 'confirmed')
        GROUP BY time_slot
      `;
    } else {
      countQuery = `
        SELECT time_slot, COUNT(*) as count 
        FROM appointments 
        WHERE appointment_date = ? AND status IN ('จองแล้ว', 'ยืนยันแล้ว', 'confirmed')
        GROUP BY time_slot
      `;
    }

    const [bookingCounts] = await pool.execute(countQuery, [date]);


    const availableSlots = timeSlots.map(slot => {
      const booking = bookingCounts.find(b => b.time_slot === slot.time);
      const bookedCount = booking ? booking.count : 0;
      const availableCount = maxPerSlot - bookedCount;

      return {
        slot_time: slot.time,
        display_name: slot.display,
        max_appointments: maxPerSlot,
        booked_count: bookedCount,
        available_slots: availableCount,
        is_available: availableCount > 0
      };
    });

    res.json({
      success: true,
      date,
      type,
      slots: availableSlots
    });

  } catch (err) {
    console.error('❌ Get Available Slots Error:', err);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในระบบ'
    });
  }
});

app.post('/api/my-appointment/reschedule', isLoggedIn, async (req, res) => {
  const { appointmentId, newDate, newTime } = req.body;
  // logic สำหรับเลื่อนการจอง
  res.json({ success: true, message: 'เลื่อนการจองเรียบร้อย' });
});

app.get('/api/my-appointments', isLoggedIn, async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.userId;
  const { status, limit = 10, offset = 0 } = req.query;

  try {
    let statusCondition = '';
    let params = [userId, userId];

    if (status && ['จองแล้ว', 'ยืนยันแล้ว', 'เสร็จสิ้น', 'ยกเลิกแล้ว', 'เลื่อนแล้ว'].includes(status)) {
      statusCondition = 'AND a.status = ?';
      params.push(status);
    }

    const [appointments] = await pool.execute(`
      (
        SELECT 
          a.id,
          'physical' as appointment_type,
          CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
          p.email,
          s.name AS service,
          NULL as problem,
          DATE_FORMAT(a.appointment_date, '%d/%m/%Y') AS appointment_date,
          a.time_slot,
          a.status,
          COALESCE(a.total_price, 0) as total_price,
          a.created_at,
          a.updated_at
        FROM appointments a
        JOIN personal_info p ON a.user_id = p.user_id
        LEFT JOIN services s ON a.service_id = s.id
        WHERE a.user_id = ? ${statusCondition.replace('a.status', 'a.status')}
      )
      UNION ALL
      (
        SELECT 
          b.id,
          'blood' as appointment_type,
          CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
          p.email,
          'ตรวจเลือด' AS service,
          b.problem,
          DATE_FORMAT(b.appointment_date, '%d/%m/%Y') AS appointment_date,
          b.time_slot,
          b.status,
          COALESCE(b.total_price, 0) as total_price,
          b.created_at,
          b.updated_at
        FROM blood_appointments b
        JOIN personal_info p ON b.user_id = p.user_id
        WHERE b.user_id = ? ${statusCondition.replace('a.status', 'b.status')}
      )
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);


    appointments.forEach(apt => {
      apt.can_cancel = ['จองแล้ว', 'ยืนยันแล้ว', 'confirmed'].includes(apt.status);
      apt.can_reschedule = ['จองแล้ว'].includes(apt.status);
      apt.is_upcoming = new Date(apt.appointment_date.split('/').reverse().join('-')) >= new Date();


      if (apt.total_price && apt.total_price > 0) {
        apt.formatted_price = `${parseFloat(apt.total_price).toLocaleString()} บาท`;
      } else {
        apt.formatted_price = 'ไม่ระบุ';
      }
    });

    res.json({
      success: true,
      appointments,
      total: appointments.length,
      hasMore: appointments.length === parseInt(limit)
    });

  } catch (err) {
    console.error('❌ Get All Appointments Error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});


app.get('/admin/Listadmin', isAdmin, async (req, res) => {
  try {

    const [physicalAppointments] = await pool.execute(`
      SELECT 
        a.id,
        'physical' as appointment_type,
        CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
        p.email,
        p.phone,
        s.name AS service,
        DATE_FORMAT(a.appointment_date, '%d/%m/%Y') AS appointment_date,
        a.time_slot,
        a.status,
        COALESCE(a.total_price, 0) as total_price,
        a.created_at
      FROM appointments a
      JOIN personal_info p ON a.user_id = p.user_id
      LEFT JOIN services s ON a.service_id = s.id
      ORDER BY a.created_at DESC
      LIMIT 100
    `);

    const [bloodAppointments] = await pool.execute(`
      SELECT 
        b.id,
        'blood' as appointment_type,
        CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
        p.email,
        p.phone,
        'ตรวจเลือด' AS service,
        DATE_FORMAT(b.appointment_date, '%d/%m/%Y') AS appointment_date,
        b.time_slot,
        b.status,
        COALESCE(b.total_price, 0) as total_price,
        b.created_at
      FROM blood_appointments b
      JOIN personal_info p ON b.user_id = p.user_id
      ORDER BY b.created_at DESC
      LIMIT 100
    `);


    const allAppointments = [...physicalAppointments, ...bloodAppointments]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.render('ListAdmin', { appointments: allAppointments });
  } catch (error) {
    console.error('Error fetching admin data:', error);
    res.status(500).send('เกิดข้อผิดพลาดในระบบ');
  }
});


app.get('/api/admin/appointments', requireAdmin, async (req, res) => {
  try {
    const { status, type, date, limit = 1000, offset = 0 } = req.query;

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

    const limitNum = Math.max(1, Math.min(parseInt(limit) || 1000, 5000));
    const offsetNum = Math.max(0, parseInt(offset) || 0);

    let appointments = [];

    if (!type || type === 'physical') {
      let physicalQuery = `
        SELECT 
          a.id,
          'physical' AS appointment_type,
          CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
          p.email,
          p.phone,
          s.name AS service,
          DATE_FORMAT(a.appointment_date, '%d/%m/%Y') AS appointment_date,
          a.time_slot,
          a.status,
          COALESCE(a.problem, '') as problem,
          COALESCE(a.total_price, 0) AS total_price,
          CONCAT(d.first_name, ' ', d.last_name) as assignedStaff,
          a.created_at,
          a.updated_at
        FROM appointments a
        JOIN personal_info p ON a.user_id = p.user_id
        LEFT JOIN services s ON a.service_id = s.id
        LEFT JOIN doctors d ON a.doctor_id = d.id
      `;

      let conditions = [];
      let params = [];

      if (status) {
        conditions.push('a.status = ?');
        params.push(mapStatusToDB(status));
      }
      if (date) {
        conditions.push('a.appointment_date = ?');
        params.push(date);
      }

      if (conditions.length > 0) {
        physicalQuery += ` WHERE ${conditions.join(' AND ')}`;
      }

      physicalQuery += ` ORDER BY a.created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

      try {
        let physicalRows;
        if (params.length > 0) {
          [physicalRows] = await pool.execute(physicalQuery, params);
        } else {
          [physicalRows] = await pool.query(physicalQuery);
        }
        
        console.log('📊 Physical appointments found:', physicalRows.length);
        appointments.push(...physicalRows);
      } catch (err) {
        console.error('Error fetching physical appointments:', err);
        // ถ้า column problem ไม่มีจริงๆ ให้ลองใหม่โดยไม่ใช้ column นั้น
        if (err.code === 'ER_BAD_FIELD_ERROR' && err.message.includes('problem')) {
          physicalQuery = physicalQuery.replace('COALESCE(a.problem, \'\') as problem,', '\'\' as problem,');
          let physicalRows;
          if (params.length > 0) {
            [physicalRows] = await pool.execute(physicalQuery, params);
          } else {
            [physicalRows] = await pool.query(physicalQuery);
          }
          console.log('📊 Physical appointments found (retry):', physicalRows.length);
          appointments.push(...physicalRows);
        }
      }
    }

    if (!type || type === 'blood') {
      let bloodQuery = `
        SELECT 
          a.id,
          'blood' AS appointment_type,
          CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
          p.email,
          p.phone,
          a.services AS service,
          DATE_FORMAT(a.appointment_date, '%d/%m/%Y') AS appointment_date,
          a.time_slot,
          a.status,
          '' as problem,
          COALESCE(a.total_price, 0) AS total_price,
          CONCAT(d.first_name, ' ', d.last_name) as assignedStaff,
          a.created_at,
          a.updated_at
        FROM blood_appointments a
        JOIN personal_info p ON a.user_id = p.user_id
        LEFT JOIN doctors d ON a.doctor_id = d.id
      `;

      let conditions = [];
      let params = [];

      if (status) {
        conditions.push('a.status = ?');
        params.push(mapStatusToDB(status));
      }
      if (date) {
        conditions.push('a.appointment_date = ?');
        params.push(date);
      }

      if (conditions.length > 0) {
        bloodQuery += ` WHERE ${conditions.join(' AND ')}`;
      }

      bloodQuery += ` ORDER BY a.created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

      try {
        let bloodRows;
        if (params.length > 0) {
          [bloodRows] = await pool.execute(bloodQuery, params);
        } else {
          [bloodRows] = await pool.query(bloodQuery);
        }
        console.log('📊 Blood appointments found:', bloodRows.length);
        appointments.push(...bloodRows);
      } catch (err) {
        console.error('Error fetching blood appointments:', err);
      }
    }

    appointments = appointments.map(a => ({
      ...a,
      status: normalizeStatus(a.status)
    }));

    appointments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    console.log('✅ Total appointments:', appointments.length);

    res.json({ success: true, appointments, total: appointments.length });

  } catch (error) {
    console.error('Error fetching admin appointments:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});


app.get('/api/admin/all-appointments', requireAdmin, async (req, res) => {
  try {
    const { status, type, date } = req.query;

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

    let appointments = [];


    let whereConditions = [];
    let whereParams = [];

    if (status) {
      whereConditions.push('a.status = ?');
      whereParams.push(mapStatusToDB(status));
    }
    if (date) {
      whereConditions.push('a.appointment_date = ?');
      whereParams.push(date);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';


    if (!type || type === 'physical') {
      const physicalQuery = `
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
        ${whereClause}
        ORDER BY a.created_at DESC
      `;

      try {
        let physicalRows;
        if (whereParams.length > 0) {
          [physicalRows] = await pool.execute(physicalQuery, whereParams);
        } else {
          [physicalRows] = await pool.query(physicalQuery);
        }
        appointments.push(...physicalRows);
      } catch (err) {
        console.error('Error fetching physical appointments:', err);
      }
    }


    if (!type || type === 'blood') {
      const bloodQuery = `
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
        ${whereClause}
        ORDER BY a.created_at DESC
      `;

      try {
        let bloodRows;
        if (whereParams.length > 0) {
          [bloodRows] = await pool.execute(bloodQuery, whereParams);
        } else {
          [bloodRows] = await pool.query(bloodQuery);
        }
        appointments.push(...bloodRows);
      } catch (err) {
        console.error('Error fetching blood appointments:', err);
      }
    }


    appointments = appointments.map(a => ({
      ...a,
      status: normalizeStatus(a.status),
      statusText: a.status,
      typeText: a.appointment_type === 'physical' ? 'นัดหมายทั่วไป' : 'ตรวจเลือด'
    }));


    appointments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));


    const statusCounts = appointments.reduce((acc, appointment) => {
      acc[appointment.status] = (acc[appointment.status] || 0) + 1;
      return acc;
    }, {});


    const typeCounts = appointments.reduce((acc, appointment) => {
      acc[appointment.appointment_type] = (acc[appointment.appointment_type] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      appointments,
      total: appointments.length,
      statusCounts,
      typeCounts,
      summary: {
        pending: statusCounts.pending || 0,
        confirmed: statusCounts.confirmed || 0,
        cancelled: statusCounts.cancelled || 0,
        completed: statusCounts.completed || 0,
        physical: typeCounts.physical || 0,
        blood: typeCounts.blood || 0
      }
    });

  } catch (error) {
    console.error('Error fetching all appointments:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});


app.get('/api/admin/manangeBookingCount', requireAdmin, async (req, res) => {
  try {

    const [waitingPhysical] = await pool.query(`SELECT count(a.id) AS count FROM appointments a JOIN personal_info p ON a.user_id = p.user_id
        LEFT JOIN services s ON a.service_id = s.id WHERE status = "จองแล้ว"`)
    const [waitingBlood] = await pool.query(`SELECT count(a.id) AS count FROM upam.blood_appointments a JOIN personal_info p ON a.user_id = p.user_id WHERE status = 'จองแล้ว';`)

    const [confirmPhysical] = await pool.query(`SELECT count(a.id) AS count FROM appointments a JOIN personal_info p ON a.user_id = p.user_id
        LEFT JOIN services s ON a.service_id = s.id WHERE status = "ยืนยันแล้ว"`)
    const [confirmBlood] = await pool.query(`SELECT count(a.id) AS count FROM upam.blood_appointments a JOIN personal_info p ON a.user_id = p.user_id WHERE status = 'ยืนยันแล้ว';`)

    const [cancelPhysical] = await pool.query(`SELECT count(a.id) AS count FROM appointments a JOIN personal_info p ON a.user_id = p.user_id
      LEFT JOIN services s ON a.service_id = s.id WHERE status = "ยกเลิกแล้ว"`)
    const [cancelBlood] = await pool.query(`SELECT count(a.id) AS count FROM upam.blood_appointments a JOIN personal_info p ON a.user_id = p.user_id WHERE status = 'ยกเลิกแล้ว';`)

    const waiting = waitingBlood[0].count + waitingPhysical[0].count
    const confirmed = confirmBlood[0].count + confirmPhysical[0].count
    const cancelled = cancelBlood[0].count + cancelPhysical[0].count

    res.status(200).json({ waiting, confirmed, cancelled })
  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
})

app.put('/api/admin/appointments/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, type, staffName } = req.body; // เพิ่ม staffName
    
    console.log("🚀 ~ req.params:", req.params);
    console.log("🚀 ~ req.body:", req.body);

    if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'สถานะไม่ถูกต้อง' });
    }

    const mapStatus = {
      pending: 'จองแล้ว',
      confirmed: 'ยืนยันแล้ว',
      cancelled: 'ยกเลิกแล้ว',
      completed: 'เสร็จสิ้น'
    };
    
    const dbStatus = mapStatus[status];
    const table = type === 'blood' ? 'blood_appointments' : 'appointments';

    let query, params;
    
    // ถ้ายืนยัน ให้อัปเดตทั้ง status และ doctor_id
    if (status === 'confirmed' && staffName) {
      query = `UPDATE ${table} SET status = ?, doctor_id = ?, updated_at = NOW() WHERE id = ?`;
      params = [dbStatus, staffName, id];
    } else {
      query = `UPDATE ${table} SET status = ?, updated_at = NOW() WHERE id = ?`;
      params = [dbStatus, id];
    }

    const [result] = await pool.execute(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการจอง' });
    }

    const message = status === 'confirmed' 
      ? 'ยืนยันการจองสำเร็จ' 
      : status === 'cancelled' 
        ? 'ยกเลิกการจองสำเร็จ'
        : 'อัปเดตสถานะเรียบร้อย';

    res.json({ success: true, message });

  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});


app.get('/api/admin/appointments-debug', requireAdmin, async (req, res) => {
  try {
    const { status, type, date, limit = 50, offset = 0 } = req.query;

    const mapStatusToDB = (status) => {
      switch (status) {
        case 'pending': return 'จองแล้ว';
        case 'confirmed': return 'ยืนยันแล้ว';
        case 'cancelled': return 'ยกเลิกแล้ว';
        case 'completed': return 'เสร็จสิ้น';
        default: return status;
      }
    };


    let whereClause = '';
    let params = [];

    if (status || date) {
      let conditions = [];
      if (status) {
        conditions.push('a.status = ?');
        params.push(mapStatusToDB(status));
      }
      if (date) {
        conditions.push('a.appointment_date = ?');
        params.push(date);
      }
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    let appointments = [];


    if (!type || type === 'physical') {
      const physicalQuery = `
        SELECT 
          a.id,
          'physical' AS appointment_type,
          CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
          p.email,
          p.phone,
          s.name AS service,
          DATE_FORMAT(a.appointment_date, '%d/%m/%Y') AS appointment_date,
          a.time_slot,
          a.status,
          COALESCE(a.total_price, 0) AS total_price,
          a.created_at,
          a.updated_at
        FROM appointments a
        JOIN personal_info p ON a.user_id = p.user_id
        LEFT JOIN services s ON a.service_id = s.id
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `;

      console.log('Physical Query:', physicalQuery);
      console.log('Physical Params:', params);

      if (params.length > 0) {
        const [physicalRows] = await pool.execute(physicalQuery, params);
        appointments.push(...physicalRows);
      } else {
        const [physicalRows] = await pool.query(physicalQuery);
        appointments.push(...physicalRows);
      }
    }


    if (!type || type === 'blood') {
      const bloodQuery = `
        SELECT 
          a.id,
          'blood' AS appointment_type,
          CONCAT(p.title, p.first_name, ' ', p.last_name) AS patientName,
          p.email,
          p.phone,
          'ตรวจเลือด' AS service,
          DATE_FORMAT(a.appointment_date, '%d/%m/%Y') AS appointment_date,
          a.time_slot,
          a.status,
          COALESCE(a.total_price, 0) AS total_price,
          a.created_at,
          a.updated_at
        FROM blood_appointments a
        JOIN personal_info p ON a.user_id = p.user_id
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `;

      console.log('Blood Query:', bloodQuery);
      console.log('Blood Params:', params);

      if (params.length > 0) {
        const [bloodRows] = await pool.execute(bloodQuery, params);
        appointments.push(...bloodRows);
      } else {
        const [bloodRows] = await pool.query(bloodQuery);
        appointments.push(...bloodRows);
      }
    }


    const normalizeStatus = (status) => {
      switch (status) {
        case 'จองแล้ว': return 'pending';
        case 'ยืนยันแล้ว': return 'confirmed';
        case 'ยกเลิกแล้ว': return 'cancelled';
        case 'เสร็จสิ้น': return 'completed';
        default: return status;
      }
    };

    appointments = appointments.map(a => ({
      ...a,
      status: normalizeStatus(a.status)
    }));

    appointments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ success: true, appointments, total: appointments.length });

  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});


async function createAdminUser() {
  try {
    const adminEmail = 'admin@upam.com';
    const adminPassword = 'admin123';


    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [adminEmail]
    );

    if (existing.length > 0) {
      console.log('✅ Admin user already exists');
      return;
    }


    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const [result] = await pool.execute(
      `INSERT INTO users (email, password, role) VALUES (?, ?, 'admin')`,
      [adminEmail, hashedPassword]
    );


    await pool.execute(
      `INSERT INTO personal_info 
       (user_id, title, first_name, last_name, email, password) 
       VALUES (?, 'นาย', 'Admin', 'System', ?, ?)`,
      [result.insertId, adminEmail, hashedPassword]
    );

    console.log('✅ Admin user created successfully');
    console.log('📧 Email:', adminEmail);
    console.log('🔑 Password:', adminPassword);

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  }
}


createAdminUser();

async function createdoctorUser() {
  try {
    const doctorEmail = 'doctor@upam.com';
    const doctorPassword = 'doctor123';


    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [doctorEmail]
    );

    if (existing.length > 0) {
      console.log('✅ doctor user already exists');
      return;
    }


    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const [result] = await pool.execute(
      `INSERT INTO users (email, password, role) VALUES (?, ?, 'admin')`,
      [doctorEmail, hashedPassword]
    );


    await pool.execute(
      `INSERT INTO personal_info 
       (user_id, title, first_name, last_name, email, password) 
       VALUES (?, 'นาย', 'doctor', 'System', ?, ?)`,
      [result.insertId, doctorEmail, hashedPassword]
    );

    console.log('✅ Admin user created successfully');
    console.log('📧 Email:', doctorEmail);
    console.log('🔑 Password:', doctorPassword);

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  }
}


createdoctorUser();

app.get('/api/lab/categories', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM lab_test_categories");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});
app.post('/api/lab/categories', async (req, res) => {
  const { name } = req.body;
  await pool.query("INSERT INTO lab_test_categories (name) VALUES (?)", [name]);
  res.json({ success: true, message: "Category created" });
});

app.put('/api/lab/categories/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  await pool.query("UPDATE lab_test_categories SET name=? WHERE id=?", [name, id]);
  res.json({ success: true, message: "Category updated" });
});

app.delete('/api/lab/categories/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM lab_test_categories WHERE id=?", [id]);
  res.json({ success: true, message: "Category deleted" });
});

app.get('/api/lab/tests', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT t.*, c.name as category_name
    FROM lab_tests t
    JOIN lab_test_categories c ON t.category_id = c.id
  `);
  res.json(rows);
});

app.get('/api/lab/tests/:id', async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query("SELECT * FROM lab_tests WHERE id=?", [id]);
  res.json(rows[0] || {});
});

app.post('/api/lab/tests', async (req, res) => {
  const { name, category_id, normal_min, normal_max, unit, description } = req.body;
  await pool.query(
    "INSERT INTO lab_tests (name, category_id, normal_min, normal_max, unit, description) VALUES (?, ?, ?, ?, ?, ?)",
    [name, category_id, normal_min, normal_max, unit, description]
  );
  res.json({ success: true, message: "Lab test created" });
});

app.put('/api/lab/tests/:id', async (req, res) => {
  const { id } = req.params;
  const { name, category_id, normal_min, normal_max, unit, description } = req.body;
  await pool.query(
    "UPDATE lab_tests SET name=?, category_id=?, normal_min=?, normal_max=?, unit=?, description=? WHERE id=?",
    [name, category_id, normal_min, normal_max, unit, description, id]
  );
  res.json({ success: true, message: "Lab test updated" });
});

app.delete('/api/lab/tests/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM lab_tests WHERE id=?", [id]);
  res.json({ success: true, message: "Lab test deleted" });
});

app.get('/api/lab/ranges/:test_id', async (req, res) => {
  const { test_id } = req.params;
  const [rows] = await pool.query("SELECT * FROM lab_reference_range WHERE test_id=?", [test_id]);
  res.json(rows);
});

app.post('/api/lab/ranges', async (req, res) => {
  const { lab_id, test_id, normal_min, normal_max, unit } = req.body;
  await pool.query(
    "INSERT INTO lab_reference_range (lab_id, test_id, normal_min, normal_max, unit) VALUES (?, ?, ?, ?, ?)",
    [lab_id, test_id, normal_min, normal_max, unit]
  );
  res.json({ success: true, message: "Reference range created" });
});

app.put('/api/lab/ranges/:id', async (req, res) => {
  const { id } = req.params;
  const { normal_min, normal_max, unit } = req.body;
  await pool.query(
    "UPDATE lab_reference_range SET normal_min=?, normal_max=?, unit=? WHERE id=?",
    [normal_min, normal_max, unit, id]
  );
  res.json({ success: true, message: "Reference range updated" });
});

app.delete('/api/lab/ranges/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM lab_reference_range WHERE id=?", [id]);
  res.json({ success: true, message: "Reference range deleted" });
});

app.post("/api/upload-excel/:appointmentId", upload.single("file"), async (req, res) => {
  try {
    const { appointmentId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: "กรุณาอัพโหลดไฟล์ Excel" });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    const processed = processExcelData(jsonData);


    for (const row of processed) {
      const { test_name, result, unit, reference_min, reference_max } = row;

      let status = "ปกติ";
      if (result < reference_min) status = "ต่ำ";
      if (result > reference_max) status = "สูง";

      await pool.query(
        `INSERT INTO blood_results 
         (appointment_id, test_name, result, unit, reference_min, reference_max, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [appointmentId, test_name, result, unit, reference_min, reference_max, status]
      );
    }


    await pool.query(
      "UPDATE blood_appointments SET status = 'ที่อัปโหลดแล้ว' WHERE id = ?",
      [appointmentId]
    );

    fs.unlinkSync(req.file.path);

    res.json({ success: true, message: "อัปโหลดผลตรวจเลือดเรียบร้อยแล้ว" });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาด" });
  }
});

app.post('/api/Staffblood/upload-result', async (req, res) => {
  try {
    const { results } = req.body;

    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลที่จะบันทึก' });
    }

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const insertQuery = `
        INSERT INTO lab_results (test_name, value, unit, normal_range, status)
        VALUES (?, ?, ?, ?, ?)
      `;

      for (const row of results) {
        await conn.execute(insertQuery, [
          row.test || null,
          row.value || null,
          row.unit || null,
          row.normalRange || null,
          row.status || null
        ]);
      }

      await conn.commit();

      res.json({ success: true, message: 'บันทึกผลตรวจสำเร็จ' });
    } catch (err) {
      await conn.rollback();
      console.error('❌ DB Insert Error:', err);
      res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกผลตรวจได้' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('❌ Server Error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.get('/api/staff/blood-appointments', requireDoctor, async (req, res) => {
  try {
    const userId = req.session.userId;
    console.log('🔍 User ID from session:', userId);

    const [doctorRows] = await pool.query(
      `SELECT id FROM doctors WHERE user_id = ?`,
      [userId]
    );

    console.log('👨‍⚕️ Doctor rows:', doctorRows);

    if (doctorRows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลหมอ' });
    }

    const doctorId = doctorRows[0].id;
    console.log('🆔 Doctor ID:', doctorId);

    // ดึงข้อมูลพร้อมชื่อจาก users หรือ personal_info
    const [rows] = await pool.query(
      `SELECT 
        a.*,
        COALESCE(
          CONCAT(p.title, p.first_name, ' ', p.last_name),
          u.fullname,
          'ผู้ป่วย'
        ) as patient_name
       FROM blood_appointments a
       LEFT JOIN personal_info p ON a.user_id = p.user_id
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.doctor_id = ?
         AND a.status IN ('จองแล้ว','ยืนยันแล้ว','เสร็จสิ้น')
       ORDER BY a.appointment_date DESC, a.time_slot`,
      [doctorId]
    );

    console.log('📋 All appointments:', rows.length);

    res.json({ success: true, appointments: rows });
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ success: false, message: 'โหลดข้อมูลล้มเหลว' });
  }
});

app.get('/api/lab/StaffPhy', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    }

    const userId = req.session.userId;

    // ดึงชื่อหมอแบบ CONCAT
    const [doctorRows] = await pool.query(
      `SELECT 
        id, 
        CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) AS fullname
      FROM doctors 
      WHERE user_id = ?`,
      [userId]
    );

    if (doctorRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลหมอ' });
    }

    const doctorId = doctorRows[0].id;
    const doctorName = doctorRows[0].fullname.trim() || 'หมอ';

    console.log('Doctor:', doctorId, doctorName);

    const [rows] = await pool.query(`
      SELECT 
        b.id,
        COALESCE(
          CONCAT(p.title, ' ', p.first_name, ' ', p.last_name),
          u.fullname,
          'ไม่ระบุชื่อ'
        ) AS patientName,
        b.total_price AS price,
        DATE_FORMAT(b.appointment_date, '%d/%m/%Y') AS date,
        DATE_FORMAT(b.appointment_date, '%Y-%m-%d') AS date_compare,
        DATE_FORMAT(NOW(), '%Y-%m-%d') AS today_compare,
        b.time_slot AS time,
        b.status AS original_status,
        s.name,
        b.result_file
      FROM appointments b
      JOIN services s ON b.service_id = s.id
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN personal_info p ON b.user_id = p.user_id
      WHERE b.doctor_id = ?
      ORDER BY b.appointment_date DESC, b.time_slot
    `, [doctorId]);

    const results = rows.map(row => {
      const hasResult = row.result_file && row.result_file.trim() !== '';
      const isToday = row.date_compare === row.today_compare;

      let status;
      if (isToday && !hasResult && ['จองแล้ว', 'ยืนยันแล้ว'].includes(row.original_status)) {
        status = 'today';
      } else if (hasResult) {
        status = 'completed';
      } else {
        status = 'history';
      }

      return {
        id: row.id,
        patientName: row.patientName,
        price: row.price,
        date: row.date,
        time: row.time,
        name: row.name,
        result_file: row.result_file,
        assignedStaff: doctorName,
        status: status
      };
    });

    res.json(results);

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});



app.post('/api/Staffblood/upload', requireDoctor, async (req, res) => {
  try {
    const { testId, results } = req.body;
    
    console.log('📤 Upload request:', { testId, resultsCount: results?.length });

    // ✅ แปลง 'BT004' เป็น 4
    const numericId = parseInt(testId.replace(/\D/g, ''));
    
    if (!numericId || !results) {
      return res.status(400).json({ 
        success: false, 
        message: 'ข้อมูลไม่ครบถ้วน' 
      });
    }

    // บันทึกผลตรวจ
    const [updateResult] = await pool.query(
      `UPDATE blood_appointments 
       SET status = 'เสร็จสิ้น', results = ? 
       WHERE id = ?`,
      [JSON.stringify(results), numericId]
    );

    console.log('✅ Update result:', updateResult);

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'ไม่พบรายการนัดหมาย' 
      });
    }

    res.json({ 
      success: true, 
      message: 'อัปโหลดผลตรวจสำเร็จ' 
    });

  } catch (err) {
    console.error('❌ Error uploading results:', err);
    res.status(500).json({ 
      success: false, 
      message: 'บันทึกผลตรวจไม่สำเร็จ ' + err.message 
    });
  }
});

app.post('/api/appointments/upload-result/:id',requireDoctor, uploadResultFile.single('file'), async (req, res) => {
  try {
    const appointmentId = req.params.id;
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'กรุณาเลือกไฟล์' 
      });
    }

    console.log('Uploaded file:', req.file.filename);

    // อัปเดตฐานข้อมูล - เก็บชื่อไฟล์เต็ม
    await pool.query(
      `UPDATE appointments 
       SET result_file = ?, 
           status = 'เสร็จสิ้น',
           updated_at = NOW()
       WHERE id = ?`,
      [req.file.filename, appointmentId]
    );

    res.json({ 
      success: true, 
      message: 'อัปโหลดสำเร็จ',
      filename: req.file.filename 
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // ลบไฟล์ถ้า error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Error deleting file:', e);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการอัปโหลด',
      error: error.message 
    });
  }
});

// API ดาวน์โหลดไฟล์ผลตรวจ
app.get('/api/appointments/download-result/:id',requireDoctor, async (req, res) => {
  try {
    const appointmentId = req.params.id;
    
    const [rows] = await pool.query(
      'SELECT result_file FROM appointments WHERE id = ?',
      [appointmentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการนัด' });
    }

    const resultFile = rows[0].result_file;

    if (!resultFile || resultFile.trim() === '') {
      return res.status(404).json({ success: false, message: 'ยังไม่มีไฟล์ผลการตรวจ' });
    }

    // ลอง path ใหม่ก่อน (appointment_results)
    let filePath = path.join(__dirname, 'uploads', 'appointment_results', resultFile);
    
    if (!fs.existsSync(filePath)) {
      // ถ้าไม่เจอ ลอง path เก่า (uploads)
      filePath = path.join(__dirname, 'uploads', resultFile);
    }
    
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return res.status(404).json({ 
        success: false, 
        message: 'ไม่พบไฟล์ผลการตรวจ' 
      });
    }

    console.log('Downloading file:', filePath);
    res.download(filePath);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาด',
      error: error.message 
    });
  }
});

app.get('/userhistory', (req, res) => {
  res.render('userhistory');
});


function formatDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}




app.get('/api/ping', (req, res) => res.json({ ok: true }));

// Get user profile (joins personal_info if exists)
app.get('/api/me/profile', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    }

    const userId = req.session.userId;
    const userRole = req.session.role;

    console.log('Loading profile for user:', userId, 'role:', userRole);

    // ดึงข้อมูลผู้ใช้
    const [uRows] = await pool.query(
      'SELECT id, email, role, fullname, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );
    
    if (uRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = uRows[0];
    let personal = null;

    // ถ้าเป็นหมอ
    if (userRole === 'doctor') {
      try {
        const [dRows] = await pool.query(
          'SELECT * FROM doctors WHERE user_id = ? LIMIT 1',
          [userId]
        );
        
        if (dRows.length > 0) {
          const doc = dRows[0];
          personal = {
            fullname: doc.fullname,
            phone: doc.phone,
            email: doc.email,
            age: '-',
            gender: '-',
            mainProblem: doc.specialization || 'แพทย์'
          };
        }
      } catch (err) {
        console.error('Error loading doctor info:', err);
      }
      
    } else {
      // ถ้าเป็น user ธรรมดา
      try {
        const [pRows] = await pool.query(
          'SELECT * FROM personal_info WHERE user_id = ? LIMIT 1', 
          [userId]
        );
        
        if (pRows.length > 0) {
          const p = pRows[0];
          personal = {
            fullname: `${p.title || ''} ${p.first_name || ''} ${p.last_name || ''}`.trim(),
            phone: p.phone,
            email: p.email,
            age: p.birth_date ? new Date().getFullYear() - new Date(p.birth_date).getFullYear() : '-',
            gender: p.title === 'นาย' ? 'ชาย' : (p.title === 'นาง' || p.title === 'นางสาว' ? 'หญิง' : '-'),
            mainProblem: p.congenital_disease || '-'
          };
        }
      } catch (err) {
        console.error('Error loading personal info:', err);
      }
    }

    console.log('Profile loaded:', { user: user.fullname, personal: personal ? 'Found' : 'Not found' });

    res.json({ user, personal, role: userRole });
    
  } catch (err) {
    console.error('Error in /api/me/profile:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});



app.get('/api/me/appointments',isLoggedIn, async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    }

    const userId = req.session.userId;
    const userRole = req.session.role;
    const limit = parseInt(req.query.limit) || 50;

    let query, params;

    if (userRole === 'doctor') {
      // ถ้าเป็นหมอ ให้ดึงตารางการรักษาที่หมอดูแล
      query = `
        SELECT 
          a.id,
          CONCAT('A-', a.id) as appointment_code,
          a.appointment_date,
          a.time_slot,
          a.status,
          a.total_price,
          s.name as service_name,
          s.id as service_id,
          CONCAT(COALESCE(p.title, ''), ' ', COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, '')) as patient_name,
          u.fullname as patient_fullname
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.id
        LEFT JOIN personal_info p ON a.user_id = p.user_id
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.doctor_id = (SELECT id FROM doctors WHERE user_id = ? LIMIT 1)
        ORDER BY a.appointment_date DESC, a.time_slot DESC
        LIMIT ?
      `;
      params = [userId, limit];
      
    } else {
      // ถ้าเป็น user ธรรมดา ให้ดึงตารางการรักษาของตัวเอง
      query = `
        SELECT 
          a.id,
          CONCAT('A-', a.id) as appointment_code,
          a.appointment_date,
          a.time_slot,
          a.status,
          a.total_price,
          s.name as service_name,
          s.id as service_id,
          d.fullname as doctor_name
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.id
        LEFT JOIN doctors doc ON a.doctor_id = doc.id
        LEFT JOIN users d ON doc.user_id = d.id
        WHERE a.user_id = ?
        ORDER BY a.appointment_date DESC, a.time_slot DESC
        LIMIT ?
      `;
      params = [userId, limit];
    }

    const [rows] = await pool.query(query, params);

    res.json({ success: true, data: rows, role: userRole });

  } catch (err) {
    console.error('Error in /api/me/appointments:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

app.get('/api/appointments/:id',isLoggedIn, async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    }

    const appointmentId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.role;

    console.log(`Loading appointment ${appointmentId} for user ${userId} (${userRole})`);

    let query, params;

    if (userRole === 'doctor') {
      query = `
        SELECT 
          a.*,
          s.name as service_name,
          s.description as service_description,
          CONCAT(COALESCE(p.title, ''), ' ', COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, '')) as patient_name,
          p.phone as patient_phone,
          p.birth_date,
          u.email as patient_email
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.id
        LEFT JOIN personal_info p ON a.user_id = p.user_id
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.id = ?
        LIMIT 1
      `;
      params = [appointmentId];
      
    } else {
      query = `
        SELECT 
        a.*,
        s.name as service_name,
        s.description as service_description,
        CONCAT(doc.first_name, ' ', doc.last_name) as doctor_name,
        doc.specialization as doctor_specialization
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN doctors doc ON a.doctor_id = doc.id
      WHERE a.id = ? AND a.user_id = ?
      `;
      params = [appointmentId, userId];
    }

    const [rows] = await pool.query(query, params);

    if (rows.length === 0) {
      console.log(`Appointment ${appointmentId} not found or no access`);
      return res.status(404).json({ error: 'ไม่พบข้อมูลการนัดหมาย' });
    }

    console.log('Appointment loaded successfully');
    res.json({ success: true, data: rows[0] });

  } catch (err) {
    console.error('Error in /api/appointments/:id:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

app.get('/api/me/blood-appointments',isLoggedIn, async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

  const userId = req.session.userId;
  const { page = 1, limit = 20, search, dateFrom, dateTo, status } = req.query;
  const offset = (page - 1) * limit;

  let conditions = ['user_id = ?'];
  const params = [userId];

  if (status) { conditions.push('status = ?'); params.push(status); }
  if (dateFrom) { conditions.push('appointment_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conditions.push('appointment_date <= ?'); params.push(dateTo); }
  if (search) { conditions.push('(services LIKE ? OR problem LIKE ? OR email LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  const where = 'WHERE ' + conditions.join(' AND ');

  try {
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS * 
       FROM blood_appointments 
       ${where} 
       ORDER BY appointment_date DESC, created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [countRows] = await pool.query('SELECT FOUND_ROWS() as total');
    const total = countRows[0].total || 0;

    res.json({ total, page: Number(page), limit: Number(limit), data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.get('/api/blood-appointments/:id', isLoggedIn, async (req, res) => {
  try {
    const bloodId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.role;

    // Debug logs
    console.log('🔍 Blood Detail Request:', {
      bloodId,
      userId,
      userRole,
      sessionId: req.sessionID
    });

    if (!userId) {
      return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    }

    let query, params;

    if (userRole === 'doctor') {
      query = `
        SELECT 
          b.*,
          CONCAT(COALESCE(p.title, ''), ' ', COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, '')) as patient_name,
          p.phone as patient_phone,
          u.email as patient_email
        FROM blood_appointments b
        LEFT JOIN personal_info p ON b.user_id = p.user_id
        LEFT JOIN users u ON b.user_id = u.id
        WHERE b.id = ?
        LIMIT 1
      `;
      params = [bloodId];
      
    } else {
      query = `
        SELECT 
          b.*,
          CONCAT(COALESCE(p.title, ''), ' ', COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, '')) as patient_name,
          p.phone as patient_phone,
          u.email as patient_email
        FROM blood_appointments b
        LEFT JOIN personal_info p ON b.user_id = p.user_id
        LEFT JOIN users u ON b.user_id = u.id
        WHERE b.id = ? AND b.user_id = ?
        LIMIT 1
      `;
      params = [bloodId, userId];
    }

    const [rows] = await pool.query(query, params);

    console.log('📊 Query result:', rows.length > 0 ? 'Found' : 'Not found');

    if (rows.length === 0) {
      return res.status(404).json({ 
        error: 'ไม่พบข้อมูลการตรวจเลือด',
        debug: { bloodId, userId, userRole }
      });
    }

    res.json({ success: true, data: rows[0] });

  } catch (err) {
    console.error('❌ Error in /api/blood-appointments/:id:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});



app.post('/api/blood-appointments/:id/upload-result-file', upload.single('file'), async (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const filePath = `/uploads/${req.file.filename}`;
    await pool.query('UPDATE blood_appointments SET result_file = ?, result_uploaded_at = ? WHERE id = ?', [req.file.filename, new Date(), id]);
    res.json({ success: true, file: { path: filePath, original: req.file.originalname } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/blood-appointments/:id/results', async (req, res) => {
  const { id } = req.params;
  const { test_name, result, unit, reference_min, reference_max, status } = req.body;
  try {
    const [r] = await pool.query('INSERT INTO blood_results (appointment_id, test_name, result, unit, reference_min, reference_max, status, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())', [id, test_name, result, unit, reference_min, reference_max, status || null]);
    res.json({ success: true, insertedId: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.get('/api/blood-appointments/:id/download-file', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT result_file FROM blood_appointments WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const f = rows[0].result_file;
    if (!f) return res.status(404).json({ error: 'No file attached' });
    const filePath = path.join(UPLOAD_DIR, f);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on server' });
    res.download(filePath, f);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.get('/api/appointments/:id/download-all', async (req, res) => {
  const { id } = req.params;
  try {
    
    const [brows] = await pool.query('SELECT result_file FROM blood_appointments WHERE id = ?', [id]);
    const files = brows.map(r => r.result_file).filter(Boolean);
    if (!files.length) return res.status(404).json({ error: 'No files found' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=appointment_${id}_files.zip`);

    const archive = archiver('zip');
    archive.on('error', err => { throw err; });
    archive.pipe(res);

    files.forEach(fname => {
      const filePath = path.join(UPLOAD_DIR, fname);
      if (fs.existsSync(filePath)) archive.file(filePath, { name: fname });
    });

    archive.finalize();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
});


app.get('/api/lab/tests', async (req, res) => {
  const { category_id } = req.query;
  try {
    let sql = 'SELECT t.*, c.name AS category_name FROM lab_tests t LEFT JOIN lab_test_categories c ON t.category_id = c.id';
    const params = [];
    if (category_id) { sql += ' WHERE t.category_id = ?'; params.push(category_id); }
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lab/reference-range/:testId', async (req, res) => {
  const { testId } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM lab_reference_range WHERE test_id = ?', [testId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.patch('/api/appointments/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, cancel_reason, cancel_status, reschedule_reason } = req.body;
  try {
    await pool.query('UPDATE appointments SET status = ?, cancel_reason = ?, cancel_status = ?, reschedule_reason = ? WHERE id = ?', [status || null, cancel_reason || null, cancel_status || null, reschedule_reason || null, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/history', async (req, res) => {
  try {
    const userId = req.user.id; // <-- ดึงจาก token/session
    const [appointments] = await pool.query(
      'SELECT * FROM appointments WHERE user_id = ?',
      [userId]
    );
    const [bloodAppointments] = await pool.query(
      'SELECT * FROM blood_appointments WHERE user_id = ?',
      [userId]
    );

    res.json({
      appointments,
      bloodAppointments
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'server error' });
  }
});
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});