## Parent PRD

`issues/prd.md`

## What to build

The complete Stage 1 Rekognition Face Liveness flow — from camera permission request through oval-fit + colored lights challenge to pass/fail result. This is the first demoable liveness check.

End-to-end: User clicks "Start Liveness Check" → camera permission prompt (with instruction overlay if denied) → lighting quality check (warns if too dark) → Amplify FaceLivenessDetector runs `FaceMovementAndLightChallenge` → backend creates session, retrieves results → user sees confidence score and pass/fail.

**Includes:**
- Lambda: `createSession` calls Rekognition `CreateFaceLivenessSession` with `FaceMovementAndLightChallenge`, `AuditImagesLimit: 4`, S3 OutputConfig
- Lambda: `getSessionResults` calls `GetFaceLivenessSessionResults`, stores result in DynamoDB sessions table
- React: Amplify FaceLivenessDetector component integration with dark background + oval camera frame
- React: Camera permission denied overlay with browser-specific enable instructions
- React: Pre-session lighting check using MediaPipe Face Mesh (face detected with sufficient clarity)
- React: Result screen showing liveness confidence score and pass/fail
- Backend validates confidence score against threshold (from DynamoDB config, env var fallback, default 90%)
- Audit images stored to S3

## Acceptance criteria

- [ ] User can initiate a liveness session from the app
- [ ] Amplify FaceLivenessDetector renders with oval cutout and colored lights
- [ ] If camera permission is denied, a full-screen instruction overlay appears
- [ ] If lighting is poor, a "Move to a brighter area" warning appears before session starts
- [ ] Liveness session completes and returns a confidence score
- [ ] Score is compared against configurable threshold (default 90%)
- [ ] Pass/fail result is displayed to the user with the score
- [ ] Session result (score, pass/fail, timestamp, user ID) is stored in DynamoDB
- [ ] Up to 4 audit images are stored in S3 under the session ID
- [ ] Reference image from Rekognition is stored for later face comparison
- [ ] Works on both desktop and mobile browsers

## Blocked by

- Blocked by `issues/002-auth-app-shell.md`

## User stories addressed

- User story 1
- User story 7
- User story 8
- User story 9
