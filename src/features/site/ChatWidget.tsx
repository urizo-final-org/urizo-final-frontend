import { useState } from 'react'
import { Placeholder, SampleNotice } from './portal-primitives'

/** I6이 실제 대화로 교체할 정적 예시 — 근거 3건은 챗봇 citations 노출 수(CITATION_LIMIT)와 같다. */
const CHAT_EVIDENCE = ['도원', '더 한옥', '대동고택']

/**
 * 우하단 상시 노출 플로팅 챗봇. 버튼 사양은 시안(52px 원형·primary·right/bottom 28px)을 따른다.
 *
 * <p>`TourPortal.tsx`에서 파일만 옮겼고 마크업·동작은 그대로다. F8-a 고지는 헤더 아래·스크롤
 * 영역 바깥에 그대로 둔다 — 대화를 내려도 고지가 사라지지 않아야 한다는 것이 F8-a의 요점이다.
 * 문구 교체는 F8-b이며 S1(I5 배포) 해소 후다.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false)

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

    {/* 스크롤 영역 밖에 둬서 대화를 내려도 고지가 사라지지 않는다. */}
    <div className="flex-none bg-sub px-[0.875rem] pt-[0.875rem]">
      <SampleNotice label="샘플 대화입니다 · 챗봇 API 미배선" />
    </div>

    {/* I6이 공개 챗봇 API 대화로 교체할 정적 예시. 그때까지 입력은 잠가 실동작을 약속하지 않는다. */}
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-sub px-[0.875rem] py-4">
      <p className="m-0 max-w-[82%] self-end rounded-xl rounded-br-[3px] bg-link px-[0.8125rem] py-[0.625rem] text-[0.8125rem] leading-relaxed text-white">전주 한옥스테이 추천해줘</p>
      <div className="flex max-w-[88%] flex-col gap-[0.5625rem] self-start">
        <p className="m-0 rounded-xl rounded-bl-[3px] border border-line-soft bg-white px-[0.8125rem] py-[0.6875rem] text-[0.8125rem] leading-[1.65] text-body">전주 한옥마을 인근에서 머물기 좋은 한옥 숙소 세 곳을 추천드려요. <b className="text-ink">도원</b>은 하루 한 팀만 받는 독채 숙소이고, <b className="text-ink">더 한옥</b>은 한옥마을 중심가와 가장 가까워요. <b className="text-ink">대동고택</b>은 조용한 고택 분위기를 원하시는 분께 좋습니다.</p>
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.65625rem] font-bold tracking-[.06em] text-muted-3">답변 근거</span>
          {CHAT_EVIDENCE.map((name) => <div key={name} className="flex items-center gap-[0.625rem] rounded-[0.5625rem] border border-line-soft bg-white px-[0.625rem] py-2">
            <Placeholder label="사진" className="h-9 w-9 flex-none rounded-md" />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.78125rem] font-bold text-ink">{name}</span>
            <span className="flex-none rounded border border-line px-[0.375rem] py-[0.125rem] text-[0.625rem] font-bold text-primary">숙박</span>
          </div>)}
        </div>
      </div>
    </div>

    <div className="flex flex-none gap-2 border-t border-line-soft bg-panel px-3 py-[0.6875rem]">
      <input disabled placeholder="메시지를 입력하세요…" title="챗봇 연동은 I6에서 연결됩니다." aria-label="관광 도우미 메시지" className="min-w-0 flex-1 rounded-[0.5625rem] border border-field-line bg-white px-3 py-2 text-[0.8125rem] text-ink outline-0" />
      <button type="button" disabled title="챗봇 연동은 I6에서 연결됩니다." className="flex-none rounded-[0.5625rem] bg-primary px-[0.9375rem] py-2 text-[0.78125rem] font-bold text-white">전송</button>
    </div>
  </aside>
}
