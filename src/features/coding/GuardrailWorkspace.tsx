import { useCallback, useEffect, useRef, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import {
  Callout, PageHead, PanelTitle, fieldLabel, panel, primaryButton, secondaryButton, smallButton,
} from '../../shared/ui/primitives'
import type {
  CodingConsoleApiClient, GuardrailRepository, GuardrailRules, GuardrailSelection,
} from './api'

/**
 * E5, the fence (GUIDE-LLM-DEVOPS-4/6-울타리.md · 7-화면.md).
 *
 * The pipeline only checks a changed path when a folder has been allowed: an empty allow-list
 * means every path passes, not that none do. So an unconfigured system is not a locked one,
 * and this screen exists to say that out loud and let it be fixed.
 *
 * Both repositories are fenced here even though only backend jobs run today, so a frontend job
 * never starts unfenced later. The folders themselves are never stored: they are read from
 * origin/dev by the runner on request, so a deleted folder cannot stay allowed by an old list
 * and one created later starts out off.
 */

const REPOSITORIES: GuardrailRepository[] = ['frontend', 'backend']

const REPOSITORY_TITLES: Record<GuardrailRepository, string> = {
  frontend: '프론트엔드',
  backend: '백엔드',
}

/** Scanned paths carry the repository's own prefix; the short name is what a person reads. */
const SHORT_PREFIXES: Record<GuardrailRepository, string> = {
  frontend: 'src/',
  backend: 'src/main/java/org/urizo/axmodulestudio/backend/',
}

/**
 * Labels for the folders we know. The two cms entries come from the guide (6-울타리.md 6-2);
 * the rest follow its naming shape. An unknown folder falls back to its short path, exactly as
 * the guide prescribes for a missing label.
 */
const LABELS: Record<string, string> = {
  'backend:cms': 'CMS 기능',
  'backend:core': '공통 기반',
  'backend:health': '상태 점검',
  'backend:integration': '외부 연동',
  'frontend:features/cms': 'CMS 화면',
  'frontend:app': '앱 뼈대',
  'frontend:shared/api': '서버 통신 공통',
  'frontend:shared/ui': '공통 화면 부품',
  'frontend:styles': '화면 스타일',
}

/**
 * The ⚠ tier of 7-화면.md: allowed, but only past an explicit confirmation, because a change
 * here touches every screen or every integration rather than one feature.
 */
const CAUTIONS: Record<string, string> = {
  'frontend:shared/api': '모든 화면이 서버와 통신하는 공용 통로입니다. 여기가 바뀌면 전 화면·전 통신에 영향이 갑니다.',
  'backend:integration': '외부 연동 공용 통로입니다. 여기가 바뀌면 여러 기능의 통신에 영향이 갑니다.',
}

/**
 * A scan is a queued runner command. It waits rather than fails when no runner is up, so the
 * screen stops waiting on its own and says which of the two it is.
 */
const SCAN_POLL_MS = 2_000
const SCAN_TIMEOUT_MS = 60_000

type ScanState =
  | { phase: 'idle' }
  | { phase: 'scanning' }
  | { phase: 'scanned'; folders: string[]; sha?: string }
  | { phase: 'stalled' }
  | { phase: 'failed'; message: string }

interface RepositoryState {
  stored: GuardrailSelection[] | null
  allowed: Set<string>
  scan: ScanState
}

const initialRepository: RepositoryState = { stored: null, allowed: new Set(), scan: { phase: 'idle' } }

function shortName(repository: GuardrailRepository, path: string): string {
  const prefix = SHORT_PREFIXES[repository]
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function labelFor(repository: GuardrailRepository, path: string): string {
  return LABELS[`${repository}:${shortName(repository, path)}`] ?? shortName(repository, path)
}

function cautionFor(repository: GuardrailRepository, path: string): string | undefined {
  return CAUTIONS[`${repository}:${shortName(repository, path)}`]
}

export default function GuardrailWorkspace({ api }: { api: CodingConsoleApiClient }) {
  const [repos, setRepos] = useState<Record<GuardrailRepository, RepositoryState>>({
    frontend: initialRepository,
    backend: initialRepository,
  })
  const [rules, setRules] = useState<GuardrailRules | null>(null)
  const [draftRules, setDraftRules] = useState<GuardrailRules | null>(null)
  /** The ⚠ folder whose confirmation is open, at most one at a time. */
  const [confirming, setConfirming] = useState<{ repository: GuardrailRepository; path: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  /* Reset on every run, not only declared once: React mounts, unmounts and remounts a component
   * in development, and a flag that is only ever set true would discard every later response. */
  const cancelled = useRef(false)
  const started = useRef(false)

  const patch = useCallback((repository: GuardrailRepository, part: Partial<RepositoryState>) => {
    setRepos((current) => ({ ...current, [repository]: { ...current[repository], ...part } }))
  }, [])

  const load = useCallback(async (repository: GuardrailRepository) => {
    try {
      const list = await api.guardrailSelections(repository)
      if (cancelled.current) return
      patch(repository, {
        stored: list.selections,
        allowed: new Set(list.selections.filter((item) => item.enabled).map((item) => item.path)),
      })
    }
    catch (error) {
      if (!cancelled.current) setFailure(describeFailure(error))
    }
  }, [api, patch])

  const runScan = useCallback(async (repository: GuardrailRepository) => {
    setSaved(false)
    patch(repository, { scan: { phase: 'scanning' } })
    try {
      const accepted = await api.startGuardrailScan(repository)
      const deadline = Date.now() + SCAN_TIMEOUT_MS
      while (!cancelled.current) {
        const result = await api.guardrailScan(accepted.scanId, repository)
        if (cancelled.current) return
        if (result.status === 'SUCCEEDED') {
          patch(repository, { scan: { phase: 'scanned', folders: result.folders, sha: result.sha } })
          return
        }
        if (result.status === 'FAILED') {
          patch(repository, {
            scan: {
              phase: 'failed',
              message: result.errorCode
                ? `폴더를 읽지 못했습니다. (${result.errorCode})`
                : '폴더를 읽지 못했습니다.',
            },
          })
          return
        }
        if (Date.now() >= deadline) {
          patch(repository, { scan: { phase: 'stalled' } })
          return
        }
        await new Promise((resume) => setTimeout(resume, SCAN_POLL_MS))
      }
    }
    catch (error) {
      if (!cancelled.current) patch(repository, { scan: { phase: 'failed', message: describeFailure(error) } })
    }
  }, [api, patch])

  /*
   * Opening the screen reads everything straight away. The stored choice arrives first and is
   * shown while the scans run, so the fence is legible immediately even when the runner is down
   * and a scan never returns. The buttons are for reading again, not for the first read.
   */
  useEffect(() => {
    cancelled.current = false
    if (!started.current) {
      started.current = true
      void (async () => {
        await Promise.all(REPOSITORIES.map((repository) => load(repository)))
        if (cancelled.current) return
        try {
          const stored = await api.guardrailRules()
          if (!cancelled.current) { setRules(stored); setDraftRules(stored) }
        }
        catch (error) {
          if (!cancelled.current) setFailure(describeFailure(error))
        }
        if (cancelled.current) return
        await Promise.all(REPOSITORIES.map((repository) => runScan(repository)))
      })()
    }
    return () => { cancelled.current = true }
  }, [api, load, runScan])

  function foldersOf(repository: GuardrailRepository): string[] {
    const state = repos[repository]
    return state.scan.phase === 'scanned'
      ? state.scan.folders
      : state.stored?.map((item) => item.path) ?? []
  }

  function storedAllowed(repository: GuardrailRepository): string[] {
    return repos[repository].stored?.filter((item) => item.enabled).map((item) => item.path) ?? []
  }

  const totalAllowed = REPOSITORIES.reduce((sum, repository) => sum + repos[repository].allowed.size, 0)
  const totalStored = REPOSITORIES.reduce((sum, repository) => sum + storedAllowed(repository).length, 0)
  const selectionsChanged = REPOSITORIES.some((repository) => {
    if (repos[repository].stored === null) return false
    const before = new Set(storedAllowed(repository))
    const after = repos[repository].allowed
    return before.size !== after.size || [...after].some((path) => !before.has(path))
  })
  const rulesChanged = rules !== null && draftRules !== null && (
    rules.allowNewDependency !== draftRules.allowNewDependency
    || rules.maxChangedFiles !== draftRules.maxChangedFiles
    || rules.maxChangedLines !== draftRules.maxChangedLines
  )
  const changed = selectionsChanged || rulesChanged

  function toggle(repository: GuardrailRepository, path: string) {
    setSaved(false)
    setConfirming(null)
    const state = repos[repository]
    if (!state.allowed.has(path) && cautionFor(repository, path)) {
      // The ⚠ tier: turning it on needs a spelled-out yes, turning it off never does.
      setConfirming({ repository, path })
      return
    }
    const next = new Set(state.allowed)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    patch(repository, { allowed: next })
  }

  function confirmCaution() {
    if (!confirming) return
    const next = new Set(repos[confirming.repository].allowed)
    next.add(confirming.path)
    patch(confirming.repository, { allowed: next })
    setConfirming(null)
  }

  async function save() {
    setSaving(true)
    setFailure(null)
    try {
      for (const repository of REPOSITORIES) {
        if (repos[repository].stored === null) continue
        // Every listed folder is sent, allowed or not: the server replaces the whole choice,
        // so sending only the ticked ones would silently drop the rest.
        const list = await api.saveGuardrailSelections(
          repository,
          foldersOf(repository).map((path) => ({
            path,
            enabled: repos[repository].allowed.has(path),
            label: labelFor(repository, path),
          })),
        )
        if (cancelled.current) return
        patch(repository, {
          stored: list.selections,
          allowed: new Set(list.selections.filter((item) => item.enabled).map((item) => item.path)),
        })
      }
      if (rulesChanged && draftRules) {
        const storedRules = await api.saveGuardrailRules(draftRules)
        if (cancelled.current) return
        setRules(storedRules)
        setDraftRules(storedRules)
      }
      setSaved(true)
    }
    catch (error) {
      if (!cancelled.current) setFailure(describeFailure(error))
    }
    finally {
      if (!cancelled.current) setSaving(false)
    }
  }

  const anyLoaded = REPOSITORIES.some((repository) => repos[repository].stored !== null)
  /* Both sides now take requests, so this is no longer a backend-only warning. A side with
   * nothing ticked is refused at intake - the server reads the sentence, sees the side it
   * belongs to is closed, and turns the request down before any work starts. */
  const closedSides = totalAllowed > 0
    ? REPOSITORIES.filter((repository) => repos[repository].allowed.size === 0)
    : []

  return <>
    <PageHead
      title="울타리 설정"
      description="AI 가 들어갈 수 있는 폴더를 정합니다. 여기 없는 곳은 건드릴 수 없고, 로그인·DB 구조·AI 통제 장치는 아예 목록에 나오지 않습니다."
    />

    {/* The reason this screen exists. An empty list reads as "no restriction" to the
      * pipeline, so nothing is protecting the repositories until a folder is ticked. */}
    {anyLoaded && totalStored === 0 && <div className="mt-[0.875rem]">
      <Callout tone="warn" icon="triangle-alert">
        허용된 폴더가 없습니다. 지금은 AI 가 저장소의 어느 파일이든 고칠 수 있습니다.
        아래에서 허용할 폴더를 정하고 저장해 주세요.
      </Callout>
    </div>}

    {closedSides.length > 0 && <div className="mt-[0.875rem]">
      <Callout tone="warn" icon="triangle-alert">
        {closedSides.map((repository) => REPOSITORY_TITLES[repository]).join(' · ')} 쪽
        허용 폴더가 없습니다. 이대로 저장하면 그 쪽 요청은 접수 단계에서 거절됩니다.
      </Callout>
    </div>}

    {failure && <div className="mt-[0.875rem]">
      <Callout tone="warn" icon="triangle-alert">{failure}</Callout>
    </div>}

    {saved && <div className="mt-[0.875rem]">
      <Callout tone="ok" icon="check">저장했습니다. 다음 요청부터 이 울타리가 적용됩니다.</Callout>
    </div>}

    <div className="mt-[0.875rem] grid gap-[0.875rem] lg:grid-cols-2">
      {REPOSITORIES.map((repository) => {
        const state = repos[repository]
        const folders = foldersOf(repository)
        return <section key={repository} className={panel}>
          <PanelTitle
            title={`📁 ${REPOSITORY_TITLES[repository]}`}
            sub={state.stored === null
              ? '불러오는 중입니다…'
              : storedAllowed(repository).length === 0
                ? '허용된 폴더 없음 · 이 쪽 요청은 접수에서 거절됩니다'
                : `${storedAllowed(repository).length}개 허용됨`}
          >
            <button
              type="button"
              className={smallButton}
              disabled={state.scan.phase === 'scanning'}
              onClick={() => void runScan(repository)}
            >{state.scan.phase === 'scanning' ? '읽는 중…' : '다시 읽기'}</button>
          </PanelTitle>

          <div className="px-4 pb-4 pt-[0.375rem]">
            {state.scan.phase === 'stalled' && <div className="mb-[0.875rem]">
              <Callout tone="warn" icon="triangle-alert">
                실행기가 응답하지 않습니다. 폴더 목록은 실행기가 읽어 오기 때문에, 실행기가
                꺼져 있으면 여기서 기다리기만 합니다. 실행기를 켠 뒤 다시 읽어 주세요.
              </Callout>
            </div>}
            {state.scan.phase === 'failed' && <div className="mb-[0.875rem]">
              <Callout tone="warn" icon="triangle-alert">{state.scan.message}</Callout>
            </div>}
            {state.scan.phase === 'scanned' && state.scan.sha && <p className="mb-[0.625rem] text-[0.6875rem] text-muted-2">
              기준 커밋 <span className="font-mono text-body">{state.scan.sha.slice(0, 12)}</span> 에서 읽은 목록입니다.
            </p>}

            {state.stored !== null && folders.length === 0
              ? <p className="text-[0.71875rem] leading-5 text-muted-2">
                {state.scan.phase === 'scanned'
                  ? '읽어 온 폴더가 없습니다.'
                  : '아직 폴더를 읽지 못했습니다.'}
              </p>
              : <ul className="max-h-[22rem] overflow-y-auto">
                {folders.map((path) => {
                  const caution = cautionFor(repository, path)
                  const isConfirming = confirming?.repository === repository && confirming.path === path
                  return <li key={path} className="border-b border-row-line">
                    <label className="flex cursor-pointer items-center gap-[0.5625rem] py-[0.4375rem]">
                      <input
                        type="checkbox"
                        checked={state.allowed.has(path)}
                        onChange={() => toggle(repository, path)}
                        disabled={saving}
                      />
                      <span className="text-[0.78125rem] text-body">
                        {caution && <span title="전체에 영향을 주는 폴더" aria-hidden="true">⚠ </span>}
                        {labelFor(repository, path)}
                      </span>
                      <span className="ml-auto font-mono text-[0.625rem] text-muted-3">{shortName(repository, path)}</span>
                    </label>
                    {isConfirming && caution && <div className="mb-[0.4375rem]">
                      <Callout tone="warn" icon="triangle-alert">
                        {caution}
                        <span className="mt-[0.5rem] flex gap-2">
                          <button type="button" className={smallButton} onClick={confirmCaution}>알고 있습니다. 허용합니다</button>
                          <button type="button" className={smallButton} onClick={() => setConfirming(null)}>취소</button>
                        </span>
                      </Callout>
                    </div>}
                  </li>
                })}
              </ul>}
          </div>
        </section>
      })}
    </div>

    {/* 6-울타리.md 6-6: rules that name no path. Build and test success are shown, not
      * offered — the pipeline requires them unconditionally and a stored toggle could only
      * contradict that. */}
    <section className={`${panel} mt-[0.875rem]`}>
      <PanelTitle title="부가 규칙" sub="폴더와 무관하게 결과물 전체에 적용됩니다" />
      <div className="px-4 pb-4 pt-[0.375rem]">
        {draftRules === null
          ? <p className="text-[0.71875rem] text-muted-2">불러오는 중입니다…</p>
          : <div className="grid gap-[0.625rem]">
            <label className="flex cursor-pointer items-center gap-[0.5625rem]">
              <input
                type="checkbox"
                checked={draftRules.allowNewDependency}
                onChange={() => { setSaved(false); setDraftRules({ ...draftRules, allowNewDependency: !draftRules.allowNewDependency }) }}
                disabled={saving}
              />
              <span className="text-[0.78125rem] text-body">새 라이브러리 추가 허용</span>
              <span className="text-[0.6875rem] text-muted-2">꺼져 있으면 AI 는 이미 있는 것으로만 만듭니다</span>
            </label>
            <div className="flex flex-wrap items-end gap-4">
              <label>
                <span className={fieldLabel}>변경 파일 수 상한</span>
                <input
                  type="number"
                  min={1}
                  className="mt-[0.375rem] block h-8 w-[8rem] rounded-[0.3125rem] border border-field-line bg-white px-[0.625rem] text-[0.78125rem] text-ink outline-0"
                  placeholder="무제한"
                  value={draftRules.maxChangedFiles ?? ''}
                  onChange={(event) => {
                    setSaved(false)
                    const value = event.target.value
                    setDraftRules({ ...draftRules, maxChangedFiles: value === '' ? null : Math.max(1, Number(value)) })
                  }}
                  disabled={saving}
                />
              </label>
              <label>
                <span className={fieldLabel}>변경 줄 수 상한</span>
                <input
                  type="number"
                  min={1}
                  className="mt-[0.375rem] block h-8 w-[8rem] rounded-[0.3125rem] border border-field-line bg-white px-[0.625rem] text-[0.78125rem] text-ink outline-0"
                  placeholder="무제한"
                  value={draftRules.maxChangedLines ?? ''}
                  onChange={(event) => {
                    setSaved(false)
                    const value = event.target.value
                    setDraftRules({ ...draftRules, maxChangedLines: value === '' ? null : Math.max(1, Number(value)) })
                  }}
                  disabled={saving}
                />
              </label>
            </div>
            <p className="text-[0.71875rem] leading-5 text-muted-2">
              ☑ 빌드 통과 필수 · ☑ 테스트 통과 필수 — 항상 켜져 있으며 끌 수 없습니다.
            </p>
          </div>}
      </div>
    </section>

    <div className="mt-[0.875rem] flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={primaryButton}
        disabled={saving || !anyLoaded || !changed}
        onClick={() => void save()}
      >{saving ? '저장하는 중입니다…' : '저장'}</button>
      {changed && <span className="text-[0.6875rem] text-muted-2">저장하지 않은 변경이 있습니다.</span>}
    </div>
  </>
}
