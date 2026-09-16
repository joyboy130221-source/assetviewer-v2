/**
 * Consolidated authentication Serverless Function.
 *
 * Routes are selected with ?action=login|logout|me so Vercel deploys
 * authentication as one function instead of one function per endpoint.
 */
const handlers = {
  login: require('../server/controllers/auth/login'),
  logout: require('../server/controllers/auth/logout'),
  me: require('../server/controllers/auth/me')
};

module.exports = async function authRouter(req, res) {
  const action = String(req.query.action || '').trim().toLowerCase();
  const handler = handlers[action];

  if (!handler) {
    return res.status(404).json({ error: 'Unknown authentication action.' });
  }

  return handler(req, res);
};
