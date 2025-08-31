const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine
app.set('view engine', 'ejs');

// Routes
app.get('/register', (req, res) => {
  res.render('register'); // render register.ejs
});

app.get('/date', (req, res) => {
  res.render('Date'); // render register.ejs
});

app.get('', (req, res) => {
  res.render('home'); // render date.ejs
});


app.get('/list', (req, res) => {
  res.render('list'); // render date.ejs
});

app.get('/BookingCard', (req, res) => {
  res.render('BookingCard'); // render date.ejs
});

app.get('/Bookingphy', (req, res) => {
  res.render('Bookingphy'); // render date.ejs
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
