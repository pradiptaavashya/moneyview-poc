## Parent PRD

`issues/prd.md`

## What to build

Admin dashboard showing all session results, flagged sessions, analytics, and CSV export.

End-to-end: Admin navigates to "Sessions" → sees a filterable table of all liveness sessions (date, user, pass/fail, scores, flagged status) → clicks a session row → sees full detail view (video playback, frame gallery, per-challenge breakdown, all scores, device info) → switches to "Flagged" tab → sees only sessions with watermark/spoofing flags → switches to "Analytics" tab → sees pass rate trends, average scores, challenge-level breakdowns → clicks "Export CSV" → downloads session data.

**Includes:**
- React: Session results table with columns (date, user email, overall result, liveness score, challenge score, face match score, flags)
- React: Filters — date range picker, user search, pass/fail toggle, flagged-only toggle
- React: Session detail view — video player, frame gallery, per-challenge results (type, pass/fail, score, time taken), device/browser info, pre-flight check results, watermark flags
- React: Flagged sessions tab — filtered view showing only sessions with anti-spoofing flags, flag reason displayed
- React: Analytics tab — overall pass rate (pie chart), pass rate over time (line chart), average scores per challenge type (bar chart), failure reasons breakdown
- React: CSV export button — downloads filtered session list with all data columns
- Lambda: `getSessionResults` with pagination, filtering, role-based access (tester sees own, admin sees all)
- Lambda: `getAnalytics` aggregates from DynamoDB (or computes on-the-fly for demo scale)
- Lambda: `exportCSV` generates and returns CSV file

## Acceptance criteria

- [ ] Admin sees all sessions in a paginated, sortable table
- [ ] Table columns include: date, user, result, liveness score, face match score, flags
- [ ] Filters work: date range, user search, pass/fail, flagged-only
- [ ] Clicking a session row opens full detail view
- [ ] Detail view shows video playback (from slice 008)
- [ ] Detail view shows frame gallery grid
- [ ] Detail view shows per-challenge breakdown (type, result, score, time)
- [ ] Detail view shows device/browser information
- [ ] Detail view shows pre-flight check results and any flags
- [ ] "Flagged Sessions" tab shows only sessions with anti-spoofing alerts
- [ ] Flag reason is clearly displayed (e.g., "C2PA metadata detected", "Virtual camera blocked")
- [ ] Analytics tab shows pass rate pie chart
- [ ] Analytics tab shows pass rate over time line chart
- [ ] Analytics tab shows average scores per challenge type bar chart
- [ ] CSV export downloads all visible (filtered) sessions with full data
- [ ] Tester role only sees their own sessions (no admin tabs)
- [ ] Dashboard loads performantly with up to 1000 sessions

## Blocked by

- Blocked by `issues/008-video-stream-storage-playback.md`
- Blocked by `issues/009-admin-config-panel.md`

## User stories addressed

- User story 11
- User story 14
- User story 15
- User story 16
- User story 17
