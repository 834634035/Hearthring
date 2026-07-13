import { useEffect, useMemo, useRef, useState } from "react";
import {
  TRIBE_RELATION_EDGES,
  TRIBE_RELATION_NODES,
  type TribeRelationEdge,
  type TribeRelationKind,
  type TribeRelationNode
} from "../tribeRelations";

type DrawNode = TribeRelationNode & {
  px: number;
  py: number;
  radius: number;
};

type NodePosition = {
  x: number;
  y: number;
};

type DragState = {
  nodeId: string;
  pointerId: number;
};

const NODE_COLORS: Record<TribeRelationNode["kind"], string> = {
  tribe: "#d49b58",
  branch: "#8ccf88",
  alliance: "#e4c46c",
  external: "#d86455",
  future: "#8fb6ff"
};

const EDGE_COLORS: Record<TribeRelationKind, string> = {
  belonging: "#9ee48f",
  secret: "#a68dff",
  pressure: "#ff9d4d",
  conflict: "#ff5f5f",
  trade: "#e0c16b",
  alliance: "#83c7ff",
  omen: "#b9b2a6"
};

const EDGE_LABELS: Record<TribeRelationKind, string> = {
  belonging: "主从支属",
  secret: "秘密托付",
  pressure: "压力/拉拢",
  conflict: "冲突",
  trade: "贸易/交换",
  alliance: "联盟/协作",
  omen: "灾兆"
};

const RELATION_FILTERS: Array<"all" | TribeRelationKind> = [
  "all",
  "belonging",
  "secret",
  "pressure",
  "conflict",
  "trade",
  "alliance",
  "omen"
];

const FOCUS_FADE_DURATION_MS = 180;

type TribeRelationCanvasProps = {
  onClose?: () => void;
};

export function TribeRelationCanvas({ onClose }: TribeRelationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawNodesRef = useRef<DrawNode[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>("graybud");
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | TribeRelationKind>("all");
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [focusProgress, setFocusProgress] = useState(1);

  const visibleEdges = useMemo(
    () => (filter === "all" ? TRIBE_RELATION_EDGES : TRIBE_RELATION_EDGES.filter((edge) => edge.kind === filter)),
    [filter]
  );

  const activeNode = TRIBE_RELATION_NODES.find((node) => node.id === (hoverNodeId ?? activeNodeId)) ?? TRIBE_RELATION_NODES[0]!;
  const activeEdges = activeNodeId
    ? TRIBE_RELATION_EDGES.filter((edge) => edge.from === activeNode.id || edge.to === activeNode.id)
    : TRIBE_RELATION_EDGES;
  const focusNodeId = hoverNodeId ?? draggingNodeId ?? activeNodeId;

  useEffect(() => {
    if (!focusNodeId) {
      setFocusProgress(0);
      return;
    }

    let frameId = 0;
    const start = performance.now();
    setFocusProgress(0);

    const animate = (now: number) => {
      const progress = clamp((now - start) / FOCUS_FADE_DURATION_MS, 0, 1);
      setFocusProgress(easeOutCubic(progress));
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [focusNodeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const nodes = toDrawNodes(rect.width, rect.height, nodePositions);
      const relatedNodeIds = focusNodeId ? getRelatedNodeIds(focusNodeId, visibleEdges) : null;
      drawNodesRef.current = nodes;
      drawBackground(ctx, rect.width, rect.height);
      drawRegionBands(ctx, rect.width, rect.height);
      drawEdges(ctx, nodes, visibleEdges, activeNodeId, focusNodeId);
      drawNodes(ctx, nodes, activeNodeId, focusNodeId, relatedNodeIds, focusProgress);
      drawEdgeLabels(ctx, nodes, visibleEdges, activeNodeId, focusNodeId, focusProgress);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [activeNodeId, draggingNodeId, focusNodeId, focusProgress, hoverNodeId, nodePositions, visibleEdges]);

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (dragRef.current) {
      const next = canvasPointToGraphPercent(x, y, rect.width, rect.height);
      const nodeId = dragRef.current.nodeId;
      setNodePositions((current) => ({
        ...current,
        [nodeId]: next
      }));
      setHoverNodeId(nodeId);
      return;
    }

    const hit = findHitNode(drawNodesRef.current, x, y);
    setHoverNodeId(hit?.id ?? null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = findHitNode(drawNodesRef.current, x, y);
    if (!hit) {
      setActiveNodeId(null);
      setHoverNodeId(null);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { nodeId: hit.id, pointerId: event.pointerId };
    setActiveNodeId(hit.id);
    setHoverNodeId(hit.id);
    setDraggingNodeId(hit.id);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDraggingNodeId(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  return (
    <section className={onClose ? "tribe-graph-overlay" : "tribe-graph-page-canvas"} aria-label="部落关系图">
      <div className={onClose ? "tribe-graph-shell" : "tribe-graph-shell tribe-graph-shell-page"}>
        <header className="tribe-graph-header">
          <div>
            <p className="eyebrow">Tribe Relation Canvas</p>
            <h2>部落关系图</h2>
            <p>节点大小代表部落强度，连线颜色代表关系类型；点击节点查看它的关系说明。</p>
          </div>
          {onClose ? (
            <button className="scene-dialogue-close" type="button" onClick={onClose} aria-label="关闭部落关系图">
              ×
            </button>
          ) : null}
        </header>

        <div className="tribe-graph-filter" aria-label="关系筛选">
          {RELATION_FILTERS.map((item) => (
            <button
              className={filter === item ? "tribe-filter active" : "tribe-filter"}
              key={item}
              type="button"
              onClick={() => setFilter(item)}
            >
              {item === "all" ? "全部关系" : EDGE_LABELS[item]}
            </button>
          ))}
        </div>

        <div className="tribe-graph-main">
          <div className="tribe-graph-canvas-wrap" ref={wrapRef}>
            <canvas
              className={draggingNodeId ? "is-dragging-node" : ""}
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerLeave={() => {
                if (!dragRef.current) setHoverNodeId(null);
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>

          <aside className="tribe-graph-detail">
            <p className="eyebrow">{activeNode.kind === "branch" ? "Branch" : activeNode.kind}</p>
            <h3>{activeNode.name}</h3>
            <dl>
              <div>
                <dt>区域</dt>
                <dd>{activeNode.region}</dd>
              </div>
              <div>
                <dt>图腾</dt>
                <dd>{activeNode.totem}</dd>
              </div>
              <div>
                <dt>强度</dt>
                <dd>{activeNode.strength} / 5</dd>
              </div>
            </dl>
            <p>{activeNode.summary}</p>
            <h4>相关关系</h4>
            <ul>
              {activeEdges.map((edge) => (
                <li key={edge.id}>
                  <strong style={{ color: EDGE_COLORS[edge.kind] }}>{EDGE_LABELS[edge.kind]}</strong>
                  <span>{edge.label}</span>
                  <p>{edge.summary}</p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </section>
  );
}

function toDrawNodes(width: number, height: number, nodePositions: Record<string, NodePosition>): DrawNode[] {
  const padX = Math.max(42, width * 0.06);
  const padY = Math.max(34, height * 0.08);
  const graphWidth = Math.max(1, width - padX * 2);
  const graphHeight = Math.max(1, height - padY * 2);

  return TRIBE_RELATION_NODES.map((node) => {
    const position = nodePositions[node.id] ?? node;
    return {
      ...node,
      px: padX + (position.x / 100) * graphWidth,
      py: padY + (position.y / 100) * graphHeight,
      radius: 8 + node.strength * 2.8 + (node.kind === "future" ? 3 : 0)
    };
  });
}

function canvasPointToGraphPercent(x: number, y: number, width: number, height: number): NodePosition {
  const padX = Math.max(42, width * 0.06);
  const padY = Math.max(34, height * 0.08);
  const graphWidth = Math.max(1, width - padX * 2);
  const graphHeight = Math.max(1, height - padY * 2);
  return {
    x: clamp(((x - padX) / graphWidth) * 100, 0, 100),
    y: clamp(((y - padY) / graphHeight) * 100, 0, 100)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function getRelatedNodeIds(nodeId: string, edges: TribeRelationEdge[]) {
  const relatedNodeIds = new Set([nodeId]);
  for (const edge of edges) {
    if (edge.from === nodeId) relatedNodeIds.add(edge.to);
    if (edge.to === nodeId) relatedNodeIds.add(edge.from);
  }
  return relatedNodeIds;
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#18150f");
  gradient.addColorStop(0.48, "#111916");
  gradient.addColorStop(1, "#19130f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(231, 190, 126, 0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawRegionBands(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const bands = [
    { label: "西大陆 / 铜日", x: 0.04, y: 0.08, color: "rgba(165, 82, 68, 0.14)" },
    { label: "东大陆北部", x: 0.22, y: 0.08, color: "rgba(112, 162, 107, 0.1)" },
    { label: "东大陆中部强部落", x: 0.46, y: 0.1, color: "rgba(221, 168, 88, 0.1)" },
    { label: "西部沙漠 / 环城", x: 0.08, y: 0.66, color: "rgba(199, 122, 67, 0.12)" },
    { label: "南部水泽密林", x: 0.55, y: 0.78, color: "rgba(87, 146, 118, 0.1)" }
  ];

  ctx.font = "700 12px Microsoft YaHei, sans-serif";
  for (const band of bands) {
    const x = width * band.x;
    const y = height * band.y;
    ctx.fillStyle = band.color;
    ctx.beginPath();
    ctx.roundRect(x - 12, y - 18, 150, 34, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(239, 216, 173, 0.62)";
    ctx.fillText(band.label, x, y + 3);
  }
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  nodes: DrawNode[],
  edges: TribeRelationEdge[],
  activeNodeId: string | null,
  hoverNodeId: string | null
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;

    const focusNodeId = hoverNodeId ?? activeNodeId;
    const highlighted = focusNodeId ? edge.from === focusNodeId || edge.to === focusNodeId : false;
    const dx = to.px - from.px;
    const dy = to.py - from.py;
    const bend = Math.max(-42, Math.min(42, dx * 0.12));
    const cx = (from.px + to.px) / 2 - dy * 0.08;
    const cy = (from.py + to.py) / 2 + bend;

    ctx.save();
    ctx.globalAlpha = highlighted ? 0.96 : 0.34;
    ctx.strokeStyle = EDGE_COLORS[edge.kind];
    ctx.lineWidth = highlighted ? 2.8 : 1.4;
    if (edge.kind === "secret" || edge.kind === "omen") ctx.setLineDash([6, 6]);
    if (edge.kind === "pressure") ctx.setLineDash([10, 4]);
    ctx.beginPath();
    ctx.moveTo(from.px, from.py);
    ctx.quadraticCurveTo(cx, cy, to.px, to.py);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }
}

function drawEdgeLabels(
  ctx: CanvasRenderingContext2D,
  nodes: DrawNode[],
  edges: TribeRelationEdge[],
  activeNodeId: string | null,
  hoverNodeId: string | null,
  focusProgress: number
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;

    const focusNodeId = hoverNodeId ?? activeNodeId;
    const highlighted = focusNodeId ? edge.from === focusNodeId || edge.to === focusNodeId : false;
    if (!highlighted) continue;

    const dx = to.px - from.px;
    const dy = to.py - from.py;
    const bend = Math.max(-42, Math.min(42, dx * 0.12));
    const cx = (from.px + to.px) / 2 - dy * 0.08;
    const cy = (from.py + to.py) / 2 + bend;
    const labelX = (from.px + to.px + cx) / 3;
    const labelY = (from.py + to.py + cy) / 3;
    ctx.save();
    ctx.globalAlpha = focusProgress;
    drawEdgeLabel(ctx, edge.label, labelX, labelY, EDGE_COLORS[edge.kind]);
    ctx.restore();
  }
}

function drawEdgeLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.font = "700 11px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + 14;
  ctx.fillStyle = "rgba(18, 15, 11, 0.82)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - 10, width, 20, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f7e2b8";
  ctx.fillText(text, x, y + 1);
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  nodes: DrawNode[],
  activeNodeId: string | null,
  hoverNodeId: string | null,
  relatedNodeIds: Set<string> | null,
  focusProgress: number
) {
  for (const node of nodes) {
    const active = node.id === activeNodeId;
    const hover = node.id === hoverNodeId;
    const dimmed = relatedNodeIds ? !relatedNodeIds.has(node.id) : false;
    const color = NODE_COLORS[node.kind];

    ctx.save();
    ctx.globalAlpha = dimmed ? mix(1, 0.28, focusProgress) : 1;
    ctx.shadowColor = color;
    ctx.shadowBlur = active || hover ? 18 : 6;
    ctx.fillStyle = color;
    ctx.strokeStyle = active || hover ? "#fff0c5" : "rgba(255, 236, 190, 0.48)";
    ctx.lineWidth = active || hover ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(node.px, node.py, node.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = dimmed ? mix(1, 0.34, focusProgress) : 1;
    ctx.fillStyle = "#17110b";
    ctx.font = "900 11px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(node.strength), node.px, node.py + 0.5);

    ctx.textBaseline = "alphabetic";
    ctx.font = active || hover ? "900 13px Microsoft YaHei, sans-serif" : "700 12px Microsoft YaHei, sans-serif";
    const labelWidth = ctx.measureText(node.name).width + 12;
    const labelY = node.py + node.radius + 18;
    ctx.fillStyle = active || hover ? "rgba(20, 14, 9, 0.88)" : "rgba(20, 14, 9, 0.58)";
    ctx.beginPath();
    ctx.roundRect(node.px - labelWidth / 2, labelY - 14, labelWidth, 20, 6);
    ctx.fill();
    ctx.fillStyle = active || hover ? "#ffe6b5" : "rgba(239, 220, 180, 0.82)";
    ctx.fillText(node.name, node.px, labelY);
    ctx.restore();
  }
}

function findHitNode(nodes: DrawNode[], x: number, y: number) {
  return nodes.find((node) => Math.hypot(node.px - x, node.py - y) <= node.radius + 8);
}
