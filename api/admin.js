/**
 * Consolidated administration Serverless Function.
 * Keeps administration CRUD operations behind one Vercel function while
 * business logic remains separated in server/controllers/admin.
 */
const handlers = {
  environments: require('../server/controllers/admin/environments'),
  roles: require('../server/controllers/admin/roles'),
  users: require('../server/controllers/admin/users'),
  'api-logs': require('../server/controllers/admin/api-logs')
};

module.exports = async function adminRouter(req, res) {
  const action = String(req.query.action || '').trim().toLowerCase();
  const handler = handlers[action];

  if (!handler) {
    return res.status(404).json({ error: 'Unknown administration action.' });
  }

  return handler(req, res);
};
