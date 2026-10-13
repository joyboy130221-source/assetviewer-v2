# BIB v8.17 - Array Index Template Paths

Central template paths now support explicit zero-based numeric indexes: `{{steps.step1.member[0].href}}`, `{{steps.step1.member[1].href}}`, `{{source.items[0].id}}`, and composition such as `{{truncate(trim(steps.step1.member[0].description), 100)}}`.

Existing nested-object templates remain unchanged. Out-of-range indexes resolve as an empty template value. Integration response paths preserve historical implicit-first-array behavior for backward compatibility while accepting explicit indexes.

Array access is direct O(path depth), not an array scan. `TEMPLATE_MAX_PATH_SEGMENTS` defaults to 64 and is bounded to 8..256. Prototype-related keys are rejected.
