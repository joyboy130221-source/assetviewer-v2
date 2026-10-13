const intEnv = (name, fallback, min, max) => {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, value));
};

const limits = () => ({
  maxEntries: intEnv("HTTP_QUERY_MAX_ENTRIES", 200, 1, 5000),
  maxKeyLength: intEnv("HTTP_QUERY_MAX_KEY_LENGTH", 512, 1, 4096),
  maxValueLength: intEnv("HTTP_QUERY_MAX_VALUE_LENGTH", 16384, 1, 1048576),
});

function normalizeQueryParameters(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.key !== "string"
      ) {
        throw Object.assign(
          new Error(`Invalid query parameter at index ${index}.`),
          { status: 400 },
        );
      }
      return {
        key: entry.key,
        value: entry.value == null ? "" : String(entry.value),
      };
    });
  }
  if (typeof value === "object") {
    return Object.entries(value).map(([key, entryValue]) => ({
      key,
      value: entryValue == null ? "" : String(entryValue),
    }));
  }
  throw Object.assign(
    new Error(
      "Query parameters must be an object or an ordered key/value array.",
    ),
    { status: 400 },
  );
}

function validatedQueryParameters(value) {
  const entries = normalizeQueryParameters(value).filter((entry) =>
    entry.key.trim(),
  );
  const config = limits();
  if (entries.length > config.maxEntries) {
    throw Object.assign(
      new Error(`Too many query parameters. Maximum is ${config.maxEntries}.`),
      { status: 400 },
    );
  }
  return entries.map(({ key, value }) => {
    const normalizedKey = key.trim();
    if (normalizedKey.length > config.maxKeyLength)
      throw Object.assign(
        new Error(
          `Query parameter key exceeds ${config.maxKeyLength} characters.`,
        ),
        { status: 400 },
      );
    if (value.length > config.maxValueLength)
      throw Object.assign(
        new Error(
          `Query parameter '${normalizedKey}' exceeds ${config.maxValueLength} characters.`,
        ),
        { status: 400 },
      );
    return { key: normalizedKey, value };
  });
}

function setQueryParameter(value, key, entryValue) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return normalizeQueryParameters(value);
  const entries = normalizeQueryParameters(value);
  let replaced = false;
  const next = entries
    .map((entry) => {
      if (entry.key === normalizedKey) {
        if (replaced) return null;
        replaced = true;
        return { key: normalizedKey, value: String(entryValue ?? "") };
      }
      return entry;
    })
    .filter(Boolean);
  if (!replaced)
    next.push({ key: normalizedKey, value: String(entryValue ?? "") });
  return next;
}

function appendQueryParameters(url, value) {
  for (const { key, value: entryValue } of validatedQueryParameters(value)) {
    url.searchParams.append(key, entryValue);
  }
  return url;
}

function queryParametersForLog(value) {
  return validatedQueryParameters(value);
}

module.exports = {
  normalizeQueryParameters,
  validatedQueryParameters,
  setQueryParameter,
  appendQueryParameters,
  queryParametersForLog,
  limits,
};
