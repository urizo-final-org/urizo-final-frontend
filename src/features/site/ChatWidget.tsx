import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRagQuery } from '../knowledge/useRagQuery'
import type { PublicCitation } from '../knowledge/types'
import { homepageLine } from './portal-meta'
import { describePortalStatus } from './portal-status'
import { Placeholder, SampleNotice } from './portal-primitives'

/**
 * 우하단 상시 노출 플로팅 챗봇. 버튼·패널 사양은 시안 `Portal-Chatbot.dc.html`을 따른다
 * (52px 원형 버튼 · 380×520 패널 · 14px radius).
 *
 * <p>공개 챗봇 API(`POST /api/public/chat/query`)에 실제로 연결돼 있다. 검색(A)과 **같은
 * 엔드포인트·같은 훅**을 쓰므로 상태 처리도 같다 — 다른 것은 결과를 말풍선으로 그린다는 것뿐이다.
 *
 * <p>**직전 한 턴까지 이어진다.** 질문과 함께 직전 질문을 `previousQuery`로 실어 보내고,
 * 백엔드는 둘을 합쳐 검색 임베딩만 만든다(`RagStore.searchText`). 그래서 "거기 주차 되나요?"처럼
 * 대명사만 남은 질문도 직전 주제의 문서를 찾아온다. 그 이상은 잇지 않는다 — 서버가 대화를
 * 저장하지 않으므로 두 턴 전은 사라진다.
 *
 * <p>`conversationId`는 여전히 보내지 않는다. 백엔드가 받아서 그대로 돌려주기만 할 뿐
 * 아무 것도 하지 않으므로, 보내면 "서버가 대화를 기억한다"는 잘못된 인상을 준다.
 *
 * <p>거절(REFUSED)은 오류가 아니다. 근거 섹션을 숨기고 문구만 바꾼다 — 경고색을 쓰지 않는다.
 */

/** 직전 한 턴만 다음 질문의 검색에 얹힌다. 두 턴 전은 서버가 보지 않는다. */
type Turn = {
  question: string
  answer?: string
  citations?: PublicCitation[]
  /** 답변 대신 보여줄 시스템 문구(거절·오류·제한). */
  notice?: { title: string; detail?: string; trace?: string }
}

/** 시안의 첫 화면 추천 질문. 코퍼스에 근거가 있는 질의만 둔다. */
const SUGGESTIONS = ['지금 하는 축제 알려줘', '전주 한옥스테이 추천']

function ChatGlyph({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z" />
  </svg>
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [locked, setLocked] = useState(false)
  const { state, ask } = useRagQuery()
  const scroller = useRef<HTMLDivElement>(null)

  const sending = state.phase === 'loading'

  // 429는 서버가 알려준 시간만큼 입력을 잠근다(F11: 60초/30회). 잠그지 않으면 사용자가
  // 계속 눌러 같은 429를 반복해 받고, 검색과 예산을 나눠 쓰는 구조라 검색까지 막힌다.
  useEffect(() => {
    if (state.phase !== 'rate_limited') return
    setLocked(true)
    const timer = setTimeout(() => setLocked(false), state.retryAfterMs ?? 60_000)
    return () => clearTimeout(timer)
  }, [state])

  // 응답이 확정되면 마지막 턴을 채운다. 낙관적으로 먼저 그린 질문 말풍선 아래에 답이 붙는다.
  useEffect(() => {
    if (state.phase === 'idle' || state.phase === 'loading') return
    const status = describePortalStatus(state)
    setTurns((previous) => {
      if (previous.length === 0) return previous
      const done = previous.slice(0, -1)
      const last = previous[previous.length - 1]
      if (state.phase === 'ready') {
        return [...done, { ...last, answer: state.data?.answer, citations: state.data?.citations ?? [] }]
      }
      return [...done, { ...last, notice: status ? { title: status.title, detail: status.detail, trace: status.trace } : undefined }]
    })
  }, [state])

  // 새 말풍선이 붙으면 바닥으로 내린다. scrollTo가 아니라 scrollTop을 쓰는 이유는
  // jsdom에 scrollTo가 없어서다 — 화면 동작은 같고 테스트 환경만 넓어진다.
  useEffect(() => {
    const node = scroller.current
    if (node) node.scrollTop = node.scrollHeight
  }, [turns, sending])

  function send(question: string) {
    if (!question || sending || locked) return
    setDraft('')
    // 직전 질문은 turns를 갱신하기 전 값에서 읽는다. setTurns 뒤에 읽으면 방금 넣은
    // 이번 질문이 잡혀 자기 자신을 문맥으로 보내게 된다.
    const previousQuery = turns[turns.length - 1]?.question
    setTurns((previous) => [...previous, { question }])
    ask({ query: question, previousQuery })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    send(draft.trim())
  }

  // 시안의 툴팁은 클릭 전에만 보인다 — 패널이 열리면 버튼째 사라지므로 별도 상태가 필요 없다.
  if (!open) {
    return <div className="group fixed bottom-7 right-7 z-40">
      <span className="pointer-events-none absolute bottom-[4.75rem] right-0 w-52 translate-y-1 rounded-xl bg-ink px-[0.875rem] py-[0.6875rem] text-center text-[0.78125rem] font-bold leading-[1.5] text-white opacity-0 shadow-[0_10px_24px_rgba(16,34,47,.28)] transition duration-150 group-hover:-translate-y-1 group-hover:opacity-100 group-focus-within:-translate-y-1 group-focus-within:opacity-100" aria-hidden="true">
        관광에 대한 모든 것! 무엇이든 물어보세요
        <span className="absolute -bottom-[5px] right-[1.375rem] h-2.5 w-2.5 rotate-45 bg-ink" />
      </span>
      <button type="button" onClick={() => setOpen(true)} aria-label="관광 도우미 열기" className="grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full bg-primary text-white shadow-[0_8px_20px_rgba(23,59,91,0.3)] hover:bg-[#12314c]">
        <ChatGlyph />
      </button>
    </div>
  }

  return <aside aria-label="관광 도우미" className="portal-chat-pop fixed bottom-7 right-7 z-40 flex h-[32.5rem] max-h-[calc(100vh-3.5rem)] w-[23.75rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[0.875rem] border border-line bg-panel shadow-[0_16px_48px_rgba(16,34,47,.26)]">
    <div className="flex flex-none items-center gap-[0.625rem] bg-primary px-4 py-[0.8125rem] text-white">
      <span className="grid h-[1.625rem] w-[1.625rem] flex-none place-items-center rounded-lg bg-white/[.18]" aria-hidden="true">
        <ChatGlyph size={15} />
      </span>
      <span className="text-sm font-bold">관광 도우미</span>
      <span className="text-[0.6875rem] font-medium text-sb-muted">AI 여행 안내</span>
      <button type="button" onClick={() => setOpen(false)} aria-label="관광 도우미 닫기" className="ml-auto bg-transparent px-1 py-0.5 text-lg leading-none text-sb-muted hover:text-white">×</button>
    </div>

    {/* 스크롤 영역 밖에 둬서 대화를 내려도 고지가 사라지지 않는다(F8-a). */}
    <div className="flex-none bg-sub px-[0.875rem] pt-[0.875rem]">
      <SampleNotice label="근거 문서에서 찾은 내용만 답합니다 · 직전 질문까지 이어집니다" />
    </div>

    <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-sub px-[0.875rem] py-4">
      {turns.length === 0 && <>
        <p className="m-0 max-w-[88%] self-start rounded-xl rounded-bl-[3px] border border-line-soft bg-white px-[0.8125rem] py-[0.6875rem] text-[0.8125rem] leading-[1.65] text-body">
          전주 한옥스테이, 축제 일정처럼 여행지에 대해 물어보세요. 수집된 관광 문서에서 근거를 찾아 답해 드립니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((question) => <button key={question} type="button" onClick={() => send(question)} className="rounded-full border border-field-line bg-white px-[0.8125rem] py-2 text-xs font-semibold text-body">{question}</button>)}
        </div>
      </>}

      {turns.map((turn, index) => <div key={index} className="flex flex-col gap-3">
        <p className="m-0 max-w-[82%] self-end rounded-xl rounded-br-[3px] bg-link px-[0.8125rem] py-[0.625rem] text-[0.8125rem] leading-relaxed text-white">{turn.question}</p>

        {turn.notice && <div className="flex max-w-[88%] flex-col gap-1 self-start rounded-xl rounded-bl-[3px] border border-line-soft bg-white px-[0.8125rem] py-[0.6875rem]">
          <strong className="text-[0.8125rem] font-bold text-ink">{turn.notice.title}</strong>
          {turn.notice.detail && <span className="text-[0.78125rem] leading-[1.6] text-body">{turn.notice.detail}</span>}
          {turn.notice.trace && <span className="text-[0.6875rem] text-muted-3">{turn.notice.trace}</span>}
        </div>}

        {turn.answer != null && <div className="flex max-w-[88%] flex-col gap-[0.5625rem] self-start">
          <p className="m-0 whitespace-pre-line rounded-xl rounded-bl-[3px] border border-line-soft bg-white px-[0.8125rem] py-[0.6875rem] text-[0.8125rem] leading-[1.65] text-body">{turn.answer}</p>
          {/* 근거 0건이면 섹션 자체를 숨긴다 — 빈 헤더를 남기지 않는다. */}
          {turn.citations != null && turn.citations.length > 0 && <div className="flex flex-col gap-1.5">
            <span className="text-[0.65625rem] font-bold tracking-[.06em] text-muted-3">답변 근거</span>
            {turn.citations.map((citation, position) => <EvidenceCard key={`${citation.title}-${position}`} citation={citation} />)}
          </div>}
        </div>}
      </div>)}

      {sending && <div className="flex max-w-[88%] items-center gap-1.5 self-start rounded-xl rounded-bl-[3px] border border-line-soft bg-white px-[0.8125rem] py-[0.8125rem]" aria-label="답변 작성 중" aria-busy="true">
        {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 rounded-full bg-muted-3" />)}
      </div>}
    </div>

    <form onSubmit={submit} className="flex flex-none gap-2 border-t border-line-soft bg-panel px-3 py-[0.6875rem]">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={sending || locked}
        placeholder="메시지를 입력하세요…"
        aria-label="관광 도우미 메시지"
        className="min-w-0 flex-1 rounded-[0.5625rem] border border-field-line bg-white px-3 py-[0.5625rem] text-[0.8125rem] text-ink outline-0 disabled:bg-sub"
      />
      <button type="submit" disabled={sending || locked || draft.trim() === ''} className="flex-none rounded-[0.5625rem] bg-primary px-4 py-[0.5625rem] text-[0.78125rem] font-bold text-white disabled:opacity-50">전송</button>
    </form>
  </aside>
}

/**
 * 근거 카드 — 검색 결과 카드의 축소형. 같은 `citations[]`를 그리므로 표시 규칙도 같다.
 * 「홈페이지」는 `excerpt`의 `[홈페이지]` 줄에서 나오고 `sourceUrl`은 쓰지 않는다(R26).
 */
function EvidenceCard({ citation }: { citation: PublicCitation }) {
  const homepage = homepageLine(citation.excerpt)
  return <div className="flex items-center gap-[0.625rem] rounded-[0.5625rem] border border-line-soft bg-white px-[0.625rem] py-2">
    <Placeholder label="사진" className="h-9 w-9 flex-none rounded-md" />
    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.78125rem] font-bold text-ink">{citation.title}</span>
    {homepage && <a href={homepage} target="_blank" rel="noopener noreferrer" className="flex-none text-[0.6875rem] font-bold text-primary underline underline-offset-2">홈페이지 ↗</a>}
    {citation.categoryLabel != null && <span className="flex-none rounded border border-line px-[0.375rem] py-[0.125rem] text-[0.625rem] font-bold text-primary">{citation.categoryLabel.split('>')[0].trim()}</span>}
  </div>
}
