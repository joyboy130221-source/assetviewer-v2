# Analytics Builder layout alignment fix

This patch fixes vertical alignment for paired Analytics Builder fields that have different amounts of secondary content.

## Fixed
- Records Path and Authentication profile now align from the top of the field row.
- Color mode and Palette now align from the top while palette swatches remain below the Palette control.
- The fix is applied to the reusable `.an-fields` layout instead of using field-specific margins or hardcoded heights.
- Existing responsive behavior is preserved: two/three-column field groups still collapse to one column at the existing breakpoint.

## Implementation
The shared Analytics field grid now uses `align-items: start`, and direct field labels use `align-self: start` plus `min-width: 0`. This prevents CSS Grid's default stretch behavior from expanding a shorter field to match a sibling that contains helper text or palette previews.

No database, API, tenant, or analytics-definition changes are required.
