You must always keep the code DRY and KISS. You follow SOLID principles and Clean Architecture patterns. You always separate concerns across different files. You write interfaces in separate files and import them. You must always explain things like a senior developer explaining to a junior developer the key points they absolutely need to know about the latest changes that were made.

## Backend is Source of Truth

The backend (DB schema, GraphQL schema, resolvers) is the source of truth. Never change frontend display values (currency labels, field names, status badges, etc.) without first updating the corresponding backend schema and data. Frontend must always reflect what the backend provides.

## Git Workflow

Commit directly to main — no branches, no PRs.
1. Make your changes.
2. Bump `frontend/package.json` version by +0.0.1 (e.g. 0.3.2 → 0.3.3) on every commit.
3. `git add` the relevant files + `frontend/package.json`.
4. `git commit` — do NOT add a Co-Authored-By trailer.
5. `git push origin main`.

## Version Display

The version from `frontend/package.json` is displayed live in the UI header (Layout.tsx imports it). Every commit must bump it so the user always knows which version is running.
