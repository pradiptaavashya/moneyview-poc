## Parent PRD

`issues/prd.md`

## What to build

Continuous video recording throughout the liveness session, stored in S3, with playback capability for admin review.

End-to-end: When liveness session begins → MediaRecorder starts capturing the full camera stream (WebM, 720p, portrait 3:4) → recording continues through all challenges → on session complete (pass or fail) → video is uploaded to S3 via presigned URL → admin can play back any session's video from the dashboard.

**Includes:**
- React: MediaRecorder API integration — start recording when pre-flight checks pass, stop when session completes or fails
- React: Frame extraction at 4fps during custom challenges (canvas capture from video element)
- Lambda: `storeVideo` generates presigned PUT URL for direct browser-to-S3 upload
- S3 storage path: `{bucket}/{date}/{session-id}/video.webm`
- S3 storage path: `{bucket}/{date}/{session-id}/frames/{challenge-type}-{timestamp}.jpg`
- S3 storage path: `{bucket}/{date}/{session-id}/audit/{1-4}.jpg` (Rekognition audit images)
- React (admin): Video playback component with standard controls
- React (admin): Frame gallery view — grid of captured frames per challenge with timestamps
- DynamoDB: Store S3 paths in session record for retrieval

## Acceptance criteria

- [ ] Video recording starts automatically when pre-flight checks pass
- [ ] Recording captures full camera stream at 720p, portrait 3:4 aspect ratio
- [ ] Output format is WebM (native MediaRecorder)
- [ ] Recording continues uninterrupted through liveness + all challenges
- [ ] On session complete/fail, video uploads to S3 via presigned URL
- [ ] Challenge frames are extracted at 4fps and stored as JPGs in S3
- [ ] Rekognition audit images are stored in the same session folder
- [ ] S3 paths follow structure: `{date}/{session-id}/video.webm`, `/frames/`, `/audit/`
- [ ] Admin panel shows video playback for any session
- [ ] Admin panel shows frame gallery grid with timestamps
- [ ] Video files are KMS-encrypted in S3
- [ ] S3 lifecycle rule deletes videos after 90 days
- [ ] Upload handles large files gracefully (chunked/multipart if needed)

## Blocked by

- Blocked by `issues/005-full-challenge-engine.md`

## User stories addressed

- User story 38
- User story 39
- User story 12
- User story 13
