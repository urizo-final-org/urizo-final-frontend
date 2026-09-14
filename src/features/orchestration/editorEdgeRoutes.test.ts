import { expect, test } from 'vitest'
import { editorEdgeRoutes, type EditorEdgeSeed, EDITOR_NODE_WIDTH as W, EDITOR_NODE_HEIGHT as H } from './editorEdgeRoutes'
import { starterSnapshots, resolveEdgePorts } from './WorkflowPanel'

const nodes = [
  { id: 'a', x: 48, y: 48 }, { id: 'b', x: 292, y: 48 }, { id: 'c', x: 292, y: 208 }, { id: 'd', x: 536, y: 48 },
]
const seeds: EditorEdgeSeed[] = [
  { edge: { from: 'a', to: 'b', resultPort: 'next' }, sourcePort: 'right', targetPort: 'left', detour: false },
  { edge: { from: 'a', to: 'd', resultPort: 'failed' }, sourcePort: 'right', targetPort: 'left', detour: false },
  { edge: { from: 'b', to: 'c', resultPort: 'next' }, sourcePort: 'right', targetPort: 'right', detour: true },
  { edge: { from: 'c', to: 'a', resultPort: 'retry' }, sourcePort: 'left', targetPort: 'left', detour: true },
]
test('routes are deterministic orthogonal geometry with rounded corners, outside card interiors, without mutating inputs', () => {
  const before = JSON.stringify({ nodes, seeds })
  const result = editorEdgeRoutes(nodes, seeds)
  expect(JSON.stringify({ nodes, seeds })).toBe(before)
  expect(editorEdgeRoutes([...nodes].reverse(), [...seeds].reverse())).toEqual(result)
  expect(result.routes).toHaveLength(seeds.length)
  expect(result.routes.every(route => !route.constrained)).toBe(true)
  expect(result.routes.some(route => route.path.includes(' Q '))).toBe(true)
  for (const route of result.routes) {
    expect(route.path).not.toMatch(/C |NaN|Infinity/)
    route.points.slice(1).forEach((point, index) => expect(point.x === route.points[index].x || point.y === route.points[index].y).toBe(true))
    const from = nodes.find(node => node.id === route.edge.from)!
    const to = nodes.find(node => node.id === route.edge.to)!
    expect(route.points[0]).toEqual({ x: from.x + (route.sourcePort === 'right' ? W : 0), y: from.y + H / 2 })
    expect(route.points.at(-1)).toEqual({ x: to.x + (route.targetPort === 'right' ? W : 0), y: to.y + H / 2 })
    for (const point of route.points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(result.maxX)
      expect(point.y).toBeLessThanOrEqual(result.maxY)
    }
  }
})
test('drag freezes corridor and port identity while geometry follows every new coordinate', () => {
  const initial = editorEdgeRoutes(nodes, seeds)
  const frozen = initial.routes.map(route => route.plan)
  for (const delta of [1, 20, 120, 300]) {
    const moved = nodes.map(node => node.id === 'b' ? { ...node, x: node.x + delta, y: node.y + delta / 2 } : node)
    const result = editorEdgeRoutes(moved, seeds, frozen)
    expect(result.routes.map(route => route.plan)).toEqual(frozen)
    const edge = result.routes.find(route => route.edge.to === 'b')!
    expect(edge.points.at(-1)).toEqual({ x: 292 + delta, y: 48 + H / 2 + delta / 2 })
    expect(edge.path).not.toBe(initial.routes.find(route => route.edge.to === 'b')!.path)
  }
})
test('overlap does not hide edges and self-return remains a visible loop', () => {
  const loop: EditorEdgeSeed = { ...seeds[0], edge: { from: 'a', to: 'a', resultPort: 'retry' }, sourcePort: 'left', targetPort: 'left', detour: true }
  const result = editorEdgeRoutes(nodes, [loop])
  expect(result.routes[0].constrained).toBe(false)
  expect(result.routes[0].points.length).toBeGreaterThan(3)
  expect(result.routes[0].sourcePort).not.toBe(result.routes[0].targetPort)
  const overlapping = nodes.map(node => ({ ...node, x: 48, y: 48 }))
  expect(editorEdgeRoutes(overlapping, seeds).routes).toHaveLength(seeds.length)
  expect(editorEdgeRoutes([], seeds).routes).toHaveLength(0)
})
test.each(['LLM_OPS', 'NATURAL_CMS'] as const)('keeps all %s Snapshot fields and connections unchanged', profile => {
  const snapshot = starterSnapshots[profile]
  const before = JSON.stringify(snapshot)
  const cards = snapshot.nodes.map((node, index) => ({ ...node, x: 48 + index * 244, y: 48 }))
  const result = editorEdgeRoutes(cards, snapshot.edges.map(edge => ({
    edge, ...resolveEdgePorts(edge, cards, snapshot.edges), detour: /retry|reject|changes_requested/i.test(edge.resultPort),
  })))
  expect(result.routes).toHaveLength(snapshot.edges.length)
  expect(result.routes.every(route => !route.constrained)).toBe(true)
  expect(JSON.stringify(snapshot)).toBe(before)
})
