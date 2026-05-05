# PRD: MoneyView PWA Video Liveness Hardening Demo

## Problem Statement

MoneyView's existing video liveness solution on their PWA platform uses a passive, fixed-flow liveness check (AWS Rekognition Face Liveness with basic oval-fit). Fraudsters have reverse-engineered this predictable flow and are using AI-generated videos to bypass it. At least one fraudulent attempt scored high enough confidence to pass as a live video, allowing the fraudster to proceed in the loan application journey.

The current system has three fundamental weaknesses:
1. The challenge is passive and predictable — fraudsters know exactly what motion to simulate
2. No raw video is stored, leaving only extracted selfie frames as forensic evidence
3. No additional anti-spoofing layers exist beyond Rekognition's built-in detection

MoneyView needs a hardened liveness solution that introduces dynamic, unpredictable challenges that current deepfake generation tools cannot handle in real-time.

## Solution

Build a standalone, production-quality PWA demo application that layers dynamic challenge-response verification on top of AWS Rekognition Face Liveness. The system uses a two-stage approach:

**Stage 1:** Standard Rekognition Face Liveness session using `FaceMovementAndLightChallenge` (highest accuracy mode with colored light sequence).

**Stage 2:** Custom dynamic challenges randomly selected and ordered each session — head movements (up, down, left, right) and facial expressions (smile, open mouth) — validated using a hybrid approach of client-side MediaPipe Face Mesh for real-time UX feedback and server-side Rekognition DetectFaces for authoritative pass/fail.

The demo includes anti-spoofing pre-checks (virtual camera detection, browser environment validation, AI watermark detection), full video stream storage for forensics, face comparison against a reference ID document, and a configurable admin panel for tuning all detection parameters without redeployment.

MoneyView will circulate the demo internally (~40 employees) to evaluate the solution before deciding whether to integrate it into their production loan journey.

## User Stories

1. As a loan applicant, I want to complete a liveness check by following on-screen prompts, so that I can verify my identity and proceed with my application.
2. As a loan applicant, I want to see clear animated instructions for each challenge (e.g., "Turn your head left"), so that I understand what action to perform without confusion.
3. As a loan applicant, I want real-time visual feedback (green checkmark) when I successfully complete a challenge, so that I know the system detected my action.
4. As a loan applicant, I want to see my progress through challenges (e.g., "Challenge 2 of 3"), so that I know how much is remaining.
5. As a loan applicant, I want a specific hint if I fail a challenge (e.g., "Turn your head further left"), so that I can correct my action on retry.
6. As a loan applicant, I want to upload my ID photo at the start of the session, so that the system can verify my face matches my identity document.
7. As a loan applicant, I want the liveness check to work on both my phone browser and desktop browser, so that I can complete verification on any device.
8. As a loan applicant, I want a clear error message if my camera permission is denied, with instructions on how to enable it, so that I can resolve the issue myself.
9. As a loan applicant, I want the system to warn me about poor lighting before I start, so that I don't waste time on a session that will fail.
10. As a loan applicant, I want the system to auto-retry on a network blip rather than making me start over, so that I don't lose progress due to connectivity issues.
11. As a fraud analyst (admin), I want to view all session results with pass/fail status, scores, and timestamps, so that I can monitor liveness check effectiveness.
12. As a fraud analyst (admin), I want to play back the raw video stream from any session, so that I can investigate suspicious attempts.
13. As a fraud analyst (admin), I want to view frame-by-frame captures from each challenge, so that I can see exactly what the system analyzed.
14. As a fraud analyst (admin), I want a dedicated "Flagged Sessions" tab showing watermark-detected attempts, so that I can quickly identify AI-generated content.
15. As a fraud analyst (admin), I want to see device/browser information for each session, so that I can identify patterns in fraud attempts.
16. As a fraud analyst (admin), I want to export session results as CSV, so that I can share data with stakeholders and perform offline analysis.
17. As a fraud analyst (admin), I want to see analytics dashboards (pass rate trends, average scores, challenge-level breakdowns), so that I can assess overall system performance.
18. As a system administrator (admin), I want to configure the liveness confidence threshold (50-99%), so that I can balance security vs. user experience.
19. As a system administrator (admin), I want to configure head turn angle thresholds (10-45 degrees), so that I can adjust sensitivity for the head movement challenges.
20. As a system administrator (admin), I want to configure smile and mouth-open confidence thresholds (50-99%), so that I can tune facial expression detection sensitivity.
21. As a system administrator (admin), I want to configure the number of challenges per session (1-6), so that I can adjust the security/friction tradeoff.
22. As a system administrator (admin), I want to enable or disable individual challenge types, so that I can customize which challenges are active.
23. As a system administrator (admin), I want to configure the time window per challenge (3-10 seconds), so that I can adjust how long users have to complete each action.
24. As a system administrator (admin), I want to configure the consecutive frames required (1-10), so that I can adjust detection strictness.
25. As a system administrator (admin), I want to configure max retries per session (1-5), so that I can balance security with user tolerance.
26. As a system administrator (admin), I want to configure the face match threshold (70-99%), so that I can adjust reference document comparison strictness.
27. As a system administrator (admin), I want all configuration changes to take effect immediately without redeployment, so that I can iterate quickly during testing.
28. As a system administrator (admin), I want configuration parameters also available as environment variables, so that I can set defaults at deployment time.
29. As a security engineer, I want the system to detect and block virtual cameras (OBS, ManyCam, etc.), so that fraudsters cannot feed pre-recorded or AI-generated video.
30. As a security engineer, I want the system to check for C2PA/EXIF metadata indicating AI-generated content, so that images from tools like Grok or Gemini are flagged.
31. As a security engineer, I want AI-watermarked reference documents to be hard-blocked, so that fraudsters cannot submit AI-generated ID photos.
32. As a security engineer, I want AI-watermarked video frames to be soft-flagged for admin review, so that potential false positives don't block legitimate users.
33. As a security engineer, I want browser environment checks (headless browser, developer tools, screen sharing detection), so that automated attacks are blocked.
34. As a security engineer, I want the challenge order randomized per session, so that fraudsters cannot predict and pre-generate the required sequence.
35. As a security engineer, I want at least one head movement and one facial expression guaranteed per session, so that different spoof attack vectors are always tested.
36. As a security engineer, I want the system to block sessions with multiple faces detected, so that coaching attacks are prevented.
37. As a security engineer, I want the system to warn and then fail sessions with occluded faces (masks, hands, sunglasses), so that detection accuracy is maintained.
38. As a security engineer, I want full video streams stored in S3 with KMS encryption for 90 days, so that forensic investigation is possible.
39. As a security engineer, I want audit images from Rekognition (up to 4) stored alongside video, so that I have Rekognition's own analysis evidence.
40. As a tester (MoneyView employee), I want to sign up with my email and access the demo via a shared URL, so that I can participate in UAT evaluation.
41. As a tester, I want to see my own session results (pass/fail, scores), so that I can understand how the system evaluated me.
42. As a tester, I want to retry the liveness check if I fail, so that I can test different conditions (lighting, angles, etc.).

## Implementation Decisions

### Major Modules

**1. Terraform Infrastructure Module**
- S3 buckets (video storage, reference documents, Amplify assets)
- DynamoDB tables (config, session results)
- Lambda functions (session management, frame validation, face comparison, config CRUD)
- API Gateway (REST API for all backend operations)
- Cognito user pool (email signup, tester/admin groups)
- IAM roles and policies
- KMS key for encryption
- S3 lifecycle rules (90-day retention)
- Region: ap-south-1 (Mumbai)

**2. Backend Lambda Layer (Node.js)**
- `createSession` — Initiates Rekognition Face Liveness session, generates session record in DynamoDB
- `validateChallengeFrames` — Receives key frames, calls Rekognition DetectFaces, validates against configured thresholds (Pose.Yaw/Pitch for head turns, Smile/MouthOpen attributes for expressions)
- `compareFaces` — Calls DetectFaces on uploaded reference doc to extract face, then CompareFaces against liveness reference image
- `storeVideo` — Handles presigned URL generation for direct S3 upload of WebM video stream
- `configCRUD` — Read/write config parameters from DynamoDB, with env var defaults
- `getSessionResults` — Retrieve session data for tester (own) or admin (all) views
- `checkWatermark` — Parse C2PA/EXIF metadata from uploaded frames and reference documents

**3. Frontend Liveness Flow Module (React)**
- Amplify FaceLivenessDetector integration for Stage 1 (Rekognition liveness)
- Camera capture with MediaRecorder API (WebM, 720p, portrait 3:4)
- MediaPipe Face Mesh integration for real-time client-side pose/expression detection
- Challenge orchestration engine (random selection, ordering, timing, state management)
- Challenge UI (Lottie animated instructions, oval camera overlay, progress indicators, real-time feedback)
- Pre-flight checks (camera permission, lighting, single face, occlusion, virtual camera, browser environment)
- Reference document upload with preview

**4. Anti-Spoofing Module**
- Virtual camera detection via `navigator.mediaDevices.enumerateDevices()` name matching and `MediaStreamTrack.getCapabilities()` hardware property checks
- Browser environment validation (headless detection, DevTools detection, screen sharing detection)
- C2PA metadata parser for captured frames and reference documents
- EXIF metadata reader for AI tool signatures

**5. Admin Panel Module (React)**
- Configuration tuning interface (sliders/inputs for all thresholds)
- Session results table with filters (date, user, pass/fail, flagged)
- Session detail view (video playback, frame-by-frame, per-challenge scores)
- Flagged sessions tab (watermark detections highlighted)
- Analytics dashboard (pass rate trends, average scores, challenge breakdown)
- CSV export functionality

**6. Auth Module**
- Cognito integration with email-based signup
- Role-based access (tester group: own results only; admin group: full access + config)
- Protected routes in React

### Technical Decisions

- **Hybrid validation:** MediaPipe Face Mesh runs client-side for instant UX feedback. Rekognition DetectFaces runs server-side on ~5-10 key frames per challenge for authoritative pass/fail. Client-side result is never trusted for the final decision.
- **Frame capture rate:** 4 frames/sec during custom challenges
- **Challenge guarantee:** Algorithm ensures at least 1 head movement (up/down/left/right) and 1 facial expression (smile/mouth open) in every session
- **Session flow order:** Upload ID → Pre-flight checks → Rekognition liveness (Stage 1) → Custom challenges (Stage 2) → Face comparison → Result
- **Video format:** WebM (browser-native MediaRecorder output, no transcoding)
- **S3 structure:** `{bucket}/{date}/{session-id}/video.webm` + `/frames/` + `/audit/` + `/reference/`
- **Config precedence:** DynamoDB (runtime) > Environment variables (deploy-time) > Hardcoded defaults
- **Rekognition TPS:** Request increase to 20 TPS for liveness, 50 TPS for DetectFaces before UAT (default 5 TPS per operation)
- **Session ID expiry:** Rekognition sessions expire after 3 minutes; system transparently creates new sessions if needed
- **Responsive layout:** Max-width 480px centered card for liveness flow (identical on desktop and mobile), admin panel uses full width on larger screens

### API Contracts

- `POST /sessions` — Create new liveness session (returns sessionId, challenges list)
- `GET /sessions/:id` — Get session result (role-filtered)
- `GET /sessions` — List all sessions (admin) or own sessions (tester)
- `POST /sessions/:id/validate` — Submit key frames for challenge validation
- `POST /sessions/:id/compare` — Trigger face comparison
- `POST /sessions/:id/video-url` — Get presigned S3 upload URL for video
- `POST /reference/upload` — Upload reference ID document (returns presigned URL)
- `POST /reference/check-watermark` — Check uploaded document for AI watermarks
- `GET /config` — Get current config (admin only)
- `PUT /config` — Update config parameters (admin only)
- `GET /analytics` — Get aggregated analytics (admin only)
- `GET /sessions/export` — CSV export of session results (admin only)

## Testing Decisions

A good test verifies external behavior through the module's public interface, not implementation details. Tests should be resilient to refactoring — if the behavior hasn't changed, the test shouldn't break.

### Modules to Test

**1. Challenge Orchestration Engine**
- Verify random selection produces valid sets (correct count, at least 1 head + 1 expression)
- Verify no duplicate challenges in a single session
- Verify timing logic (timeout after configured window)
- Verify pass/fail logic (consecutive frame requirement, all-must-pass rule)
- Verify retry counting and session failure after max retries

**2. Frame Validation Logic (Lambda)**
- Verify head turn detection: given DetectFaces response with Pose.Yaw > threshold, challenge passes
- Verify head turn rejection: Pose.Yaw below threshold, challenge fails
- Verify smile/mouth-open detection against confidence thresholds
- Verify consecutive frame requirement (2 passing frames with 1 failing in between = fail)
- Verify configurable thresholds are read from DynamoDB/env vars correctly

**3. Anti-Spoofing Module**
- Verify virtual camera names are correctly identified from device enumeration
- Verify C2PA metadata is correctly parsed and flagged
- Verify EXIF metadata from known AI tools is detected
- Verify hard-block vs soft-flag behavior based on context (reference doc vs video frame)

**4. Config Module**
- Verify config precedence (DynamoDB > env > defaults)
- Verify all parameter bounds are enforced (e.g., threshold can't be set to 101%)
- Verify config changes propagate immediately without restart

**5. Session Management**
- Verify session state transitions (created → liveness_passed → challenges_in_progress → comparison → complete/failed)
- Verify role-based data filtering (tester sees own sessions, admin sees all)
- Verify session timeout after 2 minutes of inactivity

### Testing Approach
- Unit tests for orchestration logic, validation logic, and config module (pure functions, mockable AWS SDK calls)
- Integration tests for Lambda handlers with mocked Rekognition responses
- E2E test with real webcam for the full flow (manual, pre-UAT)

## Out of Scope

- **Finger/hand gesture detection** — Rekognition does not support hand detection. Deferred to backlog pending custom ML model or MediaPipe Hands evaluation.
- **"Write a number and speak" audio challenge** — Requires microphone permission (causes user drop-off) and speech-to-text processing. Deferred as future enhancement.
- **AI-generated video stream detection** — Requires training a deepfake detection ML model. Flagged as future requirement #7.
- **Pixel-level invisible watermark detection (SynthID, etc.)** — No publicly available API. Only metadata-level detection (C2PA/EXIF) is in scope.
- **Multi-language support** — Demo is English-only. Internationalization is a separate effort.
- **Production deployment / MoneyView codebase integration** — This is a standalone demo for evaluation. Integration decision comes after UAT.
- **Custom domain / DNS** — Demo uses Amplify default domain. Custom domain added if MoneyView adopts.
- **Native mobile app** — PWA only (browser-based for both desktop and mobile).

## Further Notes

- **MoneyView's current gap:** They don't store raw video — only extracted selfie frames from Rekognition. This demo stores the full video stream, giving them forensic evidence they currently lack.
- **Rekognition limitation:** The Face Liveness API only offers two challenge modes (oval + lights, or oval only). All "dynamic challenges" (head turns, expressions) are custom code built on top of DetectFaces, not native liveness features.
- **MediaPipe is Google-originated but acceptable:** MediaPipe Face Mesh runs entirely client-side as self-hosted WASM/JS assets. No data is sent to Google. It's used only for UX feedback — never as the source of truth for pass/fail.
- **TPS planning for 40 testers:** Default Rekognition limits are 5 TPS. With 40 concurrent testers, a service limit increase request must be submitted to AWS before UAT begins (target: 20 TPS liveness, 50 TPS DetectFaces).
- **3-minute session expiry:** Rekognition liveness sessions expire 3 minutes after creation. The system handles this transparently — if the user's Stage 2 challenges take too long, a new Rekognition session is NOT needed since Stage 1 already completed.
- **Stakeholders:** Ankit Sharma (MoneyView, raised fraud concern), Santosh Sahu (MoneyView, coordination), Suchir Bhatnagar (AWS, solution architecture lead), Pradipta Dash (AWS, leading build).
