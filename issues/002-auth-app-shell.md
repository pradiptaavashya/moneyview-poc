## Parent PRD

`issues/prd.md`

## What to build

A production-quality React PWA that users can access via URL, sign up with email, log in, and see a role-appropriate landing page. This is the app skeleton all feature slices build into.

End-to-end: a MoneyView employee opens the Amplify URL → sees a signup/login screen → creates an account with email → lands on a dashboard showing either "Start Liveness Check" (tester) or "Start Liveness Check" + "Admin Panel" navigation (admin).

**Includes:**
- React app with Tailwind CSS + Headless UI setup
- Framer Motion configured for page transitions
- Cognito integration (signup, login, logout, session management)
- Role-based routing (tester vs admin views)
- Responsive layout: max-width 480px centered card for liveness flow, full-width for admin
- Dark theme camera background container (ready for camera feed in later slices)
- Top nav (desktop) / bottom nav (mobile) with role-appropriate items
- Amplify Hosting deployment with CI/CD from GitHub
- PWA manifest and service worker shell

## Acceptance criteria

- [ ] App deploys to Amplify Hosting and is accessible via HTTPS URL
- [ ] User can sign up with email and verify their account
- [ ] User can log in and see role-appropriate landing page
- [ ] Admin users see navigation to both liveness flow and admin panel
- [ ] Tester users see navigation to liveness flow only
- [ ] Layout is responsive — identical card-based liveness container on desktop and mobile
- [ ] Page transitions are animated with Framer Motion
- [ ] Logout works and redirects to login
- [ ] Unauthenticated users are redirected to login
- [ ] CI/CD deploys on push to main branch

## Blocked by

- Blocked by `issues/001-terraform-infrastructure.md`

## User stories addressed

- User story 40
- User story 41
