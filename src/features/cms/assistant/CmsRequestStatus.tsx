import type { ReactNode } from 'react'
import { Icon } from '../../../shared/ui/icons'
import './CmsRequestStatus.css'

export default function CmsRequestStatus({ busy = false, tone = 'wait', children }: {
  busy?: boolean
  tone?: 'run' | 'wait' | 'ok'
  children: ReactNode
}) {
  return <div className="cms-request-status" data-tone={tone} data-busy={busy}>
    <div className="cms-request-status__heading">
      <span>현재 상태</span>
      {busy && <span className="cms-request-status__wave" aria-hidden="true"><i /><i /><i /></span>}
    </div>
    <div className="cms-request-status__body">
      <span className="cms-request-status__symbol" aria-hidden="true">
        {busy ? <svg viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="8" y="13" width="8" height="8" rx="2" />
        </svg> : <Icon name={tone === 'ok' ? 'check' : 'user-round-check'} size={18} />}
      </span>
      <div className="cms-request-status__text">{children}</div>
    </div>
  </div>
}
