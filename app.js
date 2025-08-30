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

app.get('/Booking', (req, res) => {
  res.render('Booking'); // render date.ejs
});

app.get('/ListAdmin', (req, res) => {
  res.render('ListAdmin'); // render date.ejs
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
