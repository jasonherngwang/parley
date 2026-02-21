'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type {
  AppState,
  RunningState,
  CompleteState,
  Specialists,
  SpecialistState,
  ArbitrationState,
  PastReview,
} from './shared';
import { SPECIALISTS } from './shared';

import { PRNode } from './nodes/PRNode';
import { SpecialistNode } from './nodes/SpecialistNode';
import { JoinGateNode } from './nodes/JoinGateNode';
import { MutineerNode } from './nodes/MutineerNode';
import { HumanWindowNode } from './nodes/HumanWindowNode';
import { ArbitratorNode } from './nodes/ArbitratorNode';
import { SynthesisNode } from './nodes/SynthesisNode';

// ── Node types registry ────────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  pr: PRNode as unknown as NodeTypes[string],
  specialist: SpecialistNode as unknown as NodeTypes[string],
  joingate: JoinGateNode as unknown as NodeTypes[string],
  mutineer: MutineerNode as unknown as NodeTypes[string],
  humanwindow: HumanWindowNode as unknown as NodeTypes[string],
  arbitrator: ArbitratorNode as unknown as NodeTypes[string],
  synthesis: SynthesisNode as unknown as NodeTypes[string],
};

// ── Layout constants ───────────────────────────────────────────────────────────

const LEVEL_Y_GAP = 180;
const NODE_X_GAP = 280;
const CENTER_X = 600;

// ── Edge styling helpers ───────────────────────────────────────────────────────

function activeEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#3B82F6', strokeWidth: 2 },
    className: 'edge-glow',
  };
}

function completeEdge(id: string, source: string, target: string, purple?: boolean): Edge {
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: false,
    style: { stroke: purple ? '#A855F7' : '#22C55E', strokeWidth: 1.5 },
  };
}

function inactiveEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#4B5563', strokeWidth: 1 },
  };
}

// ── Build nodes & edges from state ─────────────────────────────────────────────

interface BuildCallbacks {
  onExtend: () => void;
  onSubmitChallenges: (challenges: Record<string, string>) => void;
  challengesSubmitted: boolean;
}

function isSpecialistDone(s: SpecialistState): boolean {
  return s.status === 'complete' || s.status === 'timed-out' || s.status === 'failed';
}

export function buildNodesAndEdges(
  state: AppState,
  callbacks: BuildCallbacks,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (state.type === 'floor-open') {
    return { nodes, edges };
  }

  const s = state as RunningState | CompleteState;
  let currentY = 0;

  // Level 0: PR Node
  nodes.push({
    id: 'pr',
    type: 'pr',
    position: { x: CENTER_X - 192, y: currentY },
    data: {
      title: s.title,
      repoName: s.repoName,
      prNumber: s.prNumber,
      prUrl: s.prUrl,
    },
  });

  if (!s.specialists) return { nodes, edges };

  // Level 1: Specialists
  currentY += LEVEL_Y_GAP;
  const specNames: (keyof Specialists)[] = ['ironjaw', 'barnacle', 'greenhand'];
  for (let i = 0; i < 3; i++) {
    const key = specNames[i];
    const meta = SPECIALISTS[i];
    const specState = s.specialists[key];
    nodes.push({
      id: `specialist-${key}`,
      type: 'specialist',
      position: { x: CENTER_X + (i - 1) * NODE_X_GAP - 112, y: currentY },
      data: {
        name: meta.name,
        character: meta.character,
        state: specState,
      },
    });

    // PR → Specialist edges
    const specDone = isSpecialistDone(specState);
    if (specState.status === 'running') {
      edges.push(activeEdge(`pr-to-${key}`, 'pr', `specialist-${key}`));
    } else if (specDone) {
      edges.push(completeEdge(`pr-to-${key}`, 'pr', `specialist-${key}`));
    } else {
      edges.push(inactiveEdge(`pr-to-${key}`, 'pr', `specialist-${key}`));
    }
  }

  // Level 2: Join Gate 1
  const specDoneCount = specNames.filter((k) => isSpecialistDone(s.specialists![k])).length;
  currentY += LEVEL_Y_GAP * 0.6;
  nodes.push({
    id: 'joingate1',
    type: 'joingate',
    position: { x: CENTER_X - 56, y: currentY },
    data: { done: specDoneCount, total: 3 },
  });

  for (const key of specNames) {
    const specState = s.specialists[key];
    const specDone = isSpecialistDone(specState);
    if (specState.status === 'running') {
      edges.push(activeEdge(`${key}-to-jg1`, `specialist-${key}`, 'joingate1'));
    } else if (specDone) {
      edges.push(completeEdge(`${key}-to-jg1`, `specialist-${key}`, 'joingate1'));
    } else {
      edges.push(inactiveEdge(`${key}-to-jg1`, `specialist-${key}`, 'joingate1'));
    }
  }

  // After Join Gate 1: challenge phase
  const hasChallenge =
    s.windowOpen === true ||
    callbacks.challengesSubmitted ||
    (s.mutineerStatus && s.mutineerStatus !== 'pending') ||
    (s.arbitrations && s.arbitrations.length > 0);

  if (!hasChallenge) {
    // If synthesis is happening without a challenge phase, link directly
    if (s.synthesisStatus && s.synthesisStatus !== 'pending') {
      currentY += LEVEL_Y_GAP;
      addSynthesisNode(nodes, edges, s, currentY);
      // JG1 → Synthesis
      if (s.synthesisStatus === 'running') {
        edges.push(activeEdge('jg1-to-synthesis', 'joingate1', 'synthesis'));
      } else if (s.synthesisStatus === 'complete') {
        edges.push(completeEdge('jg1-to-synthesis', 'joingate1', 'synthesis', true));
      } else {
        edges.push(inactiveEdge('jg1-to-synthesis', 'joingate1', 'synthesis'));
      }
    }
    return { nodes, edges };
  }

  // Level 3: Mutineer (left) + Human Window (right)
  currentY += LEVEL_Y_GAP;
  const mutineerX = CENTER_X - NODE_X_GAP * 0.7 - 128;
  const humanX = CENTER_X + NODE_X_GAP * 0.7 - 160;

  // Mutineer node
  nodes.push({
    id: 'mutineer',
    type: 'mutineer',
    position: { x: mutineerX, y: currentY },
    data: {
      status: s.mutineerStatus ?? 'pending',
      partialOutput: 'mutineerPartialOutput' in s ? (s as RunningState).mutineerPartialOutput : undefined,
      challenges: s.mutineerChallenges ?? [],
    },
  });

  // JG1 → Mutineer edge
  if (s.mutineerStatus === 'running') {
    edges.push(activeEdge('jg1-to-mutineer', 'joingate1', 'mutineer'));
  } else if (s.mutineerStatus === 'complete') {
    edges.push(completeEdge('jg1-to-mutineer', 'joingate1', 'mutineer'));
  } else {
    edges.push(inactiveEdge('jg1-to-mutineer', 'joingate1', 'mutineer'));
  }

  // Human Window node
  const windowClosed = !s.windowOpen && (callbacks.challengesSubmitted || s.secondsRemaining === 0);
  if (s.windowOpen || windowClosed) {
    nodes.push({
      id: 'humanwindow',
      type: 'humanwindow',
      position: { x: humanX, y: currentY },
      data: {
        specialists: s.specialists,
        windowOpen: s.windowOpen ?? false,
        secondsRemaining: s.secondsRemaining ?? 0,
        submitted: callbacks.challengesSubmitted,
        onExtend: callbacks.onExtend,
        onSubmit: callbacks.onSubmitChallenges,
      },
    });

    // JG1 → Human Window edge (static — timer, not activity)
    if (windowClosed) {
      edges.push(completeEdge('jg1-to-human', 'joingate1', 'humanwindow'));
    } else {
      edges.push(inactiveEdge('jg1-to-human', 'joingate1', 'humanwindow'));
    }
  }

  // Level 4: Join Gate 2
  const mutineerDone = s.mutineerStatus === 'complete' || s.mutineerStatus === 'failed';
  const humanDone = windowClosed || callbacks.challengesSubmitted;
  const jg2Done = (mutineerDone ? 1 : 0) + (humanDone ? 1 : 0);
  const jg2Total = nodes.some((n) => n.id === 'humanwindow') ? 2 : 1;

  currentY += LEVEL_Y_GAP * 0.6;
  nodes.push({
    id: 'joingate2',
    type: 'joingate',
    position: { x: CENTER_X - 56, y: currentY },
    data: { done: jg2Done, total: jg2Total },
  });

  // Mutineer → JG2
  if (s.mutineerStatus === 'running') {
    edges.push(activeEdge('mutineer-to-jg2', 'mutineer', 'joingate2'));
  } else if (mutineerDone) {
    edges.push(completeEdge('mutineer-to-jg2', 'mutineer', 'joingate2'));
  } else {
    edges.push(inactiveEdge('mutineer-to-jg2', 'mutineer', 'joingate2'));
  }

  // Human → JG2
  if (nodes.some((n) => n.id === 'humanwindow')) {
    if (humanDone) {
      edges.push(completeEdge('human-to-jg2', 'humanwindow', 'joingate2'));
    } else {
      edges.push(inactiveEdge('human-to-jg2', 'humanwindow', 'joingate2'));
    }
  }

  // Level 5: Arbitrators
  const arbs = s.arbitrations ?? [];
  if (arbs.length > 0) {
    currentY += LEVEL_Y_GAP;
    const arbCount = arbs.length;
    for (let i = 0; i < arbCount; i++) {
      const arb = arbs[i];
      const arbX = CENTER_X + (i - (arbCount - 1) / 2) * NODE_X_GAP - 112;
      nodes.push({
        id: `arb-${arb.findingId}`,
        type: 'arbitrator',
        position: { x: arbX, y: currentY },
        data: {
          arb,
          specialists: s.specialists,
        },
      });

      // JG2 → Arbitrator edges
      if (arb.status === 'running') {
        edges.push(activeEdge(`jg2-to-arb-${arb.findingId}`, 'joingate2', `arb-${arb.findingId}`));
      } else if (arb.status === 'complete') {
        edges.push(completeEdge(`jg2-to-arb-${arb.findingId}`, 'joingate2', `arb-${arb.findingId}`));
      } else {
        edges.push(inactiveEdge(`jg2-to-arb-${arb.findingId}`, 'joingate2', `arb-${arb.findingId}`));
      }
    }
  }

  // Level 6: Synthesis
  if (s.synthesisStatus && s.synthesisStatus !== 'pending') {
    currentY += LEVEL_Y_GAP;
    addSynthesisNode(nodes, edges, s, currentY);

    // Connect arbitrators or JG2 to synthesis
    if (arbs.length > 0) {
      for (const arb of arbs) {
        if (s.synthesisStatus === 'running') {
          edges.push(activeEdge(`arb-${arb.findingId}-to-synth`, `arb-${arb.findingId}`, 'synthesis'));
        } else if (s.synthesisStatus === 'complete') {
          edges.push(completeEdge(`arb-${arb.findingId}-to-synth`, `arb-${arb.findingId}`, 'synthesis', true));
        } else {
          edges.push(inactiveEdge(`arb-${arb.findingId}-to-synth`, `arb-${arb.findingId}`, 'synthesis'));
        }
      }
    } else {
      // No arbitrators — connect JG2 directly
      if (s.synthesisStatus === 'running') {
        edges.push(activeEdge('jg2-to-synthesis', 'joingate2', 'synthesis'));
      } else if (s.synthesisStatus === 'complete') {
        edges.push(completeEdge('jg2-to-synthesis', 'joingate2', 'synthesis', true));
      } else {
        edges.push(inactiveEdge('jg2-to-synthesis', 'joingate2', 'synthesis'));
      }
    }
  }

  return { nodes, edges };
}

function addSynthesisNode(
  nodes: Node[],
  edges: Edge[],
  s: RunningState | CompleteState,
  y: number,
) {
  nodes.push({
    id: 'synthesis',
    type: 'synthesis',
    position: { x: CENTER_X - 210, y },
    data: {
      status: s.synthesisStatus ?? 'pending',
      partialOutput: 'synthesisPartialOutput' in s ? (s as RunningState).synthesisPartialOutput : undefined,
      verdict: s.verdict,
    },
  });
}

// ── Past review → synthetic state ──────────────────────────────────────────────

export function pastReviewToState(review: PastReview): CompleteState {
  return {
    type: 'complete',
    prUrl: review.prUrl,
    title: review.prTitle,
    repoName: review.repoName,
    synthesisStatus: 'complete',
    verdict: review.verdict,
  };
}

// ── FlowCanvas component ──────────────────────────────────────────────────────

interface FlowCanvasProps {
  state: AppState;
  pastReview: PastReview | null;
  onExtend: () => void;
  onSubmitChallenges: (challenges: Record<string, string>) => void;
  challengesSubmitted: boolean;
  onNodeClick: (whyKey: string) => void;
}

// Map node IDs to why drawer keys
function nodeIdToWhyKey(nodeId: string): string {
  if (nodeId === 'pr') return 'pr';
  if (nodeId.startsWith('specialist-')) return nodeId; // specialist-ironjaw etc.
  if (nodeId.startsWith('joingate')) return 'joingate';
  if (nodeId === 'mutineer') return 'mutineer';
  if (nodeId === 'humanwindow') return 'humanwindow';
  if (nodeId.startsWith('arb-')) return 'arbitrator';
  if (nodeId === 'synthesis') return 'synthesis';
  return nodeId;
}

export function FlowCanvas({
  state,
  pastReview,
  onExtend,
  onSubmitChallenges,
  challengesSubmitted,
  onNodeClick,
}: FlowCanvasProps) {
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const userInteracted = useRef(false);
  const prevNodeCount = useRef(0);

  const displayState = pastReview ? pastReviewToState(pastReview) : state;

  const { nodes, edges } = useMemo(
    () =>
      buildNodesAndEdges(displayState, {
        onExtend,
        onSubmitChallenges,
        challengesSubmitted: pastReview ? true : challengesSubmitted,
      }),
    [displayState, onExtend, onSubmitChallenges, challengesSubmitted, pastReview],
  );

  // Auto-fit when new node levels appear
  useEffect(() => {
    if (!rfInstance || userInteracted.current) return;
    if (nodes.length !== prevNodeCount.current) {
      prevNodeCount.current = nodes.length;
      const timer = setTimeout(() => {
        rfInstance.fitView({ duration: 600, padding: 0.3 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, rfInstance]);

  // Reset interaction flag on new review
  useEffect(() => {
    if (state.type === 'floor-open') {
      userInteracted.current = false;
      prevNodeCount.current = 0;
    }
  }, [state.type]);

  const handleMoveStart = useCallback(() => {
    userInteracted.current = true;
  }, []);

  const handleRecenter = useCallback(() => {
    userInteracted.current = false;
    rfInstance?.fitView({ duration: 600, padding: 0.3 });
  }, [rfInstance]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const whyKey = nodeIdToWhyKey(node.id);
      onNodeClick(whyKey);
    },
    [onNodeClick],
  );

  return (
    <div className="w-screen h-screen">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setRfInstance}
        onMoveStart={handleMoveStart}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3, duration: 600 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        noDragClassName="noDrag"
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="#1F2937" gap={20} size={1} />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'joingate') return '#6B7280';
            if (node.type === 'synthesis') return '#A855F7';
            return '#3B82F6';
          }}
          maskColor="rgba(0,0,0,0.7)"
          style={{ background: '#111827' }}
          pannable
          zoomable
        />
        <Controls showInteractive={false}>
          <button
            onClick={handleRecenter}
            className="react-flow__controls-button"
            title="Re-center"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
            </svg>
          </button>
        </Controls>
      </ReactFlow>
    </div>
  );
}
