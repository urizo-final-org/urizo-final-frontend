import type { ProfileSnapshotEdge } from './api'

type Point = { x: number; y: number }
type Card = Point & { id: string }
type Side = 'left' | 'right'
export type EditorEdgeSeed = { edge: ProfileSnapshotEdge; sourcePort: Side; targetPort: Side; detour: boolean }
type Corridor = { axis: 'x' | 'y'; anchor: 'middle' | 'outer' | 'node'; id?: string; after?: boolean; offset: number }
export type EditorRoutePlan = EditorEdgeSeed & { corridor: Corridor }
export const EDITOR_NODE_WIDTH = 160
export const EDITOR_NODE_HEIGHT = 88
const portY = EDITOR_NODE_HEIGHT / 2
const gap = 18
const key = (edge: ProfileSnapshotEdge) => `${edge.from}:${edge.resultPort}:${edge.to}`

// Render-only geometry. A drag retains port/corridor identities, never Snapshot coordinates or edges.
export function editorEdgeRoutes(nodes: Card[], seeds: EditorEdgeSeed[], frozen?: EditorRoutePlan[] | null) {
  const cards = new Map(nodes.map(node => [node.id, node]))
  const held = new Map(frozen?.map(plan => [key(plan.edge), plan]))
  const ordered = [...seeds].sort((a, b) => key(a.edge).localeCompare(key(b.edge)))
  const maxRight = Math.max(0, ...nodes.map(node => node.x + EDITOR_NODE_WIDTH))
  const maxBottom = Math.max(0, ...nodes.map(node => node.y + EDITOR_NODE_HEIGHT))
  const used: Point[][] = []
  const routes = ordered.flatMap((seed, index) => {
    const source = cards.get(seed.edge.from), target = cards.get(seed.edge.to)
    if (!source || !target) return []
    const saved = held.get(key(seed.edge))
    const ports = saved ?? (seed.edge.from === seed.edge.to
      ? { ...seed, targetPort: seed.sourcePort === 'left' ? 'right' as const : 'left' as const } : seed)
    const start = { x: source.x + (ports.sourcePort === 'right' ? EDITOR_NODE_WIDTH : 0), y: source.y + portY }
    const end = { x: target.x + (ports.targetPort === 'right' ? EDITOR_NODE_WIDTH : 0), y: target.y + portY }
    const a = { x: start.x + (ports.sourcePort === 'right' ? gap : -gap), y: start.y }
    const b = { x: end.x + (ports.targetPort === 'right' ? gap : -gap), y: end.y }
    const corridorPoints = (corridor: Corridor) => {
      const { axis, anchor, after, offset } = corridor
      const card = corridor.id ? cards.get(corridor.id) : undefined
      const value = Math.max(12, anchor === 'middle'
        ? (a[axis] + b[axis]) / 2 + offset
        : anchor === 'node' && card
          ? card[axis] + (after ? axis === 'x' ? EDITOR_NODE_WIDTH : EDITOR_NODE_HEIGHT : 0) + offset
          : (axis === 'x' ? maxRight : maxBottom) + offset)
      return compact(axis === 'x'
        ? [start, a, { x: value, y: a.y }, { x: value, y: b.y }, b, end]
        : [start, a, { x: a.x, y: value }, { x: b.x, y: value }, b, end])
    }
    const score = (points: Point[]) => {
      let value = 0
      for (let i = 1; i < points.length; i++) {
        const p = points[i - 1], q = points[i]
        value += Math.abs(p.x - q.x) + Math.abs(p.y - q.y)
        for (const node of nodes) if (crossesCard(p, q, node)) value += 1_000_000
        for (const route of used) for (let j = 1; j < route.length; j++) {
          const u = route[j - 1], v = route[j]
          if (p.x === q.x && u.x === v.x && Math.abs(p.x - u.x) < 5 && overlap(p.y, q.y, u.y, v.y)) value += 400
          if (p.y === q.y && u.y === v.y && Math.abs(p.y - u.y) < 5 && overlap(p.x, q.x, u.x, v.x)) value += 400
        }
      }
      return value
    }
    const candidates: Corridor[] = [
      { axis: 'x', anchor: 'middle', offset: 0 },
      { axis: 'y', anchor: 'middle', offset: 0 },
      { axis: 'x', anchor: 'outer', offset: gap + index * 7 },
      { axis: 'y', anchor: 'outer', offset: gap + index * 7 },
      ...[...nodes].sort((a, b) => a.id.localeCompare(b.id)).flatMap(node =>
        (['x', 'y'] as const).flatMap(axis => [false, true].map(after => ({
          axis, anchor: 'node' as const, id: node.id, after, offset: after ? gap : -gap,
        })))),
    ]
    const corridor = saved?.corridor ?? candidates.map(candidate => ({ candidate, score: score(corridorPoints(candidate)) }))
      .reduce((best, next) => next.score < best.score ? next : best).candidate
    const points = corridorPoints(corridor)
    used.push(points)
    const constrained = points.some((p, i) => i > 0 && nodes.some(node => crossesCard(points[i - 1], p, node)))
    const plan: EditorRoutePlan = { edge: seed.edge, sourcePort: ports.sourcePort, targetPort: ports.targetPort, detour: ports.detour, corridor }
    return [{ ...plan, plan, points, path: roundedPath(points), constrained, lane: index }]
  })
  return { routes, maxX: Math.max(maxRight + 48, ...used.flat().map(p => p.x + gap)),
    maxY: Math.max(maxBottom + 48, ...used.flat().map(p => p.y + gap)) }
}
function overlap(a: number, b: number, c: number, d: number) {
  return Math.max(Math.min(a, b), Math.min(c, d)) < Math.min(Math.max(a, b), Math.max(c, d))
}
function crossesCard(a: Point, b: Point, node: Card) {
  return a.x === b.x
    ? a.x > node.x && a.x < node.x + EDITOR_NODE_WIDTH && overlap(a.y, b.y, node.y, node.y + EDITOR_NODE_HEIGHT)
    : a.y > node.y && a.y < node.y + EDITOR_NODE_HEIGHT && overlap(a.x, b.x, node.x, node.x + EDITOR_NODE_WIDTH)
}
function compact(points: Point[]) {
  const result: Point[] = []
  for (const point of points) {
    if (result.at(-1)?.x === point.x && result.at(-1)?.y === point.y) continue
    while (result.length > 1) {
      const a = result.at(-2)!, b = result.at(-1)!
      if ((a.x === b.x && b.x === point.x && (b.y - a.y) * (point.y - b.y) >= 0)
        || (a.y === b.y && b.y === point.y && (b.x - a.x) * (point.x - b.x) >= 0)) result.pop()
      else break
    }
    result.push(point)
  }
  return result
}
function roundedPath(points: Point[]) {
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], p = points[i], next = points[i + 1]
    const r = Math.min(6, (Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)) / 2, (Math.abs(next.x - p.x) + Math.abs(next.y - p.y)) / 2)
    path += ` L ${p.x - Math.sign(p.x - prev.x) * r} ${p.y - Math.sign(p.y - prev.y) * r} Q ${p.x} ${p.y} ${p.x + Math.sign(next.x - p.x) * r} ${p.y + Math.sign(next.y - p.y) * r}`
  }
  return `${path} L ${points.at(-1)!.x} ${points.at(-1)!.y}`
}
