const express = require('express');
const path = require('path');
const app = express();
const
const PORT = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine
app.set('view engine', 'ejs');

// Routes
app.get('/', (req, res) => {
  res.render('register'); // render register.ejs
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
