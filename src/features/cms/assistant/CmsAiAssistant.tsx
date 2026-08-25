import { type FormEvent, useId, useState } from 'react'
import type { RouteId } from '../../../app/routes'

type AssistedRoute = Exclude<RouteId, 'members'>

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
    className="sticky top-[86px] flex min-h-[620px] flex-col items-center gap-3 overflow-hidden rounded-[22px] border border-[#d9deea] bg-white px-3 py-4 shadow-[0_18px_55px_rgba(32,39,63,.12)] max-[1179px]:static max-[1179px]:min-h-0 max-[1179px]:flex-row"
    aria-label={`${profile.section} 자연어 도우미`}
  >
    <button
      type="button"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#ded9ff] bg-[#f5f3ff] text-xl font-bold text-purple transition hover:border-[#bdb3fa] hover:bg-[#ede9ff]"
      onClick={onToggle}
      aria-expanded="false"
      aria-label={`${profile.title} 패널 펼치기`}
    >‹</button>
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#7663f2,#4c36ce)] text-lg text-white shadow-[0_8px_22px_rgba(105,87,232,.24)]" aria-hidden="true">✦</span>
    <strong className="mt-2 text-xs tracking-[.08em] text-[#4b5263] [writing-mode:vertical-rl] max-[1179px]:mt-0 max-[1179px]:[writing-mode:horizontal-tb]">{profile.title}</strong>
    <span className="mt-auto h-2 w-2 rounded-full bg-[#19aa7d] shadow-[0_0_0_4px_rgba(25,170,125,.12)] max-[1179px]:ml-auto max-[1179px]:mt-0" aria-label="화면 컨텍스트 준비됨" />
  </aside>

  return <aside
    className="sticky top-[86px] flex h-[calc(100vh-110px)] min-h-[620px] flex-col overflow-hidden rounded-[22px] border border-[#d9deea] bg-[#f8f9fc] shadow-[0_22px_70px_rgba(32,39,63,.14)]"
    aria-label={`${profile.section} 자연어 도우미`}
  >
    <header className="relative overflow-hidden border-b border-[#e4e7ef] bg-white px-5 pb-4 pt-5">
      <div className="absolute -right-10 -top-14 h-36 w-36 rounded-full bg-[#ece8ff] blur-2xl" aria-hidden="true" />
      <div className="relative flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#7663f2,#4c36ce)] text-lg text-white shadow-[0_8px_22px_rgba(105,87,232,.28)]" aria-hidden="true">✦</span>
        <div className="min-w-0 flex-1">
          <span className="block text-[9px] font-extrabold tracking-[.16em] text-purple">AX AI COPILOT</span>
          <h2 className="mb-0 mt-1 text-[17px] tracking-[-.02em]">{profile.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#ded9ff] bg-[#f5f3ff] px-2.5 py-1 text-[9px] font-extrabold tracking-[.08em] text-purple">MOCKUP</span>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#e0e3eb] bg-white/80 text-lg font-bold text-[#6f7687] transition hover:border-[#c9c1f7] hover:bg-[#f6f4ff] hover:text-purple"
            onClick={onToggle}
            aria-expanded="true"
            aria-label={`${profile.title} 패널 접기`}
          >›</button>
        </div>
      </div>
      <div className="relative mt-4 flex items-center gap-2 text-[10px] font-bold text-[#657087]">
        <span className="h-2 w-2 rounded-full bg-[#19aa7d] shadow-[0_0_0_4px_rgba(25,170,125,.12)]" aria-hidden="true" />
        화면 컨텍스트 준비됨
      </div>
    </header>

    <div className="border-b border-[#e4e7ef] bg-[#f4f1ff] px-5 py-4">
      <div className="flex items-center gap-2 text-[11px] font-extrabold text-[#4f3dcc]">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-xs shadow-sm" aria-hidden="true">⌁</span>
        현재 화면 전용
      </div>
      <p className="mb-0 mt-2 text-xs font-bold leading-5 text-[#2b3140]"><strong className="text-purple">{profile.section}</strong>에서 제공하는 기능만 자연어로 다룹니다.</p>
      <p className="mb-0 mt-1 text-[11px] leading-5 text-[#6e7586]">{profile.excluded}</p>
    </div>

    <div className="cms-ai-scrollbar flex-1 overflow-y-auto px-4 py-5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#ece9ff] text-xs font-black text-purple" aria-hidden="true">AX</span>
        <div className="rounded-2xl rounded-tl-md border border-[#e1e5ed] bg-white px-4 py-3 shadow-[0_6px_20px_rgba(35,43,66,.06)]">
          <p className="m-0 text-xs font-bold leading-5 text-[#242a38]">{profile.description}</p>
          <p className="mb-0 mt-2 text-[11px] leading-5 text-[#737b8d]">요청을 먼저 제안으로 만들고, 적용 전 변경 범위를 다시 확인하게 됩니다.</p>
        </div>
      </div>

      <section className="mt-5 rounded-2xl border border-[#e3e6ee] bg-white p-4" aria-label="현재 화면에서 가능한 작업">
        <div className="flex items-center gap-2"><span className="text-xs" aria-hidden="true">✓</span><h3 className="m-0 text-[11px] font-extrabold text-[#32394a]">이 화면에서 할 수 있어요</h3></div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {profile.capabilities.map((item) => <span key={item} className="rounded-full border border-[#e2defa] bg-[#f7f5ff] px-2.5 py-1.5 text-[10px] font-bold text-[#5b4acb]">{item}</span>)}
        </div>
      </section>

      <section className="mt-5" aria-label="추천 요청">
        <div className="mb-2 flex items-center"><h3 className="m-0 text-[11px] font-extrabold text-[#4b5365]">이렇게 요청해 보세요</h3><span className="ml-auto text-[9px] font-bold text-[#969dad]">클릭하여 입력</span></div>
        <div className="grid gap-2">
          {profile.suggestions.map((suggestion) => <button
            key={suggestion}
            type="button"
            className="group flex items-center gap-2 rounded-xl border border-[#e1e5ed] bg-white px-3 py-2.5 text-left text-[11px] font-bold leading-5 text-[#525a6c] transition hover:border-[#c8c0fb] hover:bg-[#faf9ff] hover:text-[#4f3dcc]"
            onClick={() => setDraft(suggestion)}
          ><span className="text-purple transition group-hover:translate-x-0.5" aria-hidden="true">↗</span>{suggestion}</button>)}
        </div>
      </section>

      {preview && <div className="mt-5 grid gap-3" aria-live="polite">
        <div className="ml-8 rounded-2xl rounded-tr-md bg-purple px-4 py-3 text-xs font-bold leading-5 text-white shadow-[0_8px_24px_rgba(105,87,232,.2)]">{preview}</div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#ece9ff] text-xs font-black text-purple" aria-hidden="true">AX</span>
          <div className="rounded-2xl rounded-tl-md border border-[#e1e5ed] bg-white px-4 py-3 text-[11px] leading-5 text-[#687083]">
            요청이 <strong className="text-[#333a4b]">{profile.section}</strong> 범위인지 확인하는 목업입니다. 실제 데이터 변경은 아직 연결되지 않았습니다.
          </div>
        </div>
      </div>}
    </div>

    <form className="border-t border-[#e1e5ed] bg-white p-4" onSubmit={submit}>
      <label className="sr-only" htmlFor={inputId}>{profile.section} 자연어 요청</label>
      <div className="rounded-2xl border border-[#d8dce7] bg-white p-2.5 shadow-[0_8px_24px_rgba(31,38,58,.08)] focus-within:border-[#9587ed] focus-within:ring-4 focus-within:ring-[#ece9ff]">
        <textarea
          id={inputId}
          className="min-h-16 w-full resize-none border-0 bg-transparent px-1.5 py-1 text-xs leading-5 text-[#2a3040] outline-none placeholder:text-[#9ca3b2]"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`${profile.section} 작업을 자연어로 입력하세요`}
        />
        <div className="mt-1 flex items-center gap-2">
          <span className="mr-auto px-1 text-[9px] font-bold text-[#9aa1af]">제안 미리보기 · 실행 안 됨</span>
          <button className="grid h-8 w-8 place-items-center rounded-xl bg-purple text-sm font-bold text-white shadow-[0_6px_16px_rgba(105,87,232,.24)] enabled:hover:bg-purple-dark" type="submit" disabled={!draft.trim()} aria-label="요청 범위 미리보기">↑</button>
        </div>
      </div>
      <p className="mb-0 mt-2 text-center text-[9px] leading-4 text-[#959cab]">목업 화면입니다. 저장·수정·삭제 API를 호출하지 않습니다.</p>
    </form>
  </aside>
}
