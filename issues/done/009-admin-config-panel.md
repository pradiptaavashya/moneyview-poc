## Parent PRD

`issues/prd.md`

## What to build

Admin-only configuration panel for tuning all detection parameters at runtime without redeployment.

End-to-end: Admin navigates to "Configuration" in admin panel → sees all tunable parameters with current values → adjusts a slider/input (e.g., liveness threshold from 90% to 95%) → clicks save → DynamoDB is updated → next liveness session immediately uses the new value → no redeployment needed.

**Configurable parameters:**
| Parameter | Default | Range | UI Control |
|-----------|---------|-------|-----------|
| Liveness confidence threshold | 90% | 50-99% | Slider + input |
| Head turn angle threshold | 20° | 10-45° | Slider + input |
| Smile confidence threshold | 80% | 50-99% | Slider + input |
| MouthOpen confidence threshold | 80% | 50-99% | Slider + input |
| Consecutive frames required | 3 | 1-10 | Number input |
| Time window per challenge | 5s | 3-10s | Slider + input |
| Number of challenges | 3 | 1-6 | Number input |
| Enabled challenges | All 6 | Checkboxes | Checkbox group |
| Max retries | 3 | 1-5 | Number input |
| Face match threshold | 90% | 70-99% | Slider + input |

**Includes:**
- React: Admin config page with grouped parameter sections, sliders with numeric input, checkboxes for challenge toggles
- React: Save button with confirmation toast, validation (enforce min/max bounds)
- Lambda: `getConfig` reads from DynamoDB config table, falls back to env vars, then hardcoded defaults
- Lambda: `updateConfig` writes to DynamoDB config table with versioning (stores who changed what, when)
- Config precedence: DynamoDB (runtime) > env vars (deploy-time) > hardcoded defaults
- All other Lambdas read config via shared utility that follows this precedence chain
- Admin-only access (Cognito admin group check)

## Acceptance criteria

- [ ] Only admin-role users can access the configuration page
- [ ] All 10 parameters are displayed with current values
- [ ] Each parameter has appropriate UI control (slider, number input, or checkboxes)
- [ ] Input validation enforces min/max bounds — cannot set invalid values
- [ ] Save writes to DynamoDB immediately
- [ ] Next session uses updated values without any redeployment
- [ ] Config change history is stored (who, when, what changed)
- [ ] If DynamoDB config is empty, env var values are shown as defaults
- [ ] If neither DynamoDB nor env vars are set, hardcoded defaults are shown
- [ ] Confirmation toast appears on successful save
- [ ] Tester-role users cannot access this page (redirected)

## Blocked by

- Blocked by `issues/002-auth-app-shell.md`

## User stories addressed

- User story 18
- User story 19
- User story 20
- User story 21
- User story 22
- User story 23
- User story 24
- User story 25
- User story 26
- User story 27
- User story 28
