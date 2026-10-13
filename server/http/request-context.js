/**
 * Per-request context (request id, client IP, authenticated principal),
 * available anywhere in the call chain without passing it through every
 * function — e.g. the API request log records who triggered a Maximo call.
 */
const { AsyncLocalStorage } = require("async_hooks");
const crypto = require("crypto");

const storage = new AsyncLocalStorage();

/**
 * @typedef {object} RequestContext
 * @property {string} requestId
 * @property {string} clientIp
 * @property {string} route
 * @property {{ method: "session"|"embed-key"|"none", userId?: number|null,
 *   externalViewId?: number|null, organizationId?: string|null } | null} principal
 */

function runWithContext(initial, fn) {
  const context = {
    requestId: initial.requestId || crypto.randomUUID(),
    clientIp: initial.clientIp || "",
    route: initial.route || "",
    principal: initial.principal || null,
  };
  return storage.run(context, () => fn(context));
}

/** @returns {RequestContext | null} */
function getRequestContext() {
  return storage.getStore() || null;
}

module.exports = { runWithContext, getRequestContext };
