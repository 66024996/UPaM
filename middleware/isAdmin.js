function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
}

module.exports = requireAdmin;
