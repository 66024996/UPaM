// app.js
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ตั้งค่า view engine เป็น ejs
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// middleware สำหรับอ่านไฟล์ static (css, js, img)
app.use(express.static(path.join(__dirname, 'public')));

// กำหนด routes
app.get('/home', (req, res) => {
  res.render('home'); 
});

app.get('/BookingCard', (req, res) => {
  res.render('BookingCard'); 
});

app.get('/Bookingphy', (req, res) => {
  res.render('Bookingphy');
});

app.get('/ListAdmin', (req, res) => {
  res.render('ListAdmin');
});

app.get('/Bookingblood', (req, res) => {
  res.render('Bookingblood');
});

app.get('/Login', (req, res) => {
  res.render('Login');
});

app.get('/Staffphy', (req, res) => {
  res.render('Staffphy');
});

app.get('/Staffblood', (req, res) => {
  res.render('Staffblood');
});

// Start Server
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
