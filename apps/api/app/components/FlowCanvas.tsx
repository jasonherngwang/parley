'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type {
  AppState,
  RunningState,
  CompleteState,
  Specialists,
  SpecialistState,
  FindingLifecycle,
  PastReview,
} from './shared';
import { SPECIALISTS } from './shared';

import { PRNode } from './nodes/PRNode';
import { SpecialistNode } from './nodes/SpecialistNode';
import { FindingNode } from './nodes/FindingNode';
import { MutineerNode } from './nodes/MutineerNode';
import { HumanReviewNode } from './nodes/HumanReviewNode';
import { ControlNode } from './nodes/ControlNode';
import { ArbiterNode } from './nodes/ArbiterNode';
import { SynthesisNode } from './nodes/SynthesisNode';
import { GhostNode } from './nodes/GhostNode';

// ── Node types registry ────────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  pr: PRNode as unknown as NodeTypes[string],
  specialist: SpecialistNode as unknown as NodeTypes[string],
  finding: FindingNode as unknown as NodeTypes[string],
  mutineer: MutineerNode as unknown as NodeTypes[string],
  humanreview: HumanReviewNode as unknown as NodeTypes[string],
  control: ControlNode as unknown as NodeTypes[string],
  arbiter: ArbiterNode as unknown as NodeTypes[string],
  synthesis: SynthesisNode as unknown as NodeTypes[string],
  ghost: GhostNode as unknown as NodeTypes[string],
};

// ── Layout constants ───────────────────────────────────────────────────────────

const GAP_PR_TO_SPEC = 500;
const GAP_SPEC_TO_FINDINGS = 320;
const GAP_FINDING_TO_MUTINEER = 360;
const GAP_MUTINEER_TO_HUMAN = 460;
const GAP_HUMAN_TO_ARBITER = 240;
const GAP_ARBITER_TO_SYNTH = 680;

const COLUMN_WIDTH = 280;
const COLUMN_GAP = 40;
const SPECIALIST_GROUP_GAP = 80;
const SPEC_X_GAP = 380;

const CENTER_X = 600;

// Half-widths for centering
const HALF_PR = 240;
const HALF_SPEC = 160;
const HALF_COL = COLUMN_WIDTH / 2; // 140
const HALF_CONTROL = 150;
const HALF_SYNTH = 360;

// ── Edge styling helpers ───────────────────────────────────────────────────────

function activeEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    type: 'default',
    animated: true,
    style: { stroke: '#C8902A', strokeWidth: 1.5 },
    className: 'edge-glow',
  };
}

function completeEdge(id: string, source: string, target: string, _purple?: boolean): Edge {
  return {
    id,
    source,
    target,
    type: 'default',
    animated: false,
    style: { stroke: '#4A8A68', strokeWidth: 1 },
  };
}

function inactiveEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    type: 'default',
    animated: false,
    style: { stroke: '#2A2015', strokeWidth: 1, strokeDasharray: '6 4' },
  };
}

// ── Nautical chart decorative elements ────────────────────────────────────────

function CompassRose() {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <svg
        width="400"
        height="400"
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        opacity="0.07"
      >
        {/* Cardinal points N/S/E/W — large diamonds */}
        <polygon points="200,10 216,178 200,160 184,178" fill="#C8902A" />
        <polygon points="200,390 216,222 200,240 184,222" fill="#C8902A" />
        <polygon points="390,200 222,216 240,200 222,184" fill="#C8902A" />
        <polygon points="10,200 178,216 160,200 178,184" fill="#C8902A" />
        {/* Intercardinal points NE/SE/SW/NW — shorter */}
        <polygon points="330,70 212,190 204,202 216,190" fill="#C8902A" opacity="0.75" />
        <polygon points="330,330 212,210 204,198 216,210" fill="#C8902A" opacity="0.75" />
        <polygon points="70,330 188,210 196,198 184,210" fill="#C8902A" opacity="0.75" />
        <polygon points="70,70 188,190 196,202 184,190" fill="#C8902A" opacity="0.75" />
        {/* Outer ring */}
        <circle cx="200" cy="200" r="188" stroke="#C8902A" strokeWidth="1.5" />
        {/* Inner ring */}
        <circle cx="200" cy="200" r="150" stroke="#C8902A" strokeWidth="0.8" />
        {/* Center medallion */}
        <circle cx="200" cy="200" r="20" stroke="#C8902A" strokeWidth="2" />
        <circle cx="200" cy="200" r="6" fill="#C8902A" />
        {/* N label */}
        <text x="200" y="8" textAnchor="middle" fontSize="18" fontWeight="700" fill="#C8902A" fontFamily="serif">N</text>
      </svg>
    </div>
  );
}


// ── Build nodes & edges from state ─────────────────────────────────────────────

interface BuildCallbacks {
  onSubmit: (prUrl: string, context?: string) => Promise<string | null>;
  onCancel: () => void;
  onExtend: () => void;
  onSubmitChallenges: (challenges: Record<string, string>) => void;
  challengesSubmitted: boolean;
  onInfoClick: (whyKey: string) => void;
  challenges: Record<string, string>;
  onChallengeChange: (findingId: string, text: string) => void;
}

function isSpecialistDone(s: SpecialistState): boolean {
  return s.status === 'complete' || s.status === 'failed';
}

// ── Ghost node helper ──────────────────────────────────────────────────────────

function ghostNode(
  id: string,
  x: number,
  y: number,
  label: string,
  sublabel?: string,
  metaKey?: string,
  nodeWidth?: number,
  onInfoClick?: () => void,
): Node {
  return {
    id,
    type: 'ghost',
    position: { x, y },
    data: { label, sublabel, metaKey, nodeWidth, onInfoClick },
  };
}

// ── Column layout computation ──────────────────────────────────────────────────

interface ColumnLayout {
  findingId: string;
  specialist: string;
  x: number; // center x of this column
}

/**
 * Compute X positions for finding columns, grouped by specialist with extra
 * spacing between groups. Returns center-X for each column.
 */
function computeColumnPositions(
  findings: FindingLifecycle[],
  centerX: number,
): ColumnLayout[] {
  if (findings.length === 0) return [];

  // Group findings by specialist, preserving order
  const specOrder = ['ironjaw', 'barnacle', 'greenhand'];
  const groups: Array<{ specialist: string; findings: FindingLifecycle[] }> = [];
  for (const spec of specOrder) {
    const specFindings = findings.filter((f) => f.specialist === spec);
    if (specFindings.length > 0) {
      groups.push({ specialist: spec, findings: specFindings });
    }
  }

  // Compute total width
  const totalColumns = findings.length;
  const totalGroupGaps = (groups.length - 1) * SPECIALIST_GROUP_GAP;
  const totalColumnGaps = groups.reduce(
    (acc, g) => acc + Math.max(0, g.findings.length - 1) * COLUMN_GAP,
    0,
  );
  const totalWidth =
    totalColumns * COLUMN_WIDTH + totalColumnGaps + totalGroupGaps;

  // Starting x (left edge)
  let currentX = centerX - totalWidth / 2 + HALF_COL;

  const result: ColumnLayout[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    for (let fi = 0; fi < group.findings.length; fi++) {
      result.push({
        findingId: group.findings[fi].findingId,
        specialist: group.specialist,
        x: currentX,
      });
      if (fi < group.findings.length - 1) {
        currentX += COLUMN_WIDTH + COLUMN_GAP;
      }
    }
    if (gi < groups.length - 1) {
      currentX += COLUMN_WIDTH + SPECIALIST_GROUP_GAP;
    }
  }

  return result;
}

/**
 * Compute center-X for each specialist, based on the average position of its
 * finding columns. Falls back to default spacing if no findings exist yet.
 */
function computeSpecialistPositions(
  columns: ColumnLayout[],
  centerX: number,
): Record<string, number> {
  const specOrder: (keyof Specialists)[] = ['ironjaw', 'barnacle', 'greenhand'];
  const result: Record<string, number> = {};

  if (columns.length === 0) {
    // Default: evenly spaced
    for (let i = 0; i < 3; i++) {
      result[specOrder[i]] = centerX + (i - 1) * SPEC_X_GAP;
    }
    return result;
  }

  for (const spec of specOrder) {
    const specCols = columns.filter((c) => c.specialist === spec);
    if (specCols.length > 0) {
      const avg = specCols.reduce((sum, c) => sum + c.x, 0) / specCols.length;
      result[spec] = avg;
    } else {
      // Specialist with no findings — position based on default
      const idx = specOrder.indexOf(spec);
      result[spec] = centerX + (idx - 1) * SPEC_X_GAP;
    }
  }

  return result;
}

// ── Main build function ────────────────────────────────────────────────────────

export function buildNodesAndEdges(
  state: AppState,
  callbacks: BuildCallbacks,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Layout Y positions
  const prY = 0;
  const specY = prY + GAP_PR_TO_SPEC;

  // Level 0: PR Node (always visible)
  if (state.type === 'floor-open') {
    nodes.push({
      id: 'pr',
      type: 'pr',
      position: { x: CENTER_X - HALF_PR, y: prY },
      data: {
        stateType: 'floor-open',
        onSubmit: callbacks.onSubmit,
      },
    });
    return { nodes, edges };
  }

  const { onInfoClick } = callbacks;
  const s = state as RunningState | CompleteState;

  nodes.push({
    id: 'pr',
    type: 'pr',
    position: { x: CENTER_X - HALF_PR, y: prY },
    data: {
      stateType: s.type,
      title: s.title,
      repoName: s.repoName,
      prNumber: s.prNumber,
      prUrl: s.prUrl,
      fetchError: s.fetchError,
      onSubmit: callbacks.onSubmit,
      onCancel: callbacks.onCancel,
      onInfoClick: () => onInfoClick('pr'),
    },
  });

  const hasSpecialists = !!s.specialists;
  const specNames: (keyof Specialists)[] = ['ironjaw', 'barnacle', 'greenhand'];
  const findings = s.findings ?? [];
  const hasFindings = findings.length > 0;
  const allFindingsDone = hasFindings && findings.every(
    (f) => f.childStatus === 'complete' || f.childStatus === 'failed',
  );

  const hasWindow =
    s.windowOpen === true ||
    callbacks.challengesSubmitted ||
    hasFindings;

  const hasSynthesis = s.synthesisStatus && s.synthesisStatus !== 'pending';

  // Compute column positions from findings
  const columns = computeColumnPositions(findings, CENTER_X);
  const specPositions = computeSpecialistPositions(columns, CENTER_X);

  // Dynamic Y positions
  const findingsY = specY + GAP_SPEC_TO_FINDINGS;
  const mutineerY = findingsY + GAP_FINDING_TO_MUTINEER;
  const humanY = mutineerY + GAP_MUTINEER_TO_HUMAN;
  const arbiterY = humanY + GAP_HUMAN_TO_ARBITER;
  const synthY = arbiterY + GAP_ARBITER_TO_SYNTH;

  // ── Level 1: Specialists ───────────────────────────────────────────────────
  if (hasSpecialists) {
    for (let i = 0; i < 3; i++) {
      const key = specNames[i];
      const meta = SPECIALISTS[i];
      const specState = s.specialists![key];
      const specCenterX = specPositions[key];

      nodes.push({
        id: `specialist-${key}`,
        type: 'specialist',
        position: { x: specCenterX - HALF_SPEC, y: specY },
        data: {
          name: meta.name,
          character: meta.character,
          state: specState,
          onInfoClick: () => onInfoClick(`specialist-${key}`),
        },
      });

      const specDone = isSpecialistDone(specState);
      if (specState.status === 'running') {
        edges.push(activeEdge(`pr-to-${key}`, 'pr', `specialist-${key}`));
      } else if (specDone) {
        edges.push(completeEdge(`pr-to-${key}`, 'pr', `specialist-${key}`));
      } else {
        edges.push(inactiveEdge(`pr-to-${key}`, 'pr', `specialist-${key}`));
      }
    }
  } else {
    // Ghost specialists
    for (let i = 0; i < 3; i++) {
      const meta = SPECIALISTS[i];
      const key = specNames[i];
      const specCenterX = specPositions[key];
      nodes.push(
        ghostNode(
          `specialist-${key}`,
          specCenterX - HALF_SPEC,
          specY,
          meta.name,
          meta.character,
          'specialist',
          320,
          () => onInfoClick(`specialist-${key}`),
        ),
      );
      edges.push(inactiveEdge(`pr-to-${key}`, 'pr', `specialist-${key}`));
    }
  }

  // ── Level 2-4: Finding columns (Finding → Mutineer → HumanReview) ────────
  if (hasFindings) {
    for (const col of columns) {
      const f = findings.find((ff) => ff.findingId === col.findingId)!;
      const nodeX = col.x - HALF_COL;
      const childDone = f.childStatus === 'complete' || f.childStatus === 'failed';

      // Finding node
      nodes.push({
        id: `finding-${f.findingId}`,
        type: 'finding',
        position: { x: nodeX, y: findingsY },
        data: {
          finding: f,
          onInfoClick: () => onInfoClick('childWorkflow'),
        },
      });

      // Edge: specialist → finding
      const specId = `specialist-${f.specialist}`;
      if (f.childStatus === 'started') {
        edges.push(activeEdge(`${specId}-to-finding-${f.findingId}`, specId, `finding-${f.findingId}`));
      } else if (childDone) {
        edges.push(completeEdge(`${specId}-to-finding-${f.findingId}`, specId, `finding-${f.findingId}`));
      } else {
        edges.push(inactiveEdge(`${specId}-to-finding-${f.findingId}`, specId, `finding-${f.findingId}`));
      }

      // Mutineer node
      nodes.push({
        id: `mutineer-${f.findingId}`,
        type: 'mutineer',
        position: { x: nodeX, y: mutineerY },
        data: {
          findingId: f.findingId,
          childStatus: f.childStatus,
          mutineerChallenge: f.mutineerChallenge,
          mutineerVerdict: f.mutineerVerdict,
          mutineerFailed: f.mutineerFailed,
          onInfoClick: () => onInfoClick('mutineer'),
        },
      });

      // Edge: finding → mutineer
      if (f.childStatus === 'started' && f.mutineerChallenge === undefined) {
        edges.push(activeEdge(`finding-to-mutineer-${f.findingId}`, `finding-${f.findingId}`, `mutineer-${f.findingId}`));
      } else if (childDone || f.mutineerChallenge !== undefined) {
        edges.push(completeEdge(`finding-to-mutineer-${f.findingId}`, `finding-${f.findingId}`, `mutineer-${f.findingId}`));
      } else {
        edges.push(inactiveEdge(`finding-to-mutineer-${f.findingId}`, `finding-${f.findingId}`, `mutineer-${f.findingId}`));
      }

      // HumanReview node
      const colIndex = columns.findIndex((c) => c.findingId === f.findingId);
      nodes.push({
        id: `humanreview-${f.findingId}`,
        type: 'humanreview',
        position: { x: nodeX, y: humanY },
        data: {
          findingId: f.findingId,
          challengeText: callbacks.challenges[f.findingId] ?? '',
          onChallengeChange: callbacks.onChallengeChange,
          windowOpen: s.windowOpen ?? false,
          submitted: callbacks.challengesSubmitted,
          childStatus: f.childStatus,
          humanChallenge: f.humanChallenge,
          tabIndex: colIndex + 1,
          onInfoClick: () => onInfoClick('humanwindow'),
        },
      });

      // Edge: mutineer → humanreview
      if (s.windowOpen && !callbacks.challengesSubmitted) {
        edges.push(activeEdge(`mutineer-to-human-${f.findingId}`, `mutineer-${f.findingId}`, `humanreview-${f.findingId}`));
      } else if (childDone || callbacks.challengesSubmitted) {
        edges.push(completeEdge(`mutineer-to-human-${f.findingId}`, `mutineer-${f.findingId}`, `humanreview-${f.findingId}`));
      } else {
        edges.push(inactiveEdge(`mutineer-to-human-${f.findingId}`, `mutineer-${f.findingId}`, `humanreview-${f.findingId}`));
      }

      // Arbiter node
      nodes.push({
        id: `arbiter-${f.findingId}`,
        type: 'arbiter',
        position: { x: nodeX, y: arbiterY },
        data: {
          childStatus: f.childStatus,
          mutineerChallenge: f.mutineerChallenge,
          humanChallenge: f.humanChallenge,
          ruling: f.ruling,
          reasoning: f.reasoning,
          arbiterMutineerStance: f.arbiterMutineerStance,
          arbiterHumanStance: f.arbiterHumanStance,
          onInfoClick: () => onInfoClick('arbiter'),
        },
      });

      // Edge: humanreview → arbiter
      const hasChallenges = !!f.mutineerChallenge || !!f.humanChallenge;
      if (childDone) {
        edges.push(completeEdge(`human-to-arbiter-${f.findingId}`, `humanreview-${f.findingId}`, `arbiter-${f.findingId}`));
      } else if (hasChallenges && callbacks.challengesSubmitted) {
        edges.push(activeEdge(`human-to-arbiter-${f.findingId}`, `humanreview-${f.findingId}`, `arbiter-${f.findingId}`));
      } else {
        edges.push(inactiveEdge(`human-to-arbiter-${f.findingId}`, `humanreview-${f.findingId}`, `arbiter-${f.findingId}`));
      }
    }
  } else {
    // Ghost placeholder for findings
    nodes.push(
      ghostNode(
        'finding-placeholder',
        CENTER_X - HALF_COL,
        findingsY,
        'Findings',
        '1 child workflow per finding',
        'finding',
        COLUMN_WIDTH,
        () => onInfoClick('childWorkflow'),
      ),
    );
    // Ghost edges from specialists to placeholder
    for (const key of specNames) {
      edges.push(inactiveEdge(`${key}-to-finding-placeholder`, `specialist-${key}`, 'finding-placeholder'));
    }
  }

  // ── Control node (shared timer + extend + submit) ──────────────────────────
  if (hasWindow) {
    // Position control node to the right of the rightmost column
    const rightmostX = columns.length > 0
      ? Math.max(...columns.map((c) => c.x)) + HALF_COL + COLUMN_GAP * 2
      : CENTER_X + COLUMN_WIDTH;

    nodes.push({
      id: 'control',
      type: 'control',
      position: { x: rightmostX, y: humanY },
      data: {
        windowOpen: s.windowOpen ?? false,
        secondsRemaining: s.secondsRemaining ?? 0,
        submitted: callbacks.challengesSubmitted,
        onExtend: callbacks.onExtend,
        onSubmit: () => callbacks.onSubmitChallenges(callbacks.challenges),
        onInfoClick: () => onInfoClick('humanwindow'),
      },
    });
  } else if (hasFindings) {
    // Ghost control
    const rightmostX = columns.length > 0
      ? Math.max(...columns.map((c) => c.x)) + HALF_COL + COLUMN_GAP * 2
      : CENTER_X + COLUMN_WIDTH;
    nodes.push(
      ghostNode(
        'control',
        rightmostX,
        humanY,
        'Control',
        'Timer + Signal + Update',
        'humanwindow',
        240,
        () => onInfoClick('humanwindow'),
      ),
    );
  }

  // ── Level 5: Synthesis ───────────────────────────────────────────────────────
  if (hasSynthesis) {
    nodes.push({
      id: 'synthesis',
      type: 'synthesis',
      position: { x: CENTER_X - HALF_SYNTH, y: synthY },
      data: {
        status: s.synthesisStatus ?? 'pending',
        partialOutput: 'synthesisPartialOutput' in s ? (s as RunningState).synthesisPartialOutput : undefined,
        verdict: s.verdict,
        onInfoClick: () => onInfoClick('synthesis'),
      },
    });

    // Edges: all arbiter nodes → synthesis
    if (hasFindings) {
      for (const f of findings) {
        if (s.synthesisStatus === 'running') {
          edges.push(activeEdge(`arbiter-to-synthesis-${f.findingId}`, `arbiter-${f.findingId}`, 'synthesis'));
        } else if (s.synthesisStatus === 'complete') {
          edges.push(completeEdge(`arbiter-to-synthesis-${f.findingId}`, `arbiter-${f.findingId}`, 'synthesis', true));
        } else {
          edges.push(inactiveEdge(`arbiter-to-synthesis-${f.findingId}`, `arbiter-${f.findingId}`, 'synthesis'));
        }
      }
    }
  } else {
    // Ghost synthesis
    nodes.push(
      ghostNode(
        'synthesis',
        CENTER_X - HALF_SYNTH,
        synthY,
        'Synthesis',
        'Final verdict on review-deep queue',
        'synthesis',
        720,
        () => onInfoClick('synthesis'),
      ),
    );
    // Edges to ghost synthesis
    if (hasFindings) {
      for (const f of findings) {
        edges.push(inactiveEdge(`arbiter-to-synthesis-${f.findingId}`, `arbiter-${f.findingId}`, 'synthesis'));
      }
    } else {
      edges.push(inactiveEdge('placeholder-to-synthesis', 'finding-placeholder', 'synthesis'));
    }
  }

  return { nodes, edges };
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
  onSubmit: (prUrl: string, context?: string) => Promise<string | null>;
  onCancel: () => void;
  onExtend: () => void;
  onSubmitChallenges: (challenges: Record<string, string>) => void;
  challengesSubmitted: boolean;
  onInfoClick: (whyKey: string) => void;
}

export function FlowCanvas({
  state,
  pastReview,
  onSubmit,
  onCancel,
  onExtend,
  onSubmitChallenges,
  challengesSubmitted,
  onInfoClick,
}: FlowCanvasProps) {
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const userInteracted = useRef(false);
  const prevNodeCount = useRef(0);
  const draggedNodeIds = useRef<Set<string>>(new Set());

  // Per-finding challenge text managed here
  const [challenges, setChallenges] = useState<Record<string, string>>({});

  const handleChallengeChange = useCallback((findingId: string, text: string) => {
    setChallenges((prev) => ({ ...prev, [findingId]: text }));
  }, []);

  // Reset challenges when new review starts
  useEffect(() => {
    if (state.type === 'running') {
      setChallenges({});
    }
  }, [state.type]);

  const displayState = useMemo(
    () => (pastReview ? pastReviewToState(pastReview) : state),
    [pastReview, state],
  );

  const { nodes: computedNodes, edges } = useMemo(
    () =>
      buildNodesAndEdges(displayState, {
        onSubmit,
        onCancel,
        onExtend,
        onSubmitChallenges,
        challengesSubmitted: pastReview ? true : challengesSubmitted,
        onInfoClick,
        challenges,
        onChallengeChange: handleChallengeChange,
      }),
    [displayState, onSubmit, onCancel, onExtend, onSubmitChallenges, challengesSubmitted, pastReview, onInfoClick, challenges, handleChallengeChange],
  );

  // Maintain displayed nodes, merging computed positions with user-dragged positions
  const [displayNodes, setDisplayNodes] = useState<Node[]>([]);

  useEffect(() => {
    setDisplayNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]));
      return computedNodes.map((node) => {
        if (draggedNodeIds.current.has(node.id)) {
          const existing = prevMap.get(node.id);
          if (existing) {
            return { ...node, position: existing.position };
          }
        }
        return node;
      });
    });
  }, [computedNodes]);

  // Handle node changes (captures drag positions)
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'position' && 'dragging' in change && change.dragging) {
        draggedNodeIds.current.add(change.id);
      }
    }
    setDisplayNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  // Auto-fit when new node levels appear
  useEffect(() => {
    if (!rfInstance || userInteracted.current) return;
    if (displayNodes.length !== prevNodeCount.current) {
      prevNodeCount.current = displayNodes.length;
      const timer = setTimeout(() => {
        // Before findings appear, scope fit to PR + specialists only —
        // ghost nodes below would cause excessive zoom-out otherwise.
        const hasFindingNodes = displayNodes.some((n) => n.type === 'finding');
        if (!hasFindingNodes) {
          rfInstance.fitView({
            duration: 600,
            padding: 0.15,
            nodes: [
              { id: 'pr' },
              { id: 'specialist-ironjaw' },
              { id: 'specialist-barnacle' },
              { id: 'specialist-greenhand' },
            ],
          });
        } else {
          rfInstance.fitView({ duration: 600, padding: 0.25 });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [displayNodes.length, rfInstance]);

  // Reset interaction flag on new review or when returning to floor
  useEffect(() => {
    if (state.type === 'floor-open' || state.type === 'running') {
      userInteracted.current = false;
      prevNodeCount.current = 0;
      draggedNodeIds.current.clear();
    }
  }, [state.type]);

  const handleMoveStart = useCallback(() => {
    userInteracted.current = true;
  }, []);

  const handleRecenter = useCallback(() => {
    userInteracted.current = false;
    draggedNodeIds.current.clear();
    setDisplayNodes(computedNodes);
    rfInstance?.fitView({ duration: 600, padding: 0.25 });
  }, [rfInstance, computedNodes]);

  return (
    <div className="w-screen h-screen relative">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        onInit={setRfInstance}
        onMoveStart={handleMoveStart}
        fitView
        fitViewOptions={{ padding: 0.12, duration: 600 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        noDragClassName="noDrag"
        defaultEdgeOptions={{ type: 'default' }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Lines} color="#2A2015" gap={60} lineWidth={0.5} />
        <CompassRose />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'synthesis') return '#C8902A';
            if (node.type === 'ghost') return '#3D3020';
            return '#5A5038';
          }}
          maskColor="rgba(0,0,0,0.85)"
          style={{ background: '#131008' }}
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
