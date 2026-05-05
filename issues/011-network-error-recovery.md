## Parent PRD

`issues/prd.md`

## What to build

Graceful handling of network failures, session timeouts, and connectivity issues throughout the liveness flow without losing user progress.

End-to-end: User is mid-challenge → network drops → system auto-retries the failed API call once → if still failing, shows "Connection lost — tap to retry" overlay (session state preserved) → user taps retry → challenge resumes from where it left off → if network doesn't return within 30 seconds, session fails with option to start over. Separately: 2-minute overall inactivity timeout expires the session.

**Includes:**
- React: Network status detection (navigator.onLine + fetch failure handling)
- React: "Connection lost" overlay with retry button (non-destructive, preserves session state)
- React: Auto-retry logic — on API failure, retry once silently before showing error
- React: Frame queue — during challenges, captured frames are queued locally if network is unavailable, sent when connection resumes
- React: 30-second network timeout — if connection doesn't return, show "Session expired — start over" screen
- React: 2-minute overall inactivity timeout — if user stops interacting, session expires
- React: Rekognition 3-minute session ID expiry handled transparently (not relevant post-Stage 1, since Stage 1 completes before challenges begin)
- Lambda: Idempotent endpoints — retried requests don't create duplicate records
- Error boundaries — unexpected JS errors show friendly "Something went wrong" with retry option, not a white screen

## Acceptance criteria

- [ ] Network drop during API call triggers one automatic retry
- [ ] If retry fails, "Connection lost — tap to retry" overlay appears
- [ ] Session state is preserved — user doesn't lose progress on network blip
- [ ] Captured frames during challenges queue locally during network outage
- [ ] Queued frames are sent when connection resumes
- [ ] If network doesn't return within 30 seconds, session fails gracefully
- [ ] "Start over" button is available after session failure
- [ ] 2-minute inactivity timeout expires the session with "Session expired" message
- [ ] Retried API calls don't create duplicate DynamoDB records (idempotency)
- [ ] Unexpected JavaScript errors show friendly error screen with retry option
- [ ] No white screens or unhandled promise rejections during any failure scenario
- [ ] Works correctly on flaky mobile networks (3G simulation)

## Blocked by

- Blocked by `issues/005-full-challenge-engine.md`

## User stories addressed

- User story 10
