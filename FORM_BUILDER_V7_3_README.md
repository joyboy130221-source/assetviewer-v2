# BIB Form Builder v7.3

Changes in this build:
- Available Fields moved outside Submission API Action and remains visible for retrieve-only forms.
- Authentication Profiles moved from Setup to Integration navigation.
- Setup, Integration, and Monitoring sidebar groups can be expanded/collapsed.
- Public form submission displays a blocking loading overlay until the API request completes and prevents duplicate submits.
- Formatting and UI styling cleanup for modified components.

Validation note: run `npm install` then `npm run build` locally. The supplied source archive does not include node_modules, so the build environment cannot resolve React/Vite dependencies without installing them.
