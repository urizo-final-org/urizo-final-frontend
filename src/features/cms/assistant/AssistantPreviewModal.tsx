import type { ReactNode } from 'react'
import { primaryButton, secondaryButton, smallButton } from '../../../shared/ui/primitives'

/**
 * 미리보기 모달 껍데기. 안에 들어가는 내용만 리소스마다 바꾼다.
 *
 * 패널 폭이 좁아 트리·본문 diff·템플릿 렌더가 들어가지 않으므로 모달로 뺀다.
 * 삭제 확인도 위험 등급 때문에 이쪽을 쓴다.
 */
/** 되돌릴 수 없는 작업은 승인 버튼 색을 달리한다. 같은 버튼이면 습관적으로 누른다. */
const dangerButton = 'inline-flex h-8 items-center gap-[0.375rem] rounded-[0.3125rem] border border-[#e2b4ad] bg-[#c0564b] px-[0.6875rem] text-xs font-semibold text-white enabled:hover:bg-[#a94a40]'

export default function AssistantPreviewModal({ title, subtitle, children, busy, approveLabel, danger, onApprove, onClose }: {
  title: string
  subtitle: string
  children: ReactNode
  busy: boolean
  approveLabel?: string
  danger?: boolean
  onApprove: () => void
  onClose: () => void
}) {
  return <div
    className="fixed inset-0 z-50 grid place-items-center bg-[#16293c]/70 p-4"
    role="presentation"
    onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}
  >
    <section
      className="flex max-h-[92vh] w-[min(60rem,96vw)] flex-col overflow-hidden rounded-md bg-white shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-[0.875rem]">
        <div>
          <b className="block text-[0.84375rem] font-semibold">{title}</b>
          <small className="mt-[0.125rem] block text-[0.6875rem] text-muted-2">{subtitle}</small>
        </div>
        <button type="button" className={smallButton} onClick={onClose}>닫기</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-[0.875rem]">{children}</div>

      <div className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" className={secondaryButton} onClick={onClose}>취소</button>
        <button
          type="button"
          className={danger ? dangerButton : primaryButton}
          disabled={busy}
          onClick={onApprove}
        >{approveLabel ?? '승인하고 반영'}</button>
      </div>
    </section>
  </div>
}
