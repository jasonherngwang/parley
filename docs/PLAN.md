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
| 7 | Full-page interactive DAG | COMPLETE | — |

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

**Status: COMPLETE**

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

**Status: COMPLETE**

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

## Issue #7 — Full-page interactive DAG

**Status: COMPLETE**

### What to build

Replace the current vertical-scroll layout with a full-viewport ReactFlow canvas where every stage of the review pipeline is a draggable, clickable node connected by animated edges. The entire review workflow plays out as a living, growing graph — nodes materialize and wire themselves to predecessors as each stage unlocks. The user can pan, zoom, and drag nodes freely. The graph is the UI.

The visual design must make two things obvious at a glance: (1) this is a **dynamic DAG** — nodes appear at runtime, the arbitrator fan-out count is unknown until challenges are merged, and the graph grows downward as the pipeline progresses; (2) a **durable workflow orchestrator** is doing real work — every node wears a Temporal primitive badge (Activity, Timer, Signal, Update), retries are visible, join gates show synchronization, and the whole graph reconstructs from persisted state on page refresh.

No backend changes. The SSE data shape, API routes, and workflow code are untouched. This is a pure frontend refactor.

### Design principles

1. **The graph IS the interface.** No scrolling column of panels. Every piece of review state lives inside a ReactFlow node on a full-viewport canvas. Floating overlays only for things that don't belong in the graph (submission form, event log, history modal, why drawer).
2. **Progressive materialization.** Nodes don't pre-exist. They fade in (with `animate-fade-in-up`) as their stage activates. Edges animate in when source and target both exist. The canvas starts empty and grows.
3. **Temporal primitives are visible.** Every node has a small badge/pill in its header showing the Temporal primitive it represents: `Activity`, `Timer`, `Signal`, `Update`. Color-coded. This teaches the viewer that every box maps to a real Temporal concept.
4. **Data flow is animated.** Edges pulse/animate while data flows between nodes (specialist streaming, mutineer running). Edges settle to solid green on completion, solid red on failure.
5. **The camera follows the action.** When a new level of nodes appears, `fitView` smoothly transitions to include them. The user can freely pan/zoom after, and a "re-center" button resets the view.
6. **Interactive elements work inside nodes.** The Human Window node contains textareas and buttons. Use `noDragClassName` on all interactive elements so they don't trigger node dragging.

### Packages

No new packages needed. `@xyflow/react@^12` already provides `ReactFlow`, `MiniMap`, `Controls`, `Background`, `Handle`, custom node/edge support, `useNodesState`, `useEdgesState`, `fitView`, animated edges, and `smoothstep` edge type.

### Suggested file changes

Split the 1700-line `page.tsx` monolith into focused modules:

```
apps/api/app/
├── page.tsx                         # Slim shell: SSE + state + mounts FlowCanvas + overlays
├── globals.css                      # Add edge glow keyframes + node entrance animations
├── components/
│   ├── FlowCanvas.tsx               # Full-viewport ReactFlow + buildNodesAndEdges()
│   ├── nodes/
│   │   ├── PRNode.tsx               # PR metadata (title, repo, number)
│   │   ├── SpecialistNode.tsx       # Existing specialist node (extracted, badge added)
│   │   ├── JoinGateNode.tsx         # Small diamond/pill showing "N/M done"
│   │   ├── MutineerNode.tsx         # Mutineer streaming + challenge count
│   │   ├── HumanWindowNode.tsx      # Timer + per-finding textareas + extend/submit buttons
│   │   ├── ArbitratorNode.tsx       # Per-finding ruling (upheld/overturned badge)
│   │   └── SynthesisNode.tsx        # Final verdict + finding summary
│   ├── overlays/
│   │   ├── SubmissionCard.tsx       # Floating PR URL form (floor-open state)
│   │   ├── EventLog.tsx             # Collapsible floating terminal, bottom-left
│   │   ├── WhyDrawer.tsx            # Slide-in panel (existing, extracted)
│   │   └── HistoryModal.tsx         # History list modal (existing, extracted)
│   └── shared.tsx                   # statusColor, statusDot, badges, severity helpers
```

### Node types

Every custom node component receives its data via ReactFlow's `{ data }` prop. All nodes follow the same visual pattern: rounded-xl card, 2px border colored by status, dark `bg-gray-900` fill, Temporal primitive badge in the header.

#### 1. PRNode
- **Appears:** immediately when review starts (before diff is fetched)
- **Shows:** PR URL (while fetching), then repo name + PR number + title
- **Badge:** none (this is workflow input, not a primitive)
- **Size:** ~400px wide, single row of metadata
- **Handles:** one source handle at bottom-center

#### 2. SpecialistNode (existing, extracted + enhanced)
- **Appears:** when specialist status transitions from undefined to `pending` or `running`
- **Shows:** persona name (IRONJAW/BARNACLE/GREENHAND), character tagline, status dot, attempt counter, streaming partial output while running, severity-grouped finding summary when complete
- **Badge:** `Activity` (blue pill)
- **Size:** ~250px wide
- **Handles:** target at top, source at bottom
- **Retry visual:** when `attemptNumber > 1`, the attempt counter pulses amber and the border briefly flashes amber before returning to the running blue

#### 3. JoinGateNode
- **Appears:** immediately alongside the nodes it gates (Join Gate 1 appears with specialists, Join Gate 2 appears with challenge phase)
- **Shows:** small rounded-pill, ~120px wide. Label: "Join Gate". Progress: `2/3 done` updating live. When all inputs are complete, border turns green and label changes to a checkmark
- **Badge:** none (this is workflow logic, not a single primitive)
- **Size:** small — ~120×40px
- **Handles:** target at top, source at bottom
- **Visual:** starts with dashed gray border. Each completed input fills a progress segment. When full, border goes solid green with a brief glow animation

#### 4. MutineerNode
- **Appears:** when `mutineerStatus` transitions to `running` (after Join Gate 1)
- **Shows:** persona name, character tagline, streaming partial output, final "challenged N findings" summary
- **Badge:** `Activity` (blue pill)
- **Size:** ~280px wide
- **Handles:** target at top, source at bottom

#### 5. HumanWindowNode
- **Appears:** when `windowOpen` becomes `true`
- **Shows:** countdown timer (large, prominent, labeled "Durable Timer"), per-finding challenge textareas (scrollable, max-height ~200px), "Extend +2 min" button with Signal badge, "Submit Challenges" button with Update badge
- **Badge:** `Timer` (teal pill) on the node header. The Extend button has a small `Signal` label. The Submit button has a small `Update` label. This node demonstrates three Temporal primitives in one place
- **Size:** ~350px wide (widest node — needs room for textareas)
- **Handles:** target at top, source at bottom
- **Interactive elements:** all buttons and textareas get `className="noDrag"` (ReactFlow's built-in class to prevent drag on interactive children). Alternatively, use `noDragClassName="noDrag"` on the ReactFlow component and apply `"noDrag"` to interactive wrappers
- **After submission or expiry:** textareas become disabled, timer shows "Submitted" or "Expired", node border dims

#### 6. ArbitratorNode
- **Appears:** dynamically after Join Gate 2 — one per disputed finding. Count is unknown until challenges are merged. Nodes fade in one by one (staggered 100ms delay per node for visual effect)
- **Shows:** finding ID + specialist name, challenge source badges (MUTINEER / Human / both), ruling badge when complete (upheld=red, overturned=green, inconclusive=gray), 2-3 sentence reasoning
- **Badge:** `Activity` (blue pill)
- **Size:** ~250px wide
- **Handles:** target at top, source at bottom
- **Dynamic fan-out is the key visual:** the graph visibly widens at this level based on how many findings were challenged. If 1 finding was challenged, there's 1 arbitrator. If 6 were challenged, 6 nodes fan out. This makes the dynamic dispatch obvious

#### 7. SynthesisNode
- **Appears:** when `synthesisStatus` transitions to `running`
- **Shows:** streaming partial output, then the full verdict: findings grouped by severity, each with specialist name + ruling badge + challenge source badges + recommendation. Summary quote with purple left-border
- **Badge:** `Activity · deep queue` (purple pill — distinct from the blue fast-queue pills)
- **Size:** ~450px wide (widest — verdict has rich content)
- **Handles:** target at top, no source handle (terminal node)
- **On complete:** border turns purple. The entire graph's edges settle to their final colors. A subtle "Review Complete" floating badge appears

### Edge behavior

Use `smoothstep` edge type (right-angle paths with rounded corners — clean for vertical DAG layout).

| Source → Target | When shown | Active style | Complete style |
|---|---|---|---|
| PR → each Specialist | When specialist nodes appear | Animated dashes, blue, 2px, CSS `drop-shadow(0 0 4px #3B82F6)` | Solid green, 1.5px |
| each Specialist → Join Gate 1 | When specialist node exists | Animated while specialist is running | Solid green when specialist complete |
| Join Gate 1 → Mutineer | When mutineer appears | Animated while mutineer running | Solid green |
| Join Gate 1 → Human Window | When human window appears | Static (timer, not activity) | Solid green |
| Mutineer → Join Gate 2 | When JG2 appears | Animated while mutineer running | Solid green |
| Human Window → Join Gate 2 | When JG2 appears | Static | Solid green when submitted/expired |
| Join Gate 2 → each Arbitrator | When arbitrator appears | Animated while arbitrating | Solid green |
| each Arbitrator → Synthesis | When synthesis appears | Animated while synthesizing | Solid purple |
| Specialists → Synthesis (direct) | If NO challenges were filed | Skip JG2 + arbitrators entirely | Solid purple |

Default inactive edge: `stroke: #4B5563` (gray-600), 1px, no animation.

### Layout algorithm

Manual level-based positioning. No dagre dependency — the pipeline shape is predictable.

```ts
const LEVEL_Y_GAP = 180;   // vertical distance between levels
const NODE_X_GAP = 280;    // horizontal gap between sibling nodes

function computeLayout(state: AppState): { nodes: Node[], edges: Edge[] } {
  // Center X for the canvas (e.g., 600)
  const centerX = 600;
  let currentY = 0;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Level 0: PR Node (always present when running)
  // Place at (centerX - halfWidth, currentY)

  // Level 1: Specialists (3 nodes centered)
  // x = centerX + (i - 1) * NODE_X_GAP  for i in [0,1,2]
  currentY += LEVEL_Y_GAP;

  // Level 2: Join Gate 1
  currentY += LEVEL_Y_GAP * 0.6;  // tighter spacing for small gate node

  // Level 3: Mutineer (left) + Human Window (right)
  currentY += LEVEL_Y_GAP;
  // mutineer: centerX - NODE_X_GAP * 0.7
  // human:    centerX + NODE_X_GAP * 0.7

  // Level 4: Join Gate 2
  currentY += LEVEL_Y_GAP * 0.6;

  // Level 5: Arbitrators (N nodes, centered)
  // x = centerX + (i - (N-1)/2) * NODE_X_GAP  for i in [0..N-1]
  currentY += LEVEL_Y_GAP;

  // Level 6: Synthesis
  currentY += LEVEL_Y_GAP;

  return { nodes, edges };
}
```

Nodes are only added to the array when their stage is active. The function derives the complete node/edge list from `AppState` on every SSE tick.

### Camera behavior

- **Initial (floor-open):** empty canvas with subtle grid, submission card floating in center
- **Review starts:** submission card animates out, PR node fades in, `fitView({ duration: 600, padding: 0.4 })`
- **New level appears:** call `fitView({ duration: 600, padding: 0.3 })` after a short delay (100ms) to let the new nodes render
- **User pans/zooms:** respect their position — stop auto-fitting. Set a `userHasInteracted` flag on `onMoveStart`. Clear it when a new review starts
- **Re-center button:** in the floating controls, resets `userHasInteracted` and calls `fitView`
- **Past review loaded:** render full completed graph, then `fitView`

### Floating overlays (positioned with CSS `fixed`, not inside ReactFlow)

1. **SubmissionCard** — centered on screen when floor is open. `bg-gray-900/95 backdrop-blur` with border. Contains PR URL input, context textarea, submit button. Animates out (fade + scale) when review starts. A small "New Review" button appears in the top-left corner when a review completes and the floor reopens
2. **EventLog** — fixed bottom-left, ~320px wide, max-height ~200px. Collapsible (click to toggle). Semi-transparent background. Shows the semantic event stream entries. Same content as current EventLog component
3. **WhyDrawer** — existing slide-in panel, fixed right side. Opens when any node is clicked. Shows the Temporal primitive explanation for that node type. Unchanged behavior, just extracted to its own file
4. **HistoryModal** — existing modal. Unchanged behavior, extracted to its own file
5. **Header bar** — fixed top, full width, slim. "PARLEY" title left-aligned, History button right-aligned. Semi-transparent `bg-gray-950/80 backdrop-blur`
6. **ReactFlow Controls** — use `<Controls />` from xyflow, positioned bottom-right. Zoom in/out/fit buttons. Add a custom "re-center" button that calls `fitView`
7. **ReactFlow MiniMap** — `<MiniMap />` from xyflow, positioned bottom-right above Controls. Shows node positions in miniature. Use dark theme colors: `nodeColor` based on node status, `maskColor` translucent dark

### Past reviews on the canvas

When a past review is loaded from history, render the full graph in completed state — all nodes present, all edges solid green/purple, all findings/rulings visible. Read-only mode: Human Window node shows "Submitted" or "Expired" with no interactive elements. The user can pan/zoom/drag to explore the historical review. A floating "Close" button dismisses the past review and returns to floor-open.

### What to implement

1. **Extract components from `page.tsx`:** move WhyDrawer, EventLog, HistoryModal, PastReviewPanel, severity helpers, and status utilities into their own files under `components/`. This is pure extraction with no behavior changes — do it first to make the refactor manageable.

2. **Create node components:** build PRNode, SpecialistNode (enhance existing), JoinGateNode, MutineerNode, HumanWindowNode, ArbitratorNode, SynthesisNode. Each is a React component accepting `{ data }` from ReactFlow. Each renders a card with the Temporal primitive badge in its header. Register all in a `nodeTypes` object.

3. **Temporal primitive badges:** small pill/tag in each node's header row. Render with: `<span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">Activity</span>`. Color scheme: Activity (fast) = `bg-blue-900 text-blue-300 border-blue-700`, Activity (deep) = `bg-purple-900 text-purple-300 border-purple-700`, Timer = `bg-teal-900 text-teal-300 border-teal-700`, Signal = `bg-amber-900 text-amber-300 border-amber-700`, Update = `bg-violet-900 text-violet-300 border-violet-700`.

4. **Build `FlowCanvas.tsx`:** the core component. Full-viewport `<ReactFlow>` with:
   - `nodeTypes` registering all 7 custom nodes
   - `edgeType="smoothstep"` default
   - `nodesDraggable={true}`, `nodesConnectable={false}`, `elementsSelectable={true}`
   - `panOnDrag={true}`, `zoomOnScroll={true}`, `zoomOnPinch={true}`
   - `fitView`, `fitViewOptions={{ padding: 0.3, duration: 600 }}`
   - `proOptions={{ hideAttribution: true }}`
   - `<Background variant="dots" color="#1F2937" gap={20} size={1} />` — subtle dot grid
   - `<MiniMap />` with dark theme
   - `<Controls />` with custom re-center button
   - `onNodeClick` handler → opens WhyDrawer for the clicked node type
   - `noDragClassName="noDrag"` so interactive elements inside nodes work

5. **Build `buildNodesAndEdges(state, callbacks)` function:** pure function that takes `AppState` and callback props (onExtend, onSubmit, etc.), returns `{ nodes: Node[], edges: Edge[] }`. Implements the level-based layout algorithm. Only creates nodes for active stages. Computes edge styling based on source/target node status. This function is called on every state change.

6. **Wire up `page.tsx`:** slim shell that:
   - Manages SSE connection (existing logic)
   - Manages `AppState` (existing logic)
   - Manages overlay state (selectedWhy, showHistory, pastReview, challengesSubmitted)
   - Renders: `<FlowCanvas>` as full viewport background, floating overlays on top
   - Passes event handlers (handleExtend, handleSubmitChallenges, etc.) through node data

7. **Add CSS animations to `globals.css`:**
   - `@keyframes edgeGlow` — pulsing `filter: drop-shadow` for active edges
   - `@keyframes gateUnlock` — brief green glow burst when join gate completes
   - `@keyframes nodeEntrance` — scale(0.95) + opacity(0) → scale(1) + opacity(1), 400ms
   - Extend existing `animate-fade-in-up` for staggered arbitrator entrance

8. **Handle interactive Human Window node:** the HumanWindowNode component receives callbacks via `data` prop: `data.onExtend`, `data.onSubmit`, `data.specialists`, `data.windowOpen`, `data.secondsRemaining`, `data.submitted`. All buttons and textareas wrapped in `<div className="noDrag">`. Local countdown state (tick every 1s) kept inside the node component.

9. **Past review rendering:** when `pastReview` is set, pass it through `buildNodesAndEdges` as a synthetic `CompleteState`. All nodes render in their completed visual state. HumanWindowNode renders read-only (disabled textareas, no buttons). A floating "Close Past Review" button dismisses it.

10. **fitView orchestration:** track `userHasInteracted` via `onMoveStart` callback. On state changes that add new node levels, call `reactFlowInstance.fitView()` only if `!userHasInteracted`. Provide a "re-center" button in the Controls that resets the flag and calls `fitView`.

### Acceptance criteria

- [x] ReactFlow canvas fills the full browser viewport (`100vw × 100vh`)
- [x] All nodes are draggable; canvas supports pan (drag background) and zoom (scroll/pinch)
- [x] Floor-open state: empty canvas with floating submission card centered
- [x] Review starts: PR node appears, specialists fade in below with edges from PR node
- [x] Specialist nodes show `Activity` badge, streaming output, retry counter, findings on complete
- [x] Join Gate 1 shows progress (`2/3`, `3/3`) and visually unlocks when all specialists finish
- [x] Mutineer and Human Window nodes appear side-by-side below Join Gate 1
- [x] Human Window node has working textareas, countdown timer, Extend (Signal badge) and Submit (Update badge) buttons — all functional within the canvas
- [x] Edges animate (dashed + glow) while data is flowing; settle to solid green on complete
- [x] Arbitrator nodes fan out dynamically — count matches disputed findings
- [x] Synthesis node appears at bottom with `Activity · deep queue` purple badge
- [x] Clicking any node opens the Why drawer with Temporal primitive explanation
- [x] MiniMap visible in corner for orientation
- [x] Controls (zoom in/out/fit/re-center) visible
- [x] Camera auto-fits to include new nodes as stages unlock (unless user has manually panned)
- [x] Page refresh mid-review reconstructs the full graph from SSE state
- [x] Past reviews render as a complete read-only graph on the canvas
- [x] Event log floats in bottom-left corner, collapsible
- [x] No backend changes — SSE data shape, API routes, and workflow code are untouched
- [x] `pnpm typecheck` passes

---

## Fast-Follow: Chaos Mode

**Not part of the initial 6-issue implementation. First feature after v1.**

A Signal-based chaos injection system that lets visitors trigger failures on demand to see Temporal's retry and recovery in action. See PRD "Fast-Follow: Chaos Mode" section for full spec. Implementation:

1. Add `injectChaos` Signal handler to root workflow — sets `chaosTarget` in workflow state
2. Each activity checks for chaos flag and throws retriable `ApplicationFailure` on match
3. Flag auto-clears after one injection (one-shot)
4. UI: toggle button + event stream label `💥 Chaos injected into [Name]`
5. Depends on all 6 core issues being complete
