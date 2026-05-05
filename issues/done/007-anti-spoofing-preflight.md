## Parent PRD

`issues/prd.md`

## What to build

Pre-flight anti-spoofing checks that run before the liveness session starts, blocking fraudulent environments and flagging AI-generated content.

End-to-end: User clicks "Start Liveness Check" → system runs pre-flight checks → if virtual camera detected: hard block with error screen ("Virtual cameras are not supported") → if multiple faces: block with "Only one person should be in frame" → if face occluded: warn "Remove face coverings" → if headless browser or screen sharing: block → if reference document has AI watermark (C2PA/EXIF): hard block with "AI-generated documents not accepted" → all checks pass → proceed to liveness.

**Anti-spoofing checks:**
- Virtual camera detection: `navigator.mediaDevices.enumerateDevices()` name matching (OBS Virtual Camera, ManyCam, Snap Camera, etc.) + `MediaStreamTrack.getCapabilities()` missing hardware properties
- Browser environment: headless browser detection (navigator.webdriver), DevTools open detection, screen sharing active check
- Multiple face detection: MediaPipe Face Mesh detects >1 face
- Face occlusion: MediaPipe landmark confidence below threshold
- C2PA metadata parsing on reference document (AI provenance data from Grok, Gemini, DALL-E, Midjourney)
- EXIF metadata check for AI tool signatures (e.g., "AI Generated" tags)

**Includes:**
- React: Blocking error screens for each failure type (styled consistently, no retry for virtual camera/headless, retry for multiple faces/occlusion)
- Lambda: `checkWatermark` endpoint for server-side C2PA/EXIF parsing of uploaded documents
- Client-side: All browser/camera checks run in-browser before hitting any API
- Soft flag vs hard block logic: virtual camera = hard block, AI watermark on ref doc = hard block, AI watermark on video frames = soft flag (stored in DynamoDB, visible in admin panel)
- DynamoDB: Store pre-flight check results and any flags per session

## Acceptance criteria

- [ ] Virtual cameras are detected by name and blocked with clear error message
- [ ] Virtual cameras missing hardware capabilities are flagged
- [ ] Headless browsers (navigator.webdriver=true) are blocked
- [ ] Screen sharing detection blocks session
- [ ] Multiple faces in frame shows "Only one person should be in frame" and blocks
- [ ] Occluded face shows "Remove face coverings" warning with retry
- [ ] C2PA metadata in reference document triggers hard block with "AI-generated documents not accepted"
- [ ] EXIF AI signatures in reference document trigger hard block
- [ ] AI watermarks detected in video frames are soft-flagged (session continues, flag stored)
- [ ] Pre-flight results are stored in DynamoDB session record
- [ ] Virtual camera block has no retry — user must switch to real camera
- [ ] All client-side checks run without API calls (fast, no network dependency)

## Blocked by

- Blocked by `issues/002-auth-app-shell.md`

## User stories addressed

- User story 29
- User story 30
- User story 31
- User story 32
- User story 33
- User story 36
- User story 37
