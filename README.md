# Parrrley

Live visualization of a Temporal workflow - Adversarial AI code review by a crew of pirates

1. Submit a public GitHub PR URL.
2. Three specialized mates review the diff in parallel:
   - **Ironjaw** — security researcher
   - **Barnacle** — complexity skeptic
   - **Greenhand** — enthusiastic junior
3. Each finding spawns a child workflow. Inside it, **the Mutineer** decides whether to arrrgue with the finding.
4. A 10-minute human window opens. You can challenge any finding via per-finding text inputs.
5. Each child's **Arbiter** weighs all challenges (mutineer + human) and produces a final recommendation.
6. Synthesis reconciles everything into an overall assessment with specific action items.

Click **ⓘ** for more info about each node.

## Workflow

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

Each specialist runs inside a cancellation scope (45 s timeout) and heartbeats on every streamed chunk. The human review window is a durable timer, extendable via signal. Submitting challenges uses an Update handler — a synchronous, validated command that returns a value. Every activity is wrapped in a retry policy with exponential backoff.
