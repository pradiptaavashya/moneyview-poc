## Parent PRD

`issues/prd.md`

## What to build

Expand the single-challenge tracer bullet into the full challenge orchestration engine with all 6 challenge types, randomization, the guarantee rule, and retry logic.

End-to-end: After Stage 1 passes → system selects 3 challenges randomly (guaranteeing at least 1 head movement + 1 facial expression) → presents them in random order with transitions → user completes each → all must pass → if any fails, user sees specific feedback and can retry (up to 3 times, entire challenge set re-randomized) → final pass/fail.

**Challenge types to implement:**
- Head up: Validate Pose.Pitch > threshold (positive pitch)
- Head down: Validate Pose.Pitch < -threshold (negative pitch)
- Head left: Already done in slice 4
- Head right: Validate Pose.Yaw > threshold (positive yaw)
- Smile: Validate Smile.Value = true AND Smile.Confidence > threshold
- Open mouth: Validate MouthOpen.Value = true AND MouthOpen.Confidence > threshold

**Includes:**
- Challenge orchestration engine: random selection algorithm with guarantee constraint, random ordering, state machine for multi-challenge flow
- Lottie animations for each of the 6 challenge types
- 1-second "Success!" transition screen between challenges
- Step dots progress indicator updating through challenges
- Retry flow: "Challenge failed" → retry count display → re-randomized challenge set
- Session failure after max retries: "Verification failed" screen
- All thresholds read from DynamoDB config with env var fallbacks
- DynamoDB: Store full challenge sequence, per-challenge results, retry count

## Acceptance criteria

- [ ] System selects 3 challenges per session (configurable 1-6)
- [ ] At least 1 head movement and 1 facial expression are always included
- [ ] Challenge order is randomized per session (and per retry)
- [ ] Each challenge has its own Lottie animation showing the expected action
- [ ] 1-second success transition appears between challenges
- [ ] Step dots and "Challenge N of M" update correctly
- [ ] All 6 challenge types validate correctly against their respective DetectFaces attributes
- [ ] Smile validates Smile.Confidence against configurable threshold (default 80%)
- [ ] Mouth open validates MouthOpen.Confidence against configurable threshold (default 80%)
- [ ] Head up/down validates Pose.Pitch against configurable angle (default 20 degrees)
- [ ] Head right validates Pose.Yaw against configurable angle (default 20 degrees)
- [ ] Failed challenge shows specific hint for that challenge type
- [ ] User can retry up to 3 times (configurable), with challenges re-randomized
- [ ] After max retries, session fails with "Verification failed" screen
- [ ] Full challenge sequence and per-challenge scores stored in DynamoDB

## Blocked by

- Blocked by `issues/004-single-challenge-tracer-bullet.md`

## User stories addressed

- User story 35
- User story 42
