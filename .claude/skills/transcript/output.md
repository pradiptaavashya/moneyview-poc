# MoneyView Liveness Hardening — Demo Walkthrough

**Duration:** 12 minutes  
**Audience:** MoneyView Engineering & Product Leadership  
**Environment:** Production deployment — ap-south-1 (Mumbai)

---

## Problem Statement

MoneyView's current eKYC liveness verification relies on a single-layer passive check using Amazon Rekognition Face Liveness. This check analyzes colored light reflections and face movement to distinguish live users from static images.

The vulnerability: adversaries have reverse-engineered the challenge sequence. Real-time deepfake engines and AI video generators now produce synthetic video that satisfies the light-and-motion challenge with confidence scores above 90%. The result is successful identity fraud at the point of onboarding — synthetic identities passing KYC, loans disbursed against fabricated profiles, and audit exposure under RBI guidelines.

This solution adds five server-validated defense layers on top of the existing Amazon Rekognition check. It deploys entirely within AWS infrastructure in ap-south-1, introduces no third-party dependencies, and adds approximately eight seconds to the user flow.

---

## Walkthrough

### Layer 1 — Environment Integrity Validation

Before initiating the Amazon Rekognition session, the system validates the client environment. This blocks the delivery mechanism for synthetic video before any compute cost is incurred.

Three checks execute in parallel:

- **Virtual camera detection.** Enumerates `navigator.mediaDevices` and matches device labels against known virtual camera signatures — OBS Virtual Camera, ManyCam, Snap Camera, DroidCam, and others. If a virtual input source is present, the session terminates immediately.

- **Headless browser detection.** Inspects `navigator.webdriver`, `navigator.languages`, and `navigator.plugins` to identify automated environments. Selenium, Puppeteer, and Playwright-driven sessions are blocked.

- **Screen sharing detection.** Examines `MediaStreamTrack.getSettings()` for the `displaySurface` property. If present, the video input originates from a screen capture, not a physical camera.

These checks complete in under two seconds. The user sees a brief verification step. An adversary piping a deepfake through OBS receives an immediate block with no further API invocation.

---

### Layer 2 — Amazon Rekognition Face Liveness

The standard Amazon Rekognition `FaceMovementAndLightChallenge` executes. This is the existing capability — 3D depth analysis, light reflection patterns, and face movement detection. It remains the foundation.

The system creates a session via `CreateFaceLivenessSession`, presents the challenge through the `@aws-amplify/ui-react-liveness` component, and retrieves results via `GetFaceLivenessSessionResults`. Confidence scores and reference images persist to the session record in Amazon DynamoDB.

This layer catches static image replays and low-quality video injection. It does not reliably catch high-fidelity AI-generated video — which is precisely why the subsequent layers exist.

---

### Layer 3 — Randomized Dynamic Challenge Validation

This is the primary anti-deepfake mechanism.

After the Amazon Rekognition session completes, the system issues randomized gesture challenges: head movements (left, right, up, down) and facial expressions (smile, mouth open). The challenge set is generated server-side with two guarantees:

1. At least one head movement challenge per session.
2. At least one facial expression challenge per session.

The randomization prevents pre-generation. An AI video crafted for "turn left" fails when prompted to "smile."

**Client-side feedback.** MediaPipe Face Mesh runs on-device to provide real-time visual confirmation — the user sees a green indicator when the gesture threshold is met. This is purely for user experience.

**Server-side validation.** The authoritative pass/fail decision happens on the backend. Captured frames are submitted to Amazon Rekognition `DetectFaces` with `Attributes: ALL`. The response provides:

- `Pose.Yaw` and `Pose.Pitch` for head movement validation against configurable angle thresholds.
- `Smile.Confidence` and `MouthOpen.Confidence` for expression validation against configurable confidence thresholds.

The system requires consecutive passing frames (configurable, default: 1) to confirm intentional movement rather than noise. Each challenge result — type, pass/fail, best score, frames analyzed, timestamp — persists to the session record.

A compromised client gains no advantage. Even if the browser-side MediaPipe check is bypassed, the server re-evaluates every frame through Amazon Rekognition independently.

---

### Layer 4 — Reference Document Integrity

The user uploads an identity document (Aadhaar, PAN, passport) for face comparison. Before comparison, the system validates document authenticity.

The `checkWatermark` handler retrieves the uploaded document from Amazon S3 and scans the raw byte stream for:

- **C2PA manifests** (Content Credentials) — the industry-standard provenance container embedded by AI generation tools.
- **EXIF AI signatures** — tool-specific metadata from DALL-E, Midjourney, Stable Diffusion, Grok, and Gemini.

Documents containing AI generation markers receive a hard block. The session terminates with a clear indication that a genuine document is required.

Following integrity validation, Amazon Rekognition `CompareFaces` executes against the liveness reference image. This confirms the live person matches the identity document with a configurable similarity threshold (default: 80%).

---

### Layer 5 — Forensic Evidence Collection

Every session produces a complete audit package stored in Amazon S3 with AWS KMS encryption at rest:

```
s3://{bucket}/{date}/{session-id}/
├── video.webm                          # Full session recording
├── frames/{challenge-type}-{ts}.jpg    # Key frames per challenge
└── audit/{rekognition-reference}.jpg   # Amazon Rekognition reference images
```

Lifecycle policies enforce 90-day retention. Admin users access recordings through the dashboard with role-based access control via Amazon Cognito user groups.

This layer serves two purposes: forensic investigation for flagged sessions, and RBI audit compliance with full evidence reconstruction.

---

## System Architecture

*[Screen: Architecture diagram — moneyview.drawio]*

### Request Flow

The architecture diagram illustrates the end-to-end request flow:

1. **End User** accesses the PWA from a mobile or desktop browser.
2. **Amazon Route 53** resolves `liveness.demo12.online` to **Amazon CloudFront**, which serves the React frontend from an S3 origin bucket. **AWS Certificate Manager (ACM)** provides TLS termination.
3. **Amazon Cognito User Pool** authenticates the user. The **Identity Pool** issues temporary AWS credentials scoped to the session — these credentials enable the direct WebRTC connection between the client and Amazon Rekognition for the Face Liveness challenge.
4. API requests route through **Amazon API Gateway** (HTTP API, 12 routes) to **12 AWS Lambda functions** (Node.js 20, TypeScript):
   - `create-session` — Initiates the Amazon Rekognition liveness session
   - `get-session` — Retrieves session results and Rekognition status
   - `list-sessions` — Lists sessions (scoped by role)
   - `validate-frames` — Server-side challenge frame validation via Rekognition `DetectFaces`
   - `compare-faces` — Face comparison against reference document via Rekognition `CompareFaces`
   - `upload-reference` — Generates presigned URL for ID document upload
   - `check-watermark` — AI watermark detection (C2PA/EXIF signature scan)
   - `store-video` — Generates presigned URL for session video upload
   - `get-config` — Reads runtime configuration parameters
   - `update-config` — Updates detection thresholds with bounds validation
   - `get-analytics` — Computes aggregated session analytics
   - `export-sessions` — CSV export of session data
5. Results persist to **Amazon DynamoDB** (Sessions table with GSI, Config table). Video frames and recordings store in **Amazon S3** (Video + Frames bucket). Uploaded identity documents store in a separate **Amazon S3** bucket (Reference Documents). Both data buckets are encrypted at rest using **AWS KMS** with bucket key enabled.

### Machine Learning Layer

Amazon Rekognition handles three distinct operations, each invoked by a separate Lambda function:

- **Face Liveness** (`CreateFaceLivenessSession` / `GetFaceLivenessSessionResults`) — Establishes a WebRTC session directly between the client and Rekognition using temporary credentials from the Identity Pool. Performs 3D depth and light reflection analysis.
- **DetectFaces** — Invoked by `validate-frames` to evaluate head pose (`Pose.Yaw`, `Pose.Pitch`) and expression confidence (`Smile.Confidence`, `MouthOpen.Confidence`) on submitted challenge frames.
- **CompareFaces** — Invoked by `compare-faces` to compute similarity between the liveness reference image and the uploaded identity document.

### Storage Architecture

Three Amazon S3 buckets serve distinct purposes:

| Bucket | Purpose | Encryption | Lifecycle |
|--------|---------|------------|-----------|
| Video Storage | Session recordings + challenge key frames | AWS KMS (SSE-KMS) | 90-day expiration |
| Reference Documents | Uploaded identity documents (Aadhaar, PAN) | AWS KMS (SSE-KMS) | Retained |
| Frontend | Static PWA assets served via CloudFront | Default | N/A |

All data buckets enforce public access block (all four flags enabled) and expose CORS for presigned URL uploads from the client.

### Observability

Amazon CloudWatch receives API Gateway access logs and Lambda execution logs with 14-day retention. Log format captures request ID, source IP, route key, HTTP status, and response length.

---

### Architectural Decisions

**Infrastructure as Code.** All resources are defined in Terraform — reproducible, version-controlled, and auditable. A single `terraform apply` provisions the complete stack.

**Serverless-first.** No instances to manage or patch. AWS Lambda auto-scales from idle to thousands of concurrent sessions. Cost accrues per invocation only.

**Runtime configuration.** Every detection threshold is stored in Amazon DynamoDB and modifiable through the admin interface without redeployment. The fraud operations team can tighten or relax parameters — head angle (10-45°), expression confidence (50-99%), challenge count (1-6), face match threshold (70-99%) — in real time as threat patterns evolve.

**Presigned URL pattern.** Video and reference documents upload directly to Amazon S3 via time-scoped presigned URLs, bypassing the AWS Lambda payload limit. The Lambda function generates the URL; the client uploads directly to the appropriate S3 bucket.

**Separation of Rekognition operations.** Face Liveness, DetectFaces, and CompareFaces are invoked by separate Lambda functions with distinct IAM permissions. This enforces least-privilege access and enables independent scaling and monitoring per operation.

---

## Admin Configuration — Runtime Parameters

The admin dashboard exposes runtime-tunable detection parameters stored in an Amazon DynamoDB config table. Changes take effect immediately on the next session — no redeployment required. Each parameter is validated against defined bounds before persistence.

### Runtime Parameters (Admin Dashboard Controls)

| Parameter | Description | Range | Default | Unit |
|-----------|-------------|-------|---------|------|
| `livenessThreshold` | Minimum confidence score required from Amazon Rekognition Face Liveness to pass the session. Higher values reject more borderline attempts. | 50–99 | 90 | % |
| `headTurnAngle` | Minimum head rotation angle (yaw or pitch) required to pass a head movement challenge. Measured via Rekognition `DetectFaces` Pose attributes. | 10–45 | 20 | degrees |
| `smileThreshold` | Minimum confidence score from Rekognition `Smile.Confidence` to validate the smile challenge. | 50–99 | 80 | % |
| `mouthOpenThreshold` | Minimum confidence score from Rekognition `MouthOpen.Confidence` to validate the mouth-open challenge. | 50–99 | 80 | % |
| `consecutiveFrames` | Number of consecutive frames that must pass the challenge threshold to confirm intentional gesture (filters noise and accidental triggers). | 1–10 | 3 | frames |
| `timeWindow` | Duration allocated per individual challenge. If the user does not complete the gesture within this window, the challenge auto-submits and evaluates available frames. | 3–10 | 5 | seconds |
| `challengeCount` | Total number of randomized challenges issued per session. The system guarantees at least one head movement and one facial expression regardless of count. | 1–6 | 3 | challenges |
| `maxRetries` | Maximum number of retry attempts permitted per failed challenge before the session terminates as failed. | 1–5 | 3 | retries |
| `faceMatchThreshold` | Minimum similarity score required from Rekognition `CompareFaces` between the liveness reference image and the uploaded identity document. | 70–99 | 90 | % |
| `enabledChallenges` | Set of active challenge types available for random selection. Administrators can disable specific challenge types during testing or if a particular gesture proves problematic for a user segment. | — | All 6 enabled | — |

### Deploy-Time Parameters (Terraform Variables)

These parameters are set at infrastructure provisioning time and require a `terraform apply` to modify.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `video_retention_days` | Number of days session video recordings and key frames are retained in Amazon S3 before lifecycle expiration deletes them. | 90 |
| `frame_capture_rate` | Frames per second captured during challenge execution. Balances validation accuracy against bandwidth and storage cost. | 4 |
| `environment` | Deployment environment identifier (`dev`, `staging`, `prod`). Used as a prefix for all resource names to enable multi-environment isolation. | `dev` |
| `aws_region` | AWS region for all provisioned resources. | `ap-south-1` |
| `cognito_admin_emails` | Email addresses assigned to the admin Cognito group at provisioning time. These users have access to all sessions, analytics, configuration, and video playback. | `[]` |

### Configuration Precedence

The system resolves configuration values in the following order:

1. **Amazon DynamoDB config table** (runtime values set via admin dashboard) — highest priority
2. **AWS Lambda environment variables** (set at deploy time via Terraform) — fallback
3. **Application defaults hardcoded in the handler** — lowest priority

This layered approach enables the fraud operations team to respond to emerging threats without engineering involvement, while ensuring safe defaults are always present even if the DynamoDB table is empty or unreachable.

---

## Code Architecture

### Build Pipeline — Source to Deployment

The Lambda handlers follow a two-stage build process:

**Source (TypeScript):** `backend/src/handlers/*.ts` — 12 handler files. This is the development source of truth. Each handler is authored in TypeScript with full type annotations, AWS Lambda type imports (`APIGatewayProxyEvent`, `APIGatewayProxyResult`), and non-null assertions on environment variables.

**Build output (JavaScript):** `infrastructure/lambda_dist/` — compiled artifacts deployed to AWS Lambda. The build command:

```bash
esbuild backend/src/handlers/*.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outdir=infrastructure/lambda_dist \
  --format=esm \
  --out-extension:.js=.mjs
```

esbuild performs the following transformations:

| Aspect | Source (TypeScript) | Build Output (ESM) |
|--------|--------------------|--------------------|
| Type annotations | `(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>` | `(event)` |
| Non-null assertions | `process.env.SESSIONS_TABLE_NAME!` | `process.env.SESSIONS_TABLE_NAME` |
| AWS SDK imports | External package references | Bundled inline (zero `node_modules` at runtime) |
| Module format | TypeScript ESM | `.mjs` (native ES Modules for Node.js 20) |
| Handler entry point | Named export `handler` | `index.mjs` exporting `handler` |

Each Lambda function receives a self-contained single-file bundle with all dependencies inlined. No `node_modules` directory is deployed — esbuild resolves and bundles the AWS SDK v3 clients at build time. This reduces cold start latency and deployment package size.

The Terraform configuration in `infrastructure/lambda.tf` references these built artifacts. The `for_each` pattern iterates over all 12 handler definitions and provisions each as an independent AWS Lambda function with shared environment variables (S3 bucket names, DynamoDB table names, KMS key ARN, Cognito User Pool ID).

### Handler Design

**Type-safe contracts across the stack.** Both frontend and backend are TypeScript. API request and response shapes are defined as interfaces, enforced at compile time.

```typescript
type ChallengeType = "head-left" | "head-right" | "head-up" | "head-down" | "smile" | "mouth-open";
```

**Single-responsibility handlers.** Each AWS Lambda function performs exactly one operation — `createSession`, `validateFrames`, `checkWatermark`, `compareFaces`. Functions deploy and scale independently. No shared mutable state.

**Deterministic challenge diversity.** The selection algorithm guarantees coverage across challenge categories while maintaining randomization within each category.

**Server-authoritative validation.** Client-side detection exists solely for user experience feedback. Every pass/fail decision executes through Amazon Rekognition on the server. A tampered client cannot influence the outcome.

**Audit trail persistence.** Every challenge result — type, score, frame count, consecutive frames, completion timestamp — appends to the session record in Amazon DynamoDB. The full session is reconstructible for compliance review.

---

## Outcome

| Metric | Single-Layer Baseline | Six-Layer Implementation |
|--------|----------------------|--------------------------|
| AI video bypass resistance | Vulnerable to high-fidelity deepfakes | Blocks at environment, randomization, and comparison layers |
| Fraud evidence | Session logs only | Full video, key frames, per-challenge scores |
| Time to adjust thresholds | Requires code deployment | Admin interface, immediate effect |
| Additional user time | — | ~8 seconds |
| Infrastructure footprint | — | Same AWS account, same region, serverless |
| RBI audit readiness | Partial | Complete evidence chain per session |

---

## Recommended Next Steps

1. **Immediate.** Grant MoneyView fraud and product teams admin access to the deployed environment. Validate detection thresholds against known fraud patterns.

2. **Week one.** Submit Amazon Rekognition service limit increase for `DetectFaces` TPS to support 40-concurrent-user acceptance testing. Configure Amazon Cognito federation against MoneyView's existing identity provider.

3. **Week two.** Execute user acceptance testing with internal QA across physical devices, network conditions, and documented fraud scenarios.

The system is deployed and operational. The infrastructure, application code, and detection logic are production-grade. The remaining path to integration is configuration, load testing, and organizational sign-off.

---
