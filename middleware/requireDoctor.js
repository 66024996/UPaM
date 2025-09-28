// middlewares/requireDoctor.js
function requireDoctor(req, res, next) {
  if (req.session && req.session.role === 'doctor') {
    return next();
  }
  return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
}

module.exports = requireDoctor;
