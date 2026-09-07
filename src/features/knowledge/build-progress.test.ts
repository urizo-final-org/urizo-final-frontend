import { describe, expect, it } from 'vitest'
import { isBuildInProgress } from './admin-types'
import type { AgentJob, KnowledgeVersion } from './admin-types'
import { buildView, findInProgress, formatElapsed, stepStates, STALL_THRESHOLD_MS } from './build-progress'

function version(overrides: Partial<KnowledgeVersion> = {}): KnowledgeVersion {
  return {
    knowledgeVersionId: 'v-1', knowledgeBaseId: 'kb-1', connectorVersionId: 'cv-1',
    versionNumber: 10, status: 'BUILDING', documentCount: 500, chunkCount: 500,
    createdAt: '2026-09-06T05:09:53.000Z', ...overrides,
  }
}

describe('isBuildInProgress', () => {
  // Flyway CHECK가 enum 정의다. 진행 중을 뜻하는 값이 둘이라 하나만 보면 놓친다 —
  // 생성 직후는 BUILD_REQUESTED이고 collect() 진입 후에야 BUILDING이 된다.
  it('treats both pre-build statuses as in progress', () => {
    expect(isBuildInProgress('BUILD_REQUESTED')).toBe(true)
    expect(isBuildInProgress('BUILDING')).toBe(true)
  })

  it('treats settled statuses as not in progress', () => {
    for (const status of ['APPROVAL_PENDING', 'ACTIVE', 'ARCHIVED', 'FAILED']) {
      expect(isBuildInProgress(status)).toBe(false)
    }
  })
})

describe('findInProgress', () => {
  // 진입 시 versions 1회 조회로 폴링 여부를 정한다. 추가 호출이 0이고,
  // 8분 빌드 도중 새로고침이 나도 진행 패널이 복구된다.
  it('picks the building version so a reload can resume the panel', () => {
    const found = findInProgress([
      version({ versionNumber: 10, status: 'BUILDING' }),
      version({ versionNumber: 9, status: 'ARCHIVED' }),
    ])
    expect(found?.versionNumber).toBe(10)
  })

  it('returns null when nothing is building so polling stays off', () => {
    expect(findInProgress([version({ status: 'ACTIVE' }), version({ status: 'APPROVAL_PENDING' })])).toBeNull()
  })
})

describe('buildView', () => {
  const started = Date.parse('2026-09-06T05:09:53.000Z')

  // 경과 시간은 createdAt에서 계산한다. job이 없어도 성립하고 새로고침에도 이어진다.
  it('computes elapsed time from the version, not from the job', () => {
    const view = buildView(version(), null, started + 252_000)
    expect(formatElapsed(view.elapsedMs)).toBe('4분 12초')
    expect(view.phase).toBeNull()
  })

  // 9/6 실측: updatedAt이 8분 36초 동안 두 값밖에 나오지 않았다. 정체 판정에 쓸 수 없어
  // createdAt 기준 12분으로 판정한다.
  it('flags a stall past 12 minutes using created time', () => {
    expect(buildView(version(), null, started + STALL_THRESHOLD_MS - 1000).stalled).toBe(false)
    expect(buildView(version(), null, started + STALL_THRESHOLD_MS + 1000).stalled).toBe(true)
  })

  it('reads the phase from the nested progress object', () => {
    // 최상위가 아니라 progress 안이다. 경로를 틀리면 전부 undefined가 되고 화면은 빈 값을 그린다.
    const job = { progress: { phase: 'CHUNK', percent: 45 } } as AgentJob
    expect(buildView(version(), job, started).phase).toBe('CHUNK')
  })
})

describe('stepStates', () => {
  // 7단계. "파싱·정제"는 대응 phase가 없어 뺐다.
  it('lights steps up to the current phase', () => {
    expect(stepStates('EMBED')).toEqual(['done', 'done', 'active', 'pending', 'pending', 'pending', 'pending'])
  })

  // job이 없으면 단계를 단정하지 않는다 — 화면은 "진행 중"으로만 말한다.
  it('claims nothing when there is no job to read', () => {
    expect(stepStates(null).every((state) => state === 'pending')).toBe(true)
    expect(stepStates('UNKNOWN_PHASE').every((state) => state === 'pending')).toBe(true)
  })
})

describe('formatElapsed', () => {
  it('drops the minute part under a minute', () => {
    expect(formatElapsed(45_000)).toBe('45초')
    expect(formatElapsed(516_000)).toBe('8분 36초')
  })
})
