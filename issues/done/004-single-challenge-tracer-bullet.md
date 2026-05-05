## Parent PRD

`issues/prd.md`

## What to build

A single dynamic challenge — "Turn your head left" — working end-to-end through all layers. This is the tracer bullet that proves the custom challenge architecture works before expanding to all 6 challenges.

End-to-end: After Stage 1 liveness passes → screen shows "Turn your head left" with Lottie animation → live camera feed with oval overlay → MediaPipe Face Mesh detects head pose in real-time and shows green check when Yaw exceeds threshold → key frames are sent to Lambda → Lambda calls Rekognition DetectFaces → validates Pose.Yaw against configured threshold → returns authoritative pass/fail → user sees success/failure with score.

**Includes:**
- React: Challenge screen with Lottie animated instruction (head turning left), camera feed, progress indicator ("Challenge 1 of 1"), real-time feedback overlay
- Client-side: MediaPipe Face Mesh integration, self-hosted WASM assets, real-time Yaw tracking, green checkmark when threshold crossed
- Frame capture: Extract frames at 4fps during challenge, identify key frames where client-side detection fires
- Lambda: `validateChallengeFrames` receives key frames (base64), calls DetectFaces with Attributes: ["ALL"], validates Pose.Yaw against threshold (default -20 degrees for left turn)
- Backend: Consecutive frame logic — 3+ frames must exceed threshold for pass
- Backend: 5-second timeout — if time expires without 3 consecutive valid frames, challenge fails
- React: Failure feedback — "Turn your head further to the left" hint
- DynamoDB: Store per-challenge result (challenge type, pass/fail, best score, frames analyzed)

## Acceptance criteria

- [ ] After liveness passes, "Turn your head left" challenge appears with Lottie animation
- [ ] Live camera feed is visible within an oval overlay
- [ ] MediaPipe Face Mesh loads from self-hosted assets (no external calls)
- [ ] Real-time green checkmark appears when head turn is detected client-side
- [ ] Key frames are sent to backend Lambda for server-side validation
- [ ] Lambda calls DetectFaces and validates Pose.Yaw against configurable threshold (default 20 degrees)
- [ ] Challenge passes only when 3+ consecutive server-validated frames meet threshold
- [ ] Challenge fails with a specific hint if 5-second window expires
- [ ] Per-challenge result is stored in DynamoDB session record
- [ ] Captured frames are stored in S3 under `{session-id}/frames/`
- [ ] Works on both desktop and mobile browsers

## Blocked by

- Blocked by `issues/003-rekognition-liveness-flow.md`

## User stories addressed

- User story 2
- User story 3
- User story 4
- User story 5
- User story 34
