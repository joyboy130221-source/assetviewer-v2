/**
 * Consolidated Maximo Serverless Function.
 * Public Maximo operations share one Vercel entry point. Individual
 * controllers remain isolated for maintainability and testing.
 */
const handlers = {
  asset: require('../server/controllers/maximo/asset'),
  'work-order': require('../server/controllers/maximo/work-order'),
  'work-order-detail': require('../server/controllers/maximo/work-order-detail'),
  'work-order-update': require('../server/controllers/maximo/work-order-update'),
  worklogs: require('../server/controllers/maximo/worklogs')
};

module.exports = async function maximoRouter(req, res) {
  const action = String(req.query.action || '').trim().toLowerCase();
  const handler = handlers[action];

  if (!handler) {
    return res.status(404).json({ error: 'Unknown Maximo action.' });
  }

  return handler(req, res);
};
