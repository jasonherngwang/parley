# Parley 🏴‍☠️

Live visualization of a Temporal workflow - Adversarial AI code review by a crew of pirates. I wanted to experiment with durable workflow orchestration involving human intervention.

1. Provide a public GitHub PR URL.

2. Three specialized mates review the diff in parallel:
   - **Ironjaw** — security researcher
   - **Barnacle** — complexity skeptic
   - **Greenhand** — enthusiastic junior

3. Each finding spawns a child workflow. Within each, **parley**:

   3a. **Mutineer** may arrrgue or agree with the finding.

   3b. A 10-minute window is opened for human review input, after which we auto-proceed. The timer can be extended.

   3c. **Arbiter** weighs all challenges (mutineer + human) and produces a final recommendation.

4. Synthesis reconciles everything into an overall assessment with specific action items.

Click **ⓘ** for more info about each node's Temporal settings.

![Input — submit a PR URL to start a review](/screenshots/input.jpg)

![Synthesis — final verdict with per-finding rulings](/screenshots/synthesis.jpg)

## Workflow

Each specialist runs inside a cancellation scope (45 s timeout) and heartbeats on every streamed chunk. The human review window is a durable timer, extendable via signal. Submitting challenges uses an Update handler — a synchronous, validated command that returns a value. Every activity is wrapped in a retry policy with exponential backoff.

```
reviewWorkflow
│
├─ fetchGitHubPRDiff ──────────────────────────── validate URL, fetch diff
│
├─ ┌──────────────┬──────────────┬──────────────┐
│  │  runIronjaw  │ runBarnacle  │ runGreenhand │  parallel, 45 s timeout each
│  └──────┬───────┴──────┬───────┴──────┬───────┘  up to 2 findings each
│         └──────────────▼──────────────┘
│
├─ Spawn N child workflows (one per finding) ──── dynamic fan-out
│  │
│  │  findingWorkflow (child)
│  │  ├─ runMutineerForFinding ──── challenge or concede
│  │  ├─ signal parent with mutineer result (child → parent)
│  │  ├─ await provideHumanInput signal from parent
│  │  ├─ runArbitrator ──────────── if challenged (mutineer or human)
│  │  └─ return result
│  │
│  ├─ Human window (10 min, extendable +2 min) ── runs concurrently in parent
│  ├─ Signal all children with human input ─────── parent → child
│  └─ Await all children ──────────────────────── fan-in via Promise.all
│
└─ runSynthesis
```

### DAG

```
                    [PR Node]
                       │
         ┌─────────────┼─────────────┐
     [Ironjaw]     [Barnacle]    [Greenhand]
      / \            / \              │
   [F1] [F2]     [F3] [F4]         [F5]     ← Finding
    │    │         │    │            │
   [M1] [M2]     [M3] [M4]        [M5]      ← Mutineer
    │    │         │    │            │
   [H1] [H2]     [H3] [H4]  [CTL] [H5]      ← Human review + Control
    │    │         │    │            │
   [A1] [A2]     [A3] [A4]        [A5]      ← Arbiter
     \    \        |    /           /
                   │
              [Synthesis]
```
