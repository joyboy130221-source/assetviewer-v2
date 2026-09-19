# Form Builder Wizards - v5.0.0

## Included in this iteration
- Integration > Form Builder Wizards menu
- Wizard choice: Empty Form / Integrated Form (future placeholder)
- dnd-kit based designer with Text Box, Date Picker, Number Picker, Text Area, Checkbox, Radio Button
- Field properties: id, name, label, placeholder, required, radio options
- Drag from palette and sortable/reorder fields
- Form List -> Designer -> Preview -> Publish -> User Form -> Submission List
- Responsive UI matching the existing admin console

## Persistence note
This first iteration intentionally stores form definitions and submissions in browser localStorage. The model/storage layer is isolated under `src/features/form-builder/`, so a database/API implementation can replace it in a later iteration without rewriting the designer.

## Install and run
Run `npm install` to install the newly added dnd-kit packages, then `npm run dev`.
