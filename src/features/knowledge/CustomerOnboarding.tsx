import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { describeFailure } from '../../shared/api/error'
import type { AdminRole } from '../../shared/api/session'
import { PanelTitle, panel, control, primaryButton, secondaryButton } from '../../shared/ui/primitives'
import type { KnowledgeAdminApi } from './admin-api'
import type { KnowledgeBase, Project } from './admin-types'
import { RagAdminPanel } from './RagAdminPanel'

/**
 * RAG 라우트 진입점. 온보딩 패널이 고객사를 만들면 아래 관리 패널을 리마운트해
 * 새 프로젝트가 목록에 바로 보이게 한다 — RagAdminPanel 내부를 건드리지 않는
 * 가장 작은 갱신 방법이다(AI02-016과의 파일 충돌 회피이기도 하다).
 */
export function RagRoute({ api, role }: { api: KnowledgeAdminApi; role: AdminRole }) {
  const [epoch, setEpoch] = useState(0)
  return <>
    <CustomerOnboarding api={api} role={role} onCreated={() => setEpoch((value) => value + 1)} />
    <RagAdminPanel key={epoch} api={api} role={role} />
  </>
}

/**
 * 새 고객사 묶음 생성(AI02-017): 프로젝트 → 지식베이스 → 챗봇을 한 번에 만든다.
 *
 * <p>셋은 별도 계약이지만 하나라도 빠지면 다음 단계가 막힌다 — 지식베이스가 없으면
 * 빌드가, 챗봇이 없으면 포털 연결이 안 된다. 그래서 화면에서는 "고객사 등록" 한 동작이다.
 *
 * <p>중간 실패는 만들어진 것을 버리지 않는다. 어느 단계까지 됐는지 보여주고 이어서
 * 재시도한다 — 프로젝트만 생기고 멈춘 상태를 사람이 API로 수습하게 만들지 않는다.
 */
/**
 * 포털 연결(촬영용 임시). 등록된 프로젝트를 같은 브라우저의 공개 포털이 바로 쓰도록
 * 기록한다 — 관리자 화면과 포털이 같은 SPA·같은 오리진이라 성립한다. 다른 기기
 * 방문자에게는 보이지 않으므로 정식 답은 slug의 프로젝트 속성 승격이다.
 *
 * <p>키 형식은 {@code site/portal-projects.ts}의 {@code portalProjectKey}와 같다 —
 * AI02-010·017 두 브랜치가 dev에서 만나면 import로 바꾼다.
 */
const PORTAL_SLUGS = [
  { value: '', label: '연결 안 함' },
  { value: 'sme', label: '/sme — 지원사업 포털' },
]

function portalProjectKey(slug: string): string {
  return `axms-portal-project:${slug}`
}

export function CustomerOnboarding({ api, role, onCreated }: {
  api: KnowledgeAdminApi
  role: AdminRole
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [portalSlug, setPortalSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [chatbotId, setChatbotId] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ step: string; detail: string } | null>(null)

  // 생성 계약 셋 다 SUPER_ADMIN 전용이다(SecurityConfig). 권한 없는 화면에 버튼을 그리지 않는다.
  if (role !== 'SUPER_ADMIN') return null

  const done = project !== null && knowledgeBase !== null && chatbotId !== null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy || done) return
    setBusy(true)
    setFailure(null)
    // 이미 만들어진 단계는 건너뛴다 — 재시도가 중복 프로젝트를 만들지 않게 하는 장치다.
    let createdProject = project
    try {
      if (!createdProject) {
        createdProject = await api.createProject(trimmed, description.trim() || undefined)
        setProject(createdProject)
      }
    }
    catch (error) {
      setFailure({ step: '프로젝트 생성', detail: describeFailure(error) })
      setBusy(false)
      return
    }
    let createdBase = knowledgeBase
    try {
      if (!createdBase) {
        createdBase = await api.createKnowledgeBase(createdProject.projectId, trimmed)
        setKnowledgeBase(createdBase)
      }
    }
    catch (error) {
      setFailure({ step: '지식베이스 생성', detail: describeFailure(error) })
      setBusy(false)
      return
    }
    try {
      const chatbot = await api.createChatbot(
        createdProject.projectId, `${trimmed} 챗봇`, createdBase.knowledgeBaseId)
      setChatbotId(chatbot.chatbotId)
      if (portalSlug) {
        try { window.localStorage.setItem(portalProjectKey(portalSlug), createdProject.projectId) }
        catch { /* 저장소가 막혀도 등록 자체는 성공이다 — 딥링크가 남는다 */ }
      }
      onCreated()
    }
    catch (error) {
      setFailure({ step: '챗봇 생성', detail: describeFailure(error) })
    }
    finally {
      setBusy(false)
    }
  }

  function reset() {
    setOpen(false)
    setName('')
    setDescription('')
    setPortalSlug('')
    setProject(null)
    setKnowledgeBase(null)
    setChatbotId(null)
    setFailure(null)
  }

  if (!open) {
    return <button
      type="button"
      onClick={() => setOpen(true)}
      className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-line px-4 py-3 text-xs font-semibold text-muted-2 hover:border-primary hover:text-primary"
    >+ 새 고객사 등록</button>
  }

  return <section className={`${panel} mb-3 p-4`} aria-label="새 고객사 등록">
    <PanelTitle title="새 고객사 등록" sub="프로젝트·지식베이스·챗봇이 한 번에 만들어집니다" />
    {done
      ? <div className="grid gap-2 text-xs text-body" data-testid="onboarding-done">
        <p className="m-0 font-semibold text-ink">"{name.trim()}" 등록 완료</p>
        <p className="m-0 text-muted-2">프로젝트 {project.projectId}</p>
        <p className="m-0 text-muted-2">지식베이스 {knowledgeBase.knowledgeBaseId} · 챗봇 {chatbotId}</p>
        {/* 고객사가 2건 이상이면 관리 패널이 자동 선택을 멈추므로(resolveTarget), 링크에 대상을 실어 준다. */}
        <p className="m-0">다음: <Link
          className="font-semibold text-primary underline"
          onClick={reset}
          to={`/admin/rag?projectId=${project.projectId}&knowledgeBaseId=${knowledgeBase.knowledgeBaseId}`}
        >이 고객사의 커넥터(API 연결정보) 등록</Link>으로 이동해 빌드를 실행하세요.</p>
        {portalSlug && <p className="m-0">포털: <a
          className="font-semibold text-primary underline"
          href={`/${portalSlug}?project=${project.projectId}`}
          target="_blank" rel="noreferrer"
        >/{portalSlug} 열기 ↗</a> — 같은 브라우저에서는 주소창에 /{portalSlug}만 입력해도 이 고객사로 연결됩니다.</p>}
        <div><button type="button" className={secondaryButton} onClick={reset}>닫기</button></div>
      </div>
      : <form onSubmit={submit} className="grid max-w-xl gap-3">
        <label className="text-[0.71875rem] font-semibold text-muted-2">고객사 이름
          <input className={control} value={name} onChange={(event) => setName(event.target.value)}
            placeholder="예: 중기부 지원사업" required maxLength={120} disabled={busy || project !== null} />
        </label>
        <label className="text-[0.71875rem] font-semibold text-muted-2">설명 (선택)
          <input className={control} value={description} onChange={(event) => setDescription(event.target.value)}
            placeholder="예: 중소기업 지원사업 공고 검색·챗봇" maxLength={2000} disabled={busy || project !== null} />
        </label>
        <label className="text-[0.71875rem] font-semibold text-muted-2">사용자 포털 경로 (선택)
          <select className={control} value={portalSlug}
            onChange={(event) => setPortalSlug(event.target.value)} disabled={busy || project !== null}>
            {PORTAL_SLUGS.map((slug) => <option key={slug.value} value={slug.value}>{slug.label}</option>)}
          </select>
        </label>
        {failure && <p className="m-0 text-xs text-danger" role="alert">
          {failure.step} 실패 — {failure.detail}
          {project && ' (이미 만들어진 단계는 건너뛰고 이어서 진행합니다)'}
        </p>}
        <div className="flex gap-2">
          <button type="submit" className={primaryButton} disabled={busy || !name.trim()}>
            {busy ? '등록 중…' : failure && project ? '이어서 재시도' : '고객사 등록'}
          </button>
          <button type="button" className={secondaryButton} onClick={reset} disabled={busy}>취소</button>
        </div>
      </form>}
  </section>
}
