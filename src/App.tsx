import { useEffect, useState } from 'react'
import LocalFullWorkspace from './LocalFullWorkspace'
import ProviderSettings from './ProviderSettings'

type View = 'workflow' | 'providers'

function viewFromHash(): View {
  return window.location.hash === '#providers' ? 'providers' : 'workflow'
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function navigate(next: View) {
    window.location.hash = next === 'providers' ? 'providers' : 'local-full'
    setView(next)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-symbol" aria-hidden="true">AX</span>
          <div><strong>MODULE STUDIO</strong><span>LOCAL CONTROL PLANE</span></div>
        </div>

        <nav aria-label="관리자 메뉴">
          <p>DATA · KNOWLEDGE</p>
          <button className={view === 'workflow' ? 'is-active' : ''} onClick={() => navigate('workflow')}>
            <span aria-hidden="true">⌘</span> Local Full Workflow
          </button>
          <p>SETTINGS</p>
          <button className={view === 'providers' ? 'is-active' : ''} onClick={() => navigate('providers')}>
            <span aria-hidden="true">◇</span> LLM Providers
          </button>
        </nav>

        <div className="sidebar-status">
          <span className="live-dot" />
          <div><strong>DEV · LOOPBACK</strong><span>Nginx → React → Spring</span></div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div><span>Workspace</span><strong>AX Module Studio / local-full</strong></div>
          <div className="policy-chip">POLICY ACTIVE</div>
          <div className="avatar" aria-label="Local administrator">LA</div>
        </header>
        <main className="content-area">
          {view === 'workflow' ? <LocalFullWorkspace /> : <ProviderSettings />}
        </main>
      </div>
    </div>
  )
}
