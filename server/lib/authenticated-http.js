const { execute } = require("./integration-http");
const { applyAuthProfile, refreshManagedAuth } = require("./form-engine");

/** Execute an integration action with the shared Authentication Profile lifecycle.
 * Managed bearer tokens are cached proactively and refreshed once on HTTP 401.
 */
async function executeAuthenticated(action, query, options = {}) {
  let prepared = await applyAuthProfile(action, query, options);
  let response = await execute(prepared);
  if (
    response.status === 401 &&
    prepared.__authProfileType === "managedBearer"
  ) {
    prepared = await refreshManagedAuth(prepared, query, options);
    response = await execute(prepared);
  }
  return { action: prepared, response };
}
module.exports = { executeAuthenticated };
