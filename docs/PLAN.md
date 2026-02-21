# Parley — Implementation Plan

**Last updated:** February 2026
**Parent PRD:** `docs/PRD.md`

## Instructions for the implementing LLM

- Pick the highest-priority issue with status `READY` and work only on that issue
- Mark the issue `IN PROGRESS` when you start, `COMPLETE` when done
- Run `pnpm typecheck` and `pnpm test` before marking complete
- Append a note to `docs/progress.txt` describing what was done
- Make a git commit scoped to that issue only
- If the PRD is fully implemented, output `<promise>COMPLETE</promise>`
- Never work on a `BLOCKED` issue — check its blockers first

---

## Agent Crew

| Name | Role | Model queue | Character |
|---|---|---|---|
| **IRONJAW** | Security Auditor | fast | Paranoid. Finds what's rotten in the hold. |
| **BARNACLE** | Complexity Skeptic | fast | 20-year greybeard. Has seen this pattern sink ships before. |
| **GREENHAND** | Domain Reviewer | fast | Enthusiastic junior. First voyage. Reads code literally. |
| **THE MUTINEER** | Dispute orchestrator | fast | Argues the opposite on principle. Runs in parallel with the human window; independently decides which findings to challenge. |
| Arbitrator | Dispute judge | fast | Neutral. Rules: upheld / overturned. |
| Synthesis | Final verdict | deep | Reconciles everything. |

---

## Issue Tracker

| # | Title | Status | Blocked by |
|---|-------|--------|------------|
| 1 | Infrastructure & Hello World tracer | COMPLETE | — |
| 2 | GitHub PR submission | COMPLETE | - |
| 3 | Parallel specialist agents (streaming) | COMPLETE | — |
| 4 | Parallel challenge phase (Mutineer + human window + arbitration) | COMPLETE | — |
| 5 | Synthesis, verdict, and run history | COMPLETE | — |
| 6 | Educational layer, pirate personas, Continue-As-New, polish | COMPLETE | — |

---

## Issue #1 — Infrastructure & Hello World tracer

**Status: COMPLETE**

### What to build

Scaffold the entire project and verify the end-to-end plumbing with zero AI. By the end of this issue: submitting any string from the browser starts a Temporal workflow, SSE delivers live state to all connected tabs, and the UI shows floor-open → running → complete.

### Package manager

Use **pnpm**. Create `.npmrc` in project root:
```ini
# No shamefully-hoist needed — Temporal SDK v1.12+ supports pnpm natively
```

### Packages to install

```bash
pnpm add next react react-dom typescript @types/node @types/react

# Temporal (all packages MUST be the same version)
pnpm add @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
pnpm add -D @temporalio/testing

# AI SDK v6 (added in Issue #3, listed here for reference)
pnpm add ai@^6.0.0 @ai-sdk/google@^3.0.0 zod

# Persistence
pnpm add better-sqlite3 @types/better-sqlite3

# Styling + DAG visualization
pnpm add tailwindcss @tailwindcss/postcss postcss autoprefixer @xyflow/react

# Dev
pnpm add -D ts-node nodemon
```

### Suggested file structure

```
parley/
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── apps/
│   ├── api/                    # Next.js app
│   │   ├── app/
│   │   │   └── page.tsx        # Main UI (floor-open / running / complete states)
│   │   └── app/api/review/
│   │       ├── start/route.ts  # POST — start workflow
│   │       └── stream/route.ts # GET  — SSE endpoint
│   └── worker/
│       ├── index.ts            # Worker entrypoint
│       ├── workflows/
│       │   └── reviewWorkflow.ts   # Root workflow
│       └── activities/
│           └── mock.ts         # Echo activity (placeholder)
├── lib/
│   ├── temporal.ts             # Shared Temporal client singleton
│   └── db.ts                   # SQLite singleton + schema (active_workflow table)
└── docs/
```

### What to implement

1. `docker-compose.yml` with 6 services on a shared bridge network (`temporal-network`):
   - `postgresql` (image: `postgres:16`, env: `POSTGRES_USER=temporal`, `POSTGRES_PASSWORD=temporal`, healthcheck: `pg_isready`)
   - `temporal-admin-tools` (image: `temporalio/admin-tools:1.29.1-tctl-1.18.4-cli-1.5.0`, depends on postgresql healthy, runs schema setup script then exits via `service_completed_successfully`)
   - `temporal` (image: `temporalio/server:1.29.1`, port 7233, env: `DB=postgres12`, `POSTGRES_SEEDS=postgresql`, depends on admin-tools completed, healthcheck on gRPC port)
   - `temporal-ui` (image: `temporalio/ui:2.34.0`, port 8080, depends on temporal healthy, internal only)
   - `parley-worker` (builds from `apps/worker`, env: `TEMPORAL_ADDRESS=temporal:7233`, depends on temporal healthy)
   - `parley-api` (builds from `apps/api`, port 3000, env: `TEMPORAL_ADDRESS=temporal:7233`, depends on temporal healthy)
2. Worker entrypoint (`apps/worker/index.ts`): create `NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' })`. Create one worker with `Worker.create({ connection, taskQueue: 'review-fast', workflowsPath: require.resolve('./workflows'), activities })`. (Second worker for `review-deep` added in Issue #5.) Call `worker.run()`. Handle `SIGTERM` → `worker.shutdown()`.
3. Root workflow `reviewWorkflow`: accepts `{ input: string }`, runs `echoActivity` via `proxyActivities` (use `import type` for activity types, never actual implementations), waits 2s via `wf.sleep('2s')`, completes. Exposes `getReviewState` query via `wf.defineQuery` + `wf.setHandler` returning `{ status: 'running'|'complete', input: string }`.
4. `lib/db.ts`: SQLite `active_workflow` table with columns `(id INTEGER PRIMARY KEY, workflowId TEXT, startedAt TEXT)`. Single row enforces "one workflow at a time."
5. `POST /api/review/start`: check `active_workflow` is empty → start workflow via Temporal client → insert row → return `{ workflowId }`. If row exists, return `{ error: 'A review is already running' }` with HTTP 409.
6. `GET /api/review/stream`: SSE endpoint. Poll `workflow.query('getReviewState')` every 1s. Write `data: <JSON>\n\n` to response. If no active workflow, emit `data: {"type":"floor-open"}\n\n` and poll DB for a new one. Handle client disconnect.
7. On workflow complete: clear `active_workflow` row. (Detect via query returning `status: 'complete'` in the SSE poll.)
8. UI (`app/page.tsx`): three states driven by SSE events — floor-open (text input + submit button), running (shows input text + "running…"), complete (shows "done"). Use `EventSource` API. All three tabs see the same state.

### Acceptance criteria

- [ ] `docker compose up` starts all services with no manual steps
- [ ] Temporal server health check passes at `localhost:7233`
- [ ] Next.js app loads at `localhost:3000`
- [ ] Submitting text starts a workflow; UI transitions to running within 2 seconds
- [ ] All open browser tabs transition simultaneously via SSE
- [ ] Refreshing mid-workflow reconnects and shows current state immediately
- [ ] Workflow completes; UI transitions to complete
- [ ] A second submit while running returns HTTP 409
- [ ] After complete, floor-open state appears and a new submit is accepted

### User stories addressed

1, 21, 22, 26, 29, 30, 31 (partial)

---

## Issue #2 — GitHub PR submission

**Status: COMPLETE**

### What to build

Replace the placeholder text input with a real GitHub PR URL. The workflow's first activity is `fetchGitHubPRDiff` — deterministic, no LLM — which validates the URL, fetches the diff from GitHub's public API, and enforces the line cap. PR title and repo name appear in the UI once fetched.

### Packages to install

```
# No new packages needed — use built-in fetch
# Add zod for input validation
zod
```

### Suggested file changes

```
apps/worker/activities/fetchGitHubPRDiff.ts   # New activity
apps/worker/workflows/reviewWorkflow.ts       # Accept prUrl input; first step is fetch
apps/api/app/api/review/start/route.ts        # URL validation before starting workflow
apps/api/app/page.tsx                         # Update form: PR URL input + optional context
lib/github.ts                                 # GitHub URL parser + API helpers
```

### What to implement

1. `lib/github.ts`: `parseGitHubPRUrl(url)` — validates URL matches `github.com/{owner}/{repo}/pull/{number}`, returns `{ owner, repo, number }` or throws. `fetchPRFiles(owner, repo, number)` — calls `https://api.github.com/repos/{owner}/{repo}/pulls/{number}/files` and `…/pulls/{number}` (no auth token), returns `{ title, repoName, diff: string, lineCount: number }`.
2. `fetchGitHubPRDiff` activity: calls `lib/github.ts`, validates line count ≤ 500 (throw `ApplicationFailure` with `nonRetryable: true` if exceeded). Retry policy: max 2 attempts, 1s backoff. Returns `{ title, repoName, prNumber, diff, submitterContext: string }`.
3. Root workflow input changes to `{ prUrl: string, context?: string }`. First step: execute `fetchGitHubPRDiff`. Store result in workflow state. `getReviewState` query returns PR metadata.
4. `POST /api/review/start`: validate URL format client-side with `parseGitHubPRUrl` before sending; pass `{ prUrl, context }` to workflow start.
5. UI: replace text input with PR URL field + optional context textarea. Once running, show PR title and repo name in the header.

### Acceptance criteria

- [ ] Valid public GitHub PR URL fetches the diff; UI shows PR title + repo name
- [ ] Invalid URL (not a GitHub PR) returns a validation error without starting a workflow
- [ ] PR diff exceeding 500 lines returns "diff too large" error
- [ ] Private or nonexistent repo returns a clear error
- [ ] Activity retries on transient network errors (verify retry policy config)
- [ ] Context field value is stored in workflow state
- [ ] `fetchGitHubPRDiff` tests pass with fixture diffs (no real GitHub API calls)

### User stories addressed

23, 26, 27, 28, 32

---

## Issue #3 — Parallel specialist agents (streaming)

**Status: COMPLETE**

### What to build

The three Round 1 specialists — IRONJAW, BARNACLE, GREENHAND — running in parallel with Gemini Flash. Each streams tokens back via Temporal heartbeating. The join gate fires when all three complete or individually time out. The UI shows three live DAG nodes with streaming output, retry counters, and color-coded status.

### Packages to install

```bash
# Already installed in Issue #1 — verify these are present:
# ai@^6.0.0  @ai-sdk/google@^3.0.0  zod
```

### Suggested file changes

```
apps/worker/activities/specialists.ts        # runIronjaw, runBarnacle, runGreenhand
apps/worker/workflows/reviewWorkflow.ts      # Parallel dispatch + join gate logic
apps/api/app/page.tsx                        # DAG visualization (3 specialist nodes)
lib/models.ts                                # Model config (fast/deep queues)
```

### What to implement

1. `lib/models.ts`: `import { google } from '@ai-sdk/google'` (reads `GOOGLE_GENERATIVE_AI_API_KEY` env var automatically). Export `geminiFlashLite = google(process.env.GEMINI_FAST_MODEL ?? 'gemini-2.5-flash-lite')` and `geminiPro = google(process.env.GEMINI_DEEP_MODEL ?? 'gemini-2.5-pro')`. Fast-lite is used for all specialist, Mutineer, and Arbitrator activities. Pro is used for Synthesis only.

2. Finding schema (shared):
```ts
const findingSchema = z.object({
  findings: z.array(z.object({
    id: z.string(),  // unique within this specialist's output, e.g. "ironjaw-1"
    severity: z.enum(['critical', 'major', 'minor']),
    description: z.string(),
    lineReference: z.number().optional(),
    recommendation: z.string(),
  }))
});
```

3. Each specialist activity (`runIronjaw`, `runBarnacle`, `runGreenhand`): receives `{ diff: string, context?: string }`. Uses `streamText` from `ai` (returns synchronously — do NOT await). Iterates `result.fullStream`, accumulates `part.text` on each `text-delta` chunk, calls `heartbeat({ partialOutput: accumulated })`. After stream completes, uses `generateText` with `Output.object({ schema: findingSchema })` to extract structured findings. Returns `{ findings, rawText }`. Retry policy via `proxyActivities`: `{ startToCloseTimeout: '45s', heartbeatTimeout: '15s', retry: { maximumAttempts: 3, initialInterval: '2s', backoffCoefficient: 2 } }`.

4. Prompts must produce output in pirate voice (first-person ship's log entries). IRONJAW = paranoid security lens, BARNACLE = greybeard complexity lens, GREENHAND = literal junior correctness lens.

5. Root workflow: use `import type * as activities from '../activities/specialists'` then `proxyActivities<typeof activities>(retryOptions)`. Dispatch `Promise.all([runIronjaw, runBarnacle, runGreenhand])` simultaneously. Each wrapped in `CancellationScope.withTimeout(45_000, () => activity(...))`. On timeout (catch `isCancellation`), mark that slot `{ status: 'timed-out', findings: null }`. Join gate fires after all three resolve (complete or timed-out). Store all findings in workflow state.

6. `getReviewState` query: extend to return per-specialist state `{ status, attemptNumber, partialOutput, findings }`.

7. Worker registration: register all three specialist activities on the `review-fast` task queue.

8. UI: render three parallel nodes in a DAG layout using React Flow (`@xyflow/react`). Custom node components with Tailwind styling (distinct look, not default React Flow). Each node shows: persona name, status color (gray/blue-animated/amber/green/red/muted), attempt `N/3`, streaming tokens from `partialOutput`, final finding summary when complete.

### Acceptance criteria

- [ ] All three specialists start within 500ms of the workflow starting
- [ ] Partial tokens stream to the UI in real time via SSE from heartbeat metadata
- [ ] Each node shows correct attempt count when retrying
- [ ] Rate-limited specialist shows amber state with attempt count
- [ ] Specialist exceeding 45s is marked timed-out; join gate fires when the other two complete
- [ ] Final structured findings displayed per specialist on completion
- [ ] No real Gemini calls in tests (all activities mocked)

### User stories addressed

1, 2, 3

---

## Issue #4 — Parallel challenge phase (Mutineer + human window + arbitration)

**Status: BLOCKED by #3**

### What to build

After the specialist join gate, THE MUTINEER and the human review window start simultaneously. THE MUTINEER is an activity that reads all findings and independently decides which to challenge. The human review window is a 10-minute durable timer with per-finding challenge textboxes. Join Gate 2 waits for both to complete. Then all challenges are merged per finding and one `runArbitrator` activity is dispatched per disputed finding (variable count, all parallel). Two Temporal primitives (Signal + Update) demonstrated during the window.

### Suggested file changes

```
apps/worker/activities/mutineer.ts           # runMutineer
apps/worker/activities/arbitrator.ts         # runArbitrator
apps/worker/workflows/reviewWorkflow.ts      # Parallel dispatch, join gate 2, arbitrator fan-out
apps/api/app/api/review/extend/route.ts      # POST — proxy Signal
apps/api/app/api/review/challenges/route.ts  # POST — proxy Update
apps/api/app/page.tsx                        # Human review panel + Mutineer node + arbitrator nodes
```

### What to implement

1. `runMutineer` activity: receives `{ allFindings: Record<specialistName, Finding[]>, capPerSpecialist: number }`. Prompt: "You are THE MUTINEER. You argue the opposite on principle. Read all findings across the crew. For each specialist that has findings, challenge at least 1. Write a focused opposing argument for each. Cap: at most [cap] per specialist." Must challenge minimum 1 finding per specialist (if that specialist produced findings). Returns `{ challenges: Array<{ findingId: string, specialistName: string, challengeText: string }> }`. Fast queue. Heartbeat with partial output for streaming.

2. Workflow Signal: `extendReviewWindow`. Handler adds 120 seconds to `remainingSeconds`. No validation, no return value.

3. Workflow Update: `submitChallenges`. Validator: throw if `remainingSeconds <= 0`. Handler accepts `{ [findingId: string]: string }` map, stores in workflow state, sets `windowOpen = false`. Returns `{ accepted: true }`.

4. Durable timer: `await wf.sleep('10 minutes')` wrapped with `wf.condition(() => !windowOpen)` — whichever fires first closes the window.

5. Root workflow after Join Gate 1: dispatch both in parallel:
   - `const mutineerResult = executeActivity(runMutineer, { allFindings, capPerSpecialist: 3 })`
   - Human window (timer + signal/update handlers)
   - Join Gate 2: `await Promise.all([mutineerResult, windowClosed])` where `windowClosed` is a `wf.condition(() => !windowOpen)`.

6. After Join Gate 2: merge `mutineerResult.challenges` + `humanChallenges` (from Update state) per finding. For each finding with ≥ 1 challenge, build `{ finding, mutineerChallenge?: string, humanChallenge?: string }`. Dispatch `executeActivity(runArbitrator, mergedInput)` for each, all in parallel.

7. `runArbitrator` activity: receives `{ finding: Finding, mutineerChallenge?: string, humanChallenge?: string }`. Neutral, no persona. Considers all available challenges. Rules upheld or overturned with 2–3 sentence reasoning. Returns `{ ruling: 'upheld'|'overturned', reasoning: string }`. Fast queue. If retries exhausted: returns `{ ruling: 'inconclusive', reasoning: 'Arbitrator unavailable' }`.

8. `getReviewState` query: extend with `{ windowOpen, secondsRemaining, humanChallenges, mutineerStatus, mutineerChallenges, arbitrations: Array<{ findingId, status, ruling?, reasoning? }> }`.

9. `POST /api/review/extend`: `await handle.signal(extendReviewWindow)`. Return HTTP 200.

10. `POST /api/review/challenges`: `await handle.executeUpdate(submitChallenges, { args: [challenges] })`. Return result or error.

11. UI:
    - After Join Gate 1: THE MUTINEER node and Human Review Window appear side by side.
    - Mutineer node shows streaming output while running, "challenged N findings" when done.
    - Human panel shows findings grouped by specialist with per-finding challenge textboxes.
    - Countdown timer + "Extend (+2 min)" + "Submit Challenges" buttons.
    - After Join Gate 2: arbitrator nodes appear (one per disputed finding). Each shows finding summary, challenge source(s), and ruling badge when resolved.

### Acceptance criteria

- [ ] Mutineer starts immediately after Join Gate 1 (not after window closes)
- [ ] Human window opens simultaneously with Mutineer
- [ ] Window timer is 10 minutes
- [ ] "Extend" adds 2 minutes; event stream shows `⚡ Window extended (+2 min)`
- [ ] Submitting challenges returns `{ accepted: true }` during window; rejected after
- [ ] Join Gate 2 waits for BOTH Mutineer done AND window closed
- [ ] Per-finding challenges are merged: a finding can have human only, Mutineer only, or both
- [ ] Arbitrator receives all challenges for a finding and produces one ruling
- [ ] Variable number of arbitrator activities dispatched based on merged challenge count
- [ ] Each ruling surfaces independently as it resolves
- [ ] Arbitrator exhaustion → "inconclusive"; workflow still proceeds
- [ ] Workflow continues automatically if human does nothing (Mutineer + timer expire)
- [ ] All tabs see state updating in sync via SSE
- [ ] No real Gemini calls in tests

### User stories addressed

7, 8, 9, 10, 11, 13, 14, 15, 16

---

## Issue #5 — Synthesis, verdict, and run history

**Status: BLOCKED by #4**

### What to build

After all arbitrators complete, `runSynthesis` (Gemini Pro) reads all specialist findings and all arbitration outcomes and produces a structured verdict. The workflow completes, a history record is written to SQLite, and the floor reopens. The UI shows the final verdict and a history list.

### Suggested file changes

```
apps/worker/activities/synthesis.ts          # runSynthesis
apps/worker/activities/history.ts            # writeHistoryRecord
apps/worker/workflows/reviewWorkflow.ts      # Final synthesis + completion
lib/db.ts                                    # Add reviews table + write record
apps/api/app/api/review/history/route.ts     # GET history list
apps/api/app/api/review/history/[id]/route.ts # GET past review
apps/api/app/page.tsx                        # Verdict panel + history sidebar
```

### What to implement

1. **Second worker**: update `apps/worker/index.ts` to create TWO workers — one for `review-fast` (specialist, mutineer, arbitrator activities) and one for `review-deep` (synthesis activity). Both share the same `NativeConnection`. Run with `Promise.all([fastWorker.run(), deepWorker.run()])`. Register `runSynthesis` only on the deep worker.

2. `runSynthesis` activity: receives `{ specialistOutputs: Record<name, Finding[]|null>, arbitrationOutcomes: Array<{ findingId, challengeSources: string[], ruling, reasoning }> }`. Calls Gemini Pro via `streamText` + heartbeating, then `generateText` with `Output.object()` for structured output. Returns `{ findings: Array<{ severity, specialist, description, ruling, challengeSources, recommendation }>, summary: string }`. Dispatched on `review-deep` task queue via separate `proxyActivities` with `taskQueue: 'review-deep'`.

3. Root workflow after all arbitrators complete: call `await wf.condition(wf.allHandlersFinished)` to ensure all signal/update handlers have completed, then execute `runSynthesis`. On completion:
   - Execute `writeHistoryRecord` activity (not in workflow code directly)
   - Delete `active_workflow` row
   - Set `workflowStatus = 'complete'` in workflow state

4. SQLite `reviews` table: `CREATE TABLE reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, workflowId TEXT, prUrl TEXT, prTitle TEXT, repoName TEXT, startedAt TEXT, completedAt TEXT, specialistOutputs JSON, disputeOutcomes JSON, verdict JSON)`.

5. `GET /api/review/history`: query `reviews` ORDER BY `completedAt DESC`, LIMIT 20, OFFSET from query param. Returns `[{ id, prTitle, repoName, startedAt, completedAt, findingCount }]`.

6. `GET /api/review/history/[id]`: returns full record.

7. UI verdict panel: findings grouped by severity. Each finding shows: specialist persona name, ruling badge (upheld/overturned/inconclusive), challenge source(s) (human / THE MUTINEER / both), recommendation. Download button → export full JSON. History sidebar/modal. Past reviews load same UI in read-only mode.

### Acceptance criteria

- [ ] After all arbitrators resolve, synthesis node activates and streams
- [ ] Final verdict panel shows findings by severity with ruling badges
- [ ] Download button exports complete JSON (all findings + arbitration outcomes + verdict)
- [ ] Floor opens immediately after workflow completion
- [ ] History list shows past reviews reverse-chronologically
- [ ] Past reviews viewable as static read-only UI
- [ ] No history record written if workflow fails mid-run

### User stories addressed

12, 17, 18, 19, 20, 21

---

## Issue #6 — Educational layer, pirate personas, Continue-As-New, polish

**Status: COMPLETE**

### What to build

The layer that transforms a working demo into a pedagogical showcase. Named pirate personas on every agent node. Node "why" drawer explains each Temporal primitive in plain English. Semantic event stream labels everywhere. Continue-As-New for long sessions. Final polish pass.

### What to implement

1. **Agent personas on all nodes**: apply persona name + one-line character description to every agent node. Character descriptions:
   - IRONJAW: "Paranoid. Finds what's rotten in the hold."
   - BARNACLE: "20-year greybeard. Has seen this pattern sink ships before."
   - GREENHAND: "Enthusiastic junior. First voyage. Reads code literally."
   - THE MUTINEER: "Argues the opposite on principle. Decides independently which findings deserve a fight."
   - Show persona name in: arbitrator node labels (which finding is being arbitrated), verdict findings, event stream entries.

2. **Node "why" drawer**: slide-out panel on click. Hand-written copy for each node type:
   - Specialist nodes: what an Activity is, retry policy shown, what happens if this worker crashes right now, why fast queue
   - Signal node: "Fire-and-forget. No validation, no response. Durable: this event is in Temporal history the instant it arrives."
   - Update node: "Validated and synchronous. The workflow checked the review window was still open before accepting."
   - THE MUTINEER node: "Runs in parallel with the human window. Independently decides which findings to challenge — it doesn't fill in for the human, it has its own opinion. Both can challenge the same finding, and the arbitrator sees all challenges together."
   - Arbitrator nodes: "Dispatched dynamically — one per disputed finding. The count isn't known until both the Mutineer and human finish. Flash-Lite is sufficient for a bounded upheld/overturned ruling."
   - Synthesis node: "Reads all findings and all arbitration rulings. Reconciles everything into a structured verdict."

3. **Continue-As-New**: in root workflow, after each major phase completes, check `wf.workflowInfo().historyLength`. If `> 10000`, call `wf.continueAsNew(currentState)`. The new execution receives all accumulated state. UI is unaffected (same workflow ID). Node drawer on the root workflow node explains this.

4. **Polish**: smooth CSS transitions on node state changes (no jarring jumps); streaming text shows blinking cursor while running; countdown timer animates smoothly; arbitrator nodes animate into the DAG as they spawn; verify visual hierarchy (DAG primary, panels secondary, event stream tertiary); ensure all event stream entries use the semantic labels from the PRD.

### Acceptance criteria

- [ ] All agent nodes show persona name + character description
- [ ] Clicking any node opens drawer with plain-English Temporal explanation
- [ ] Signal drawer explains fire-and-forget + durable delivery
- [ ] Update drawer explains validation + synchronous ack
- [ ] THE MUTINEER drawer explains parallel operation with human window
- [ ] Arbitrator drawer explains dynamic dispatch based on merged challenges
- [ ] No raw Temporal event type names anywhere in the event stream
- [ ] Continue-As-New triggers correctly when history exceeds threshold; UI unaffected
- [ ] Node state transitions are animated; arbitrator nodes animate in dynamically

### User stories addressed

4, 5, 6, 24, 25

---

## Fast-Follow: Chaos Mode

**Not part of the initial 6-issue implementation. First feature after v1.**

A Signal-based chaos injection system that lets visitors trigger failures on demand to see Temporal's retry and recovery in action. See PRD "Fast-Follow: Chaos Mode" section for full spec. Implementation:

1. Add `injectChaos` Signal handler to root workflow — sets `chaosTarget` in workflow state
2. Each activity checks for chaos flag and throws retriable `ApplicationFailure` on match
3. Flag auto-clears after one injection (one-shot)
4. UI: toggle button + event stream label `💥 Chaos injected into [Name]`
5. Depends on all 6 core issues being complete
