import { expect, test } from 'vitest'
import { monitoringEdgeRoutes, MONITORING_NODE_HEIGHT as H, MONITORING_NODE_WIDTH as W } from './monitoringEdgeRoutes'
import type { ProfileEditorLayout, ProfileSnapshotEdge, ProfileSnapshotNode } from './api'
import { starterSnapshots } from './WorkflowPanel'

const nodes: ProfileSnapshotNode[] = ['start', 'analyze', 'code', 'preview', 'approval', 'review', 'end'].map((id) => ({ id, type: 'agent', handlerKey: 'coding.code', resultPorts: ['next', 'retry'], config: {} }))
const edges: ProfileSnapshotEdge[] = [
  { from: 'start', to: 'analyze', resultPort: 'next' },
  { from: 'analyze', to: 'code', resultPort: 'feasible' },
  { from: 'analyze', to: 'end', resultPort: 'infeasible' },
  { from: 'code', to: 'preview', resultPort: 'completed' },
  { from: 'preview', to: 'approval', resultPort: 'ready' },
  { from: 'approval', to: 'review', resultPort: 'approved' },
  { from: 'approval', to: 'code', resultPort: 'rejected' },
  { from: 'review', to: 'code', resultPort: 'changes_requested' },
  { from: 'review', to: 'end', resultPort: 'passed' },
]
const layout: ProfileEditorLayout = { profileVersionId: 'v1', createdAt: '', nodes: [
  { id: 'start', x: 48, y: 48 }, { id: 'analyze', x: 300, y: 48 },
  { id: 'code', x: 300, y: 208 }, { id: 'preview', x: 300, y: 368 },
  { id: 'approval', x: 300, y: 528 }, { id: 'review', x: 300, y: 688 }, { id: 'end', x: 552, y: 48 },
] }

test('preserves every Snapshot edge and stored coordinate with deterministic obstacle-free routes', () => {
  const before = JSON.stringify({ nodes, edges, layout })
  const result = monitoringEdgeRoutes(nodes, edges, layout)
  expect(result.routes).toHaveLength(edges.length)
  expect(result.routes.every((route) => !route.constrained)).toBe(true)
  expect(JSON.stringify({ nodes, edges, layout })).toBe(before)
  expect(monitoringEdgeRoutes(nodes, [...edges].reverse(), layout)).toEqual(result)
  expect(new Set(result.routes.map((route) => route.path)).size).toBe(edges.length)
  for (const route of result.routes) {
    expect(route.path).not.toMatch(/NaN|Infinity/)
    const from = layout.nodes.find((node) => node.id === route.edge.from)!
    const to = layout.nodes.find((node) => node.id === route.edge.to)!
    expect([from.x, from.x + W]).toContain(route.points[0].x)
    expect([to.x, to.x + W]).toContain(route.points.at(-1)!.x)
    for (const point of route.points) {
      expect(point.x).toBeGreaterThanOrEqual(result.minX)
      expect(point.x).toBeLessThanOrEqual(result.maxX)
      expect(point.y).toBeGreaterThanOrEqual(result.minY)
      expect(point.y).toBeLessThanOrEqual(result.maxY)
    }
  }
})

test('handles opposing, parallel, self-return and missing-coordinate edges without changing topology', () => {
  const extra = [...edges, { from: 'code', to: 'analyze', resultPort: 'retry' },
    { from: 'code', to: 'preview', resultPort: 'next' }, { from: 'code', to: 'code', resultPort: 'retry' }]
  const result = monitoringEdgeRoutes(nodes, extra, layout)
  expect(result.routes).toHaveLength(extra.length)
  expect(new Set(result.routes.map((route) => route.path)).size).toBe(extra.length)
  expect(result.routes.every((route) => !route.constrained)).toBe(true)
  expect(monitoringEdgeRoutes(nodes, extra, { ...layout, nodes: [] }).routes).toHaveLength(0)
})

test('does not hide connections when saved cards overlap and marks constrained paths', () => {
  const same = { ...layout, nodes: layout.nodes.map((node) => ({ ...node, x: 48, y: 48 + H / 4 })) }
  expect(monitoringEdgeRoutes(nodes, edges, same).routes).toHaveLength(edges.length)
})

test.each(['LLM_OPS', 'NATURAL_CMS'] as const)('preserves all %s template connections and configuration', (key) => {
  const snapshot = starterSnapshots[key]
  const before = JSON.stringify(snapshot)
  const saved = { ...layout, nodes: snapshot.nodes.map((node, index) => ({ id: node.id, x: 48 + index * 252, y: 64 })) }
  const routes = monitoringEdgeRoutes(snapshot.nodes, snapshot.edges, saved).routes
  expect(routes).toHaveLength(snapshot.edges.length)
  expect(routes.every((route) => !route.constrained)).toBe(true)
  expect(JSON.stringify(snapshot)).toBe(before)
})
