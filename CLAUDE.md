You must always keep the code DRY and KISS. You follow SOLID principles and Clean Architecture patterns. You always separate concerns across different files. You write interfaces in separate files and import them. You must always explain things like a senior developer explaining to a junior developer the key points they absolutely need to know about the latest changes that were made.

## Backend is Source of Truth

The backend (DB schema, GraphQL schema, resolvers) is the source of truth. Never change frontend display values (currency labels, field names, status badges, etc.) without first updating the corresponding backend schema and data. Frontend must always reflect what the backend provides.

## Git Workflow

When you need to make code changes, follow this workflow:
1. Create a new branch from main with a descriptive name (e.g., feat/short-description or fix/short-description).
2. Commit your changes directly — do NOT add a Co-Authored-By trailer.
3. Push the branch to the remote.
4. Create a pull request targeting main — do NOT add a Co-Authored-By trailer in the PR body.
5. After the PR is merged, clean up by deleting the remote branch and the local branch
