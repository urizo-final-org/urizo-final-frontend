import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRagQuery } from '../knowledge/useRagQuery'
import type { PublicCitation } from '../knowledge/types'
import { homepageLine } from './portal-meta'
import { describePortalStatus } from './portal-status'
import { Placeholder, SampleNotice } from './portal-primitives'

/**
 * 우하단 상시 노출 플로팅 챗봇. 버튼 사양은 시안(52px 원형·primary·right/bottom 28px)을 따른다.
 *
 * <p>공개 챗봇 API(`POST /api/public/chat/query`)에 실제로 연결돼 있다. 검색(A)과 **같은
 * 엔드포인트·같은 훅**을 쓰므로 상태 처리도 같다 — 다른 것은 결과를 말풍선으로 그린다는 것뿐이다.
 *
 * <p>**단일 턴이다.** `conversationId`를 보내지 않는다. 백엔드가 이 값을 받아 그대로 돌려주기만
 * 하고 이전 턴을 참조하지 않으므로(`RagStore.java:145-146`), 보내면 "대화가 이어진다"는 잘못된
 * 인상을 준다. 다중 턴은 백엔드 신규 작업이며 9/14 이후다. 질의 사이 구분선이 그 사실을 보여준다.
 *
 * <p>거절(REFUSED)은 오류가 아니다. 근거 섹션을 숨기고 문구만 바꾼다 — 경고색을 쓰지 않는다.
 */

/** 한 번에 하나씩. 서버가 대화를 잇지 않으므로 턴은 서로 독립이다. */
type Turn = {
  question: string
  answer?: string
  citations?: PublicCitation[]
  /** 답변 대신 보여줄 시스템 문구(거절·오류·제한). */
  notice?: { title: string; detail?: string; trace?: string }
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const { state, ask } = useRagQuery()
  const scroller = useRef<HTMLDivElement>(null)

  const sending = state.phase === 'loading'

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

  function submit(event: FormEvent) {
    event.preventDefault()
    const question = draft.trim()
    if (!question || sending) return
    setDraft('')
    setTurns((previous) => [...previous, { question }])
    ask({ query: question })
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} aria-label="관광 도우미 열기" className="fixed bottom-7 right-7 z-40 grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full bg-primary text-white shadow-[0_8px_20px_rgba(23,59,91,0.3)] hover:bg-[#12314c]">
      <span className="box-border h-5 w-[1.375rem] rounded-[10px_10px_10px_2px] border-[2.5px] border-white" aria-hidden="true" />
    </button>
  }

  return <aside aria-label="관광 도우미" className="portal-chat-pop fixed bottom-7 right-7 z-40 flex h-[32.5rem] max-h-[calc(100vh-3.5rem)] w-[23.75rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-[0.875rem] border border-line bg-panel shadow-[0_16px_48px_rgba(16,34,47,.26)]">
    <div className="flex flex-none items-center gap-[0.625rem] bg-primary px-4 py-[0.8125rem] text-white">
      <span className="grid h-[1.625rem] w-[1.625rem] place-items-center rounded-lg bg-white/[.18]" aria-hidden="true">
        <span className="box-border h-[0.875rem] w-4 rounded-[7px_7px_7px_2px] border-2 border-white" />
      </span>
      <span className="text-sm font-bold">관광 도우미</span>
      <span className="text-[0.6875rem] font-medium text-sb-muted">AI 여행 안내</span>
      <button type="button" onClick={() => setOpen(false)} aria-label="관광 도우미 닫기" className="ml-auto bg-transparent px-1 py-0.5 text-lg leading-none text-sb-muted hover:text-white">×</button>
    </div>

    {/* 스크롤 영역 밖에 둬서 대화를 내려도 고지가 사라지지 않는다(F8-a). */}
    <div className="flex-none bg-sub px-[0.875rem] pt-[0.875rem]">
      <SampleNotice label="근거 문서에서 찾은 내용만 답합니다 · 질문은 하나씩" />
    </div>

    <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-sub px-[0.875rem] py-4">
      {turns.length === 0 && <p className="m-0 max-w-[88%] self-start rounded-xl rounded-bl-[3px] border border-line-soft bg-white px-[0.8125rem] py-[0.6875rem] text-[0.8125rem] leading-[1.65] text-body">
        전주 한옥스테이, 축제 일정처럼 여행지에 대해 물어보세요. 수집된 관광 문서에서 근거를 찾아 답해 드립니다.
      </p>}

      {turns.map((turn, index) => <div key={index} className="flex flex-col gap-3">
        {/* 서버가 대화를 잇지 않는다 — 턴이 서로 독립임을 눈으로 보여준다. */}
        {index > 0 && <span className="my-1 flex items-center gap-2 text-[0.65625rem] text-muted-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line-soft" />이전 질문과 독립<span className="h-px flex-1 bg-line-soft" />
        </span>}

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

      {sending && <div className="flex max-w-[88%] items-center gap-1.5 self-start rounded-xl rounded-bl-[3px] border border-line-soft bg-white px-[0.8125rem] py-[0.6875rem]" aria-label="답변 작성 중" aria-busy="true">
        {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 rounded-full bg-muted-3" />)}
      </div>}
    </div>

    <form onSubmit={submit} className="flex flex-none gap-2 border-t border-line-soft bg-panel px-3 py-[0.6875rem]">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={sending}
        placeholder="메시지를 입력하세요…"
        aria-label="관광 도우미 메시지"
        className="min-w-0 flex-1 rounded-[0.5625rem] border border-field-line bg-white px-3 py-2 text-[0.8125rem] text-ink outline-0 disabled:bg-sub"
      />
      <button type="submit" disabled={sending || draft.trim() === ''} className="flex-none rounded-[0.5625rem] bg-primary px-[0.9375rem] py-2 text-[0.78125rem] font-bold text-white disabled:opacity-50">전송</button>
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
