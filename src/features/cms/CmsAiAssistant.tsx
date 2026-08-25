import { type FormEvent, useId, useState } from 'react'
import type { CmsRouteId } from '../../app/routes'
import { Icon } from '../../shared/ui/icons'
import { Badge, panel, primaryButton, secondaryButton, textarea } from '../../shared/ui/primitives'

type AssistedRoute = Exclude<CmsRouteId, 'members'>

type AssistantProfile = {
  section: string
  title: string
  description: string
  capabilities: string[]
  excluded: string
  suggestions: string[]
}

const profiles: Record<AssistedRoute, AssistantProfile> = {
  menus: {
    section: '메뉴 관리',
    title: '메뉴 AI',
    description: '메뉴 구조와 연결 상태를 자연어로 정리해 보세요.',
    capabilities: ['메뉴 등록·수정', '상·하위 구조', '노출 순서', '콘텐츠·게시판 연결'],
    excluded: '컨텐츠 본문, 게시글, 템플릿은 변경하지 않아요.',
    suggestions: ['Products 아래에 새 메뉴를 추가해 줘', '연결되지 않은 메뉴만 찾아줘', '하위 메뉴 노출 순서를 정리해 줘'],
  },
  contents: {
    section: '컨텐츠 관리',
    title: '컨텐츠 AI',
    description: '정적 페이지의 제목과 본문 초안을 빠르게 다듬어 보세요.',
    capabilities: ['컨텐츠 등록·수정', '제목·본문 편집', '문단·목록 서식', '삭제 전 확인'],
    excluded: '메뉴 구조, 게시판·게시글, 템플릿은 변경하지 않아요.',
    suggestions: ['선택한 컨텐츠를 세 문단으로 정리해 줘', '제목을 더 명확하게 다듬어 줘', '새 안내 페이지 초안을 만들어 줘'],
  },
  boards: {
    section: '게시판 관리',
    title: '게시판 AI',
    description: '게시판과 게시글 작성 작업을 현재 화면 안에서 도와드려요.',
    capabilities: ['게시판 등록·수정', '게시글 작성·편집', '제목·본문 정리', '삭제 전 확인'],
    excluded: '메뉴 연결, 정적 컨텐츠, 템플릿은 변경하지 않아요.',
    suggestions: ['공지사항 게시판 설명을 작성해 줘', '선택한 게시글 제목을 다듬어 줘', '게시글 본문을 읽기 쉽게 정리해 줘'],
  },
  templates: {
    section: '템플릿 관리',
    title: '템플릿 AI',
    description: '사용자 사이트의 공통 디자인 설정을 자연어로 조정해 보세요.',
    capabilities: ['레이아웃 선택', '브랜드 색상', 'Header·Footer', '메인 이미지·문구·버튼'],
    excluded: '메뉴, 컨텐츠 본문, 게시판·게시글은 변경하지 않아요.',
    suggestions: ['대표 색상을 차분한 보라색으로 바꿔 줘', '메인 문구를 더 간결하게 다듬어 줘', 'Footer 문구를 전문적으로 정리해 줘'],
  },
}

export default function CmsAiAssistant({ route, collapsed, onToggle }: { route: AssistedRoute; collapsed: boolean; onToggle: () => void }) {
  const profile = profiles[route]
  const inputId = useId()
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const request = draft.trim()
    if (!request) return
    setPreview(request)
    setDraft('')
  }

  if (collapsed) return <aside
    className={`${panel} sticky top-[70px] flex flex-col items-center gap-3 px-2 py-3 max-[1239px]:static max-[1239px]:flex-row`}
    aria-label={`${profile.section} 자연어 도우미`}
  >
    <button
      type="button"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[5px] border border-btn-line bg-white text-base font-semibold text-muted hover:bg-sub"
      onClick={onToggle}
      aria-expanded="false"
      aria-label={`${profile.title} 패널 펼치기`}
    >‹</button>
    <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-teal-bg text-teal-fg" aria-hidden="true"><Icon name="bot" size={15} /></span>
    <strong className="text-[11.5px] font-semibold text-body [writing-mode:vertical-rl] max-[1239px]:[writing-mode:horizontal-tb]">{profile.title}</strong>
  </aside>

  return <aside
    className={`${panel} sticky top-[70px] flex max-h-[calc(100vh-90px)] flex-col overflow-hidden max-[1239px]:static max-[1239px]:max-h-none`}
    aria-label={`${profile.section} 자연어 도우미`}
  >
    <div className="flex items-center gap-[9px] border-b border-line-soft px-4 py-[14px]">
      <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-teal-bg text-teal-fg" aria-hidden="true"><Icon name="bot" size={15} /></span>
      <span className="min-w-0 flex-1">
        <h2 className="m-0 text-[13px] font-semibold">{profile.title}</h2>
        <small className="block text-[10.5px] text-muted-2">현재 화면 범위 전용 AI 패널</small>
      </span>
      <span className="rounded bg-teal-bg px-[7px] py-[2px] text-[10.5px] font-semibold text-teal-ink">AI</span>
      <button
        type="button"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[5px] border border-btn-line bg-white text-base font-semibold text-muted hover:bg-sub"
        onClick={onToggle}
        aria-expanded="true"
        aria-label={`${profile.title} 패널 접기`}
      >›</button>
    </div>

    <div className="cms-ai-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-[14px]">
      <div className="rounded-[5px] border border-line-soft bg-sub px-[11px] py-[10px] text-[11.5px] leading-[1.6] text-muted">
        <b className="font-semibold text-ink">현재 화면 전용</b> · 이 패널은 <b className="font-semibold text-ink">{profile.section}</b> 범위의 CMS 변경만 제안합니다.
        <span className="mt-[5px] block text-muted-2">{profile.excluded}</span>
      </div>

      <p className="mt-[14px] text-[11.5px] leading-[1.6] text-muted">{profile.description}</p>

      <div className="mt-[14px] flex flex-wrap gap-[6px]">
        {profile.capabilities.map((item) => <span key={item} className="rounded border border-[#d6e2e6] bg-[#f7fbfb] px-[7px] py-[3px] text-[10.5px] font-semibold text-[#3f7f86]">{item}</span>)}
      </div>

      <label className="mt-[14px] block text-[11.5px] font-semibold text-body" htmlFor={inputId}>자연어 요청</label>
      <textarea
        id={inputId}
        className={`${textarea} min-h-[76px]`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="CMS 변경 요청을 입력하세요"
      />

      <div className="mt-[9px] grid gap-[6px]">
        {profile.suggestions.map((suggestion) => <button
          key={suggestion}
          type="button"
          className="w-full rounded-[5px] border border-dashed border-[#d6e2e6] bg-[#f7fbfb] px-[10px] py-[9px] text-left text-[11.5px] leading-[1.5] text-[#3f7f86] hover:bg-[#eef7f8]"
          onClick={() => setDraft(suggestion)}
        >추천 요청: {suggestion}</button>)}
      </div>

      {preview && <div className="mt-4 border-t border-line-soft pt-[14px]" aria-live="polite">
        <div className="flex items-center gap-[7px]">
          <Badge tone="wait">승인 대기</Badge>
          <b className="text-[12.5px] font-semibold">변경 내용 확인</b>
        </div>
        <div className="mt-[10px] rounded-[5px] border border-line-soft bg-sub px-[11px] py-[10px]">
          <small className="block text-[10.5px] text-muted-3">변경 전</small>
          <span className="mt-[3px] block text-[11.5px] text-body">현재 {profile.section} 데이터</span>
        </div>
        <div className="mt-2 rounded-[5px] border border-[#dceae2] bg-[#f5faf7] px-[11px] py-[10px]">
          <small className="block text-[10.5px] text-[#79a08c]">변경 후 Mock</small>
          <span className="mt-[3px] block text-[11.5px] text-[#37725a]">{preview}</span>
        </div>
        <div className="mt-[14px] flex gap-2">
          <button type="button" className={`${secondaryButton} flex-1 justify-center`} onClick={() => setPreview(null)}>취소</button>
          <button type="button" className={`${primaryButton} flex-1 justify-center`} onClick={() => setPreview(null)}>승인하고 반영</button>
        </div>
      </div>}
    </div>

    <form className="border-t border-line-soft p-3" onSubmit={submit}>
      <button className={`${primaryButton} w-full justify-center`} type="submit" disabled={!draft.trim()}>요청 분석하기</button>
      <p className="mb-0 mt-2 text-center text-[10px] leading-4 text-muted-3">목업 화면입니다. 저장·수정·삭제 API를 호출하지 않습니다.</p>
    </form>
  </aside>
}
