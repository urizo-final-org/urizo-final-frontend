import type { ProfileEditorLayout, ProfileSnapshotEdge, ProfileSnapshotNode } from './api'
import { resolveEdgePorts } from './WorkflowPanel'

type Point = { x: number; y: number }
export const MONITORING_NODE_WIDTH = 176
export const MONITORING_NODE_HEIGHT = 112
const gap = 18
const edgeKey = (edge: ProfileSnapshotEdge) => `${edge.from}:${edge.resultPort}:${edge.to}`

// View-only routing: never write coordinates or edges back to a Profile/Layout.
export function monitoringEdgeRoutes(nodes: ProfileSnapshotNode[], edges: ProfileSnapshotEdge[], layout: ProfileEditorLayout) {
  const positions = new Map(layout.nodes.map((node) => [node.id, node]))
  const cards = nodes.flatMap((node) => {
    const position = positions.get(node.id)
    return position ? [{ ...node, x: position.x, y: position.y }] : []
  })
  const ordered = [...edges].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)))
  const ports = ordered.map((edge) => ({ edge, ...resolveEdgePorts(edge, cards, edges) }))
  const minX = Math.min(0, ...cards.map((node) => node.x))
  const maxX = Math.max(720, ...cards.map((node) => node.x + MONITORING_NODE_WIDTH))
  const maxY = Math.max(420, ...cards.map((node) => node.y + MONITORING_NODE_HEIGHT))
  const used: Point[][] = []
  const routes = ports.flatMap(({ edge, reverse, sourcePort, targetPort }, index) => {
    const source = positions.get(edge.from), target = positions.get(edge.to)
    if (!source || !target) return []
    const portY = (id: string, side: string, outgoing: boolean) => {
      const connections = ports.flatMap((item) => [
        ...(item.edge.from === id && item.sourcePort === side ? [`${edgeKey(item.edge)}:out`] : []),
        ...(item.edge.to === id && item.targetPort === side ? [`${edgeKey(item.edge)}:in`] : []),
      ]).sort()
      const slot = connections.indexOf(`${edgeKey(edge)}:${outgoing ? 'out' : 'in'}`)
      return 24 + (slot + 1) / (connections.length + 1) * (MONITORING_NODE_HEIGHT - 48)
    }
    const start = { x: source.x + (sourcePort === 'right' ? MONITORING_NODE_WIDTH : 0), y: source.y + portY(edge.from, sourcePort, true) }
    const end = { x: target.x + (targetPort === 'right' ? MONITORING_NODE_WIDTH : 0), y: target.y + portY(edge.to, targetPort, false) }
    const lane = gap + index * 6
    const a = { x: start.x + (sourcePort === 'right' ? gap : -gap), y: start.y }
    const b = { x: end.x + (targetPort === 'right' ? gap : -gap), y: end.y }
    const detour = reverse || /retry|reject|changes_requested/i.test(edge.resultPort)
    const xs = [sourcePort === 'left' ? Math.min(a.x, b.x) - lane : Math.max(a.x, b.x) + lane,
      (a.x + b.x) / 2, minX - lane, maxX + lane,
      ...cards.flatMap((node) => [node.x - gap, node.x + MONITORING_NODE_WIDTH + gap])]
    const ys = [maxY + lane, (a.y + b.y) / 2,
      ...cards.flatMap((node) => [node.y - gap, node.y + MONITORING_NODE_HEIGHT + gap])]
    const candidates: Point[][] = [
      ...xs.map((x) => [start, a, { x, y: a.y }, { x, y: b.y }, b, end]),
      ...ys.map((y) => [start, a, { x: a.x, y }, { x: b.x, y }, b, end]),
    ]
    const score = (points: Point[]) => {
      let value = 0
      for (let i = 1; i < points.length; i++) {
        const p = points[i - 1], q = points[i]
        value += Math.abs(p.x - q.x) + Math.abs(p.y - q.y)
        for (const node of cards) {
          if (crossesCard(p, q, node)) value += 1_000_000
        }
        // Separate shared horizontal/vertical runs instead of piling return edges together.
        for (const route of used) for (let j = 1; j < route.length; j++) {
          const u = route[j - 1], v = route[j]
          if (p.x === q.x && u.x === v.x && Math.abs(p.x - u.x) < 5 && overlap(p.y, q.y, u.y, v.y)) value += 400
          if (p.y === q.y && u.y === v.y && Math.abs(p.y - u.y) < 5 && overlap(p.x, q.x, u.x, v.x)) value += 400
        }
      }
      if (detour && points.some((p) => p.y > maxY)) value -= 40
      return value
    }
    const points = candidates.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best)
      .filter((p, i, all) => i === 0 || p.x !== all[i - 1].x || p.y !== all[i - 1].y)
    used.push(points)
    const constrained = points.some((p, i) => i > 0 && cards.some((node) => crossesCard(points[i - 1], p, node)))
    return [{ edge, points, sourcePort, targetPort, detour, constrained, path: roundedPath(points) }]
  })
  return { routes, minX: Math.min(0, ...used.flat().map((p) => p.x - gap)),
    minY: Math.min(0, ...used.flat().map((p) => p.y - gap)),
    maxX: Math.max(maxX + 48, ...used.flat().map((p) => p.x + gap)),
    maxY: Math.max(maxY + 48, ...used.flat().map((p) => p.y + gap)) }
}

function overlap(a: number, b: number, c: number, d: number) {
  return Math.max(Math.min(a, b), Math.min(c, d)) < Math.min(Math.max(a, b), Math.max(c, d))
}
function crossesCard(a: Point, b: Point, node: Point) {
  return a.x === b.x
    ? a.x > node.x && a.x < node.x + MONITORING_NODE_WIDTH && overlap(a.y, b.y, node.y, node.y + MONITORING_NODE_HEIGHT)
    : a.y > node.y && a.y < node.y + MONITORING_NODE_HEIGHT && overlap(a.x, b.x, node.x, node.x + MONITORING_NODE_WIDTH)
}
function roundedPath(points: Point[]) {
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], p = points[i], next = points[i + 1]
    const incoming = Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)
    const outgoing = Math.abs(next.x - p.x) + Math.abs(next.y - p.y)
    const r = Math.min(6, incoming / 2, outgoing / 2)
    path += ` L ${p.x - Math.sign(p.x - prev.x) * r} ${p.y - Math.sign(p.y - prev.y) * r} Q ${p.x} ${p.y} ${p.x + Math.sign(next.x - p.x) * r} ${p.y + Math.sign(next.y - p.y) * r}`
  }
  const end = points[points.length - 1]
  return `${path} L ${end.x} ${end.y}`
}
