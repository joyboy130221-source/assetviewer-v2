/**
 * Password policy (configurable via PASSWORD_MIN_LENGTH and
 * PASSWORD_MIN_CHARACTER_CLASSES). Applied when passwords are set or changed;
 * existing passwords keep working until they are next changed.
 */
const crypto = require("crypto");
const { getSecurityConfig } = require("../config/security-config");

/**
 * SHA-256 fingerprints of passwords that were shipped as defaults in earlier
 * releases. Only hashes are kept, never the passwords themselves. Accounts
 * still using one are forced to change it at their next sign-in.
 */
const KNOWN_DEFAULT_PASSWORD_HASHES = new Set([
  "63d479f692f0add60fb278e8978c8abb71413aa767a2ea1b897167e6f6aa0ab0",
]);

function isKnownDefaultPassword(password) {
  const hash = crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
  return KNOWN_DEFAULT_PASSWORD_HASHES.has(hash);
}

/** @returns {string|null} a user-facing reason, or null when acceptable. */
function passwordPolicyViolation(password, { username, email } = {}) {
  const { minLength, minCharacterClasses } = getSecurityConfig().passwordPolicy;
  const value = String(password || "");
  if (value.length < minLength)
    return `Password must be at least ${minLength} characters long.`;
  if (value.length > 256)
    return "Password must be at most 256 characters long.";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(value),
  ).length;
  if (classes < minCharacterClasses)
    return `Password must contain at least ${minCharacterClasses} of: lowercase letters, uppercase letters, numbers, symbols.`;
  const lower = value.toLowerCase();
  for (const identity of [username, String(email || "").split("@")[0]])
    if (
      identity &&
      String(identity).length >= 3 &&
      lower.includes(String(identity).toLowerCase())
    )
      return "Password must not contain the username or email name.";
  if (isKnownDefaultPassword(value))
    return "This password is a published default and cannot be used.";
  return null;
}

/** Policy description for the UI. */
function passwordPolicySummary() {
  const { minLength, minCharacterClasses } = getSecurityConfig().passwordPolicy;
  return { minLength, minCharacterClasses };
}

module.exports = {
  passwordPolicyViolation,
  passwordPolicySummary,
  isKnownDefaultPassword,
};
