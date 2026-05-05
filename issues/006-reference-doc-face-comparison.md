## Parent PRD

`issues/prd.md`

## What to build

Reference ID document upload at the start of the session, and face comparison against the liveness reference image after the session passes.

End-to-end: User starts session → first screen asks to upload or capture an ID photo → system extracts face from the document using DetectFaces → stores in S3 → (liveness + challenges complete) → system calls CompareFaces (liveness reference image vs document face) → returns similarity score → pass/fail against configurable threshold (default 90%) → user sees final combined result.

**Includes:**
- React: Upload screen with drag-and-drop or camera capture for reference ID
- React: Preview of uploaded document with detected face highlighted
- Lambda: `uploadReference` generates presigned S3 URL, calls DetectFaces on uploaded image to extract/crop face region
- Lambda: `compareFaces` calls CompareFaces (liveness reference image Source vs document face Target), returns similarity percentage
- React: Final result screen combining liveness score + challenge results + face match score
- Face match threshold configurable (default 90%, from DynamoDB config / env var)
- Store comparison result and similarity score in DynamoDB session record

## Acceptance criteria

- [ ] User is prompted to upload an ID photo before the liveness session begins
- [ ] Drag-and-drop and camera capture (mobile) both work
- [ ] Uploaded document preview shows the detected face region highlighted
- [ ] If no face is detected in the document, user is asked to re-upload
- [ ] After full session passes, CompareFaces runs automatically
- [ ] Similarity score is compared against configurable threshold (default 90%)
- [ ] Final result screen shows combined pass/fail with all scores (liveness, challenges, face match)
- [ ] Face match failure shows "Face does not match reference document" message
- [ ] Comparison result and score are stored in DynamoDB session record
- [ ] Reference document is stored in S3 under `{session-id}/reference/`

## Blocked by

- Blocked by `issues/003-rekognition-liveness-flow.md`

## User stories addressed

- User story 6
