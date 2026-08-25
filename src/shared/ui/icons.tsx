import type { ReactNode } from 'react'

/**
 * The design canvas draws its icons with Lucide. These are the same 24x24 outlines inlined, so the
 * bundle keeps its zero-runtime-dependency shape and the icons still match the design 1:1.
 */
export type IconName =
  | 'sparkles' | 'chevrons-up-down' | 'chevron-down' | 'chevron-right' | 'chevron-left'
  | 'globe-2' | 'arrow-up-right' | 'settings' | 'search' | 'bell' | 'circle-help'
  | 'layout-dashboard' | 'users' | 'menu' | 'file-text' | 'message-square' | 'layout-template'
  | 'bot' | 'boxes' | 'database' | 'code-2' | 'shield-check' | 'history'
  | 'plus' | 'activity' | 'repeat' | 'network' | 'timer' | 'user-round-check'
  | 'search-check' | 'git-pull-request' | 'ellipsis' | 'sliders-horizontal'
  | 'play' | 'building-2' | 'plug' | 'layers' | 'scroll-text'
  | 'check' | 'check-check' | 'triangle-alert' | 'inbox' | 'download' | 'loader-circle'

const paths: Record<IconName, ReactNode> = {
  'sparkles': <><path d="M9.9 2.6 12 8l5.4 2.1L12 12.2 9.9 17.6 7.8 12.2 2.4 10.1 7.8 8Z" /><path d="M18 4v4" /><path d="M20 6h-4" /></>,
  'chevrons-up-down': <><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></>,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'globe-2': <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20Z" /></>,
  'arrow-up-right': <><path d="M7 7h10v10" /><path d="M7 17 17 7" /></>,
  'settings': <><path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.2a2 2 0 0 1-2 0l-.1-.1a2 2 0 0 0-2.7.7l-.3.5a2 2 0 0 0 .7 2.8l.1.1a2 2 0 0 1 1 1.7v.4a2 2 0 0 1-1 1.7l-.1.1a2 2 0 0 0-.7 2.8l.3.5a2 2 0 0 0 2.7.7l.1-.1a2 2 0 0 1 2 0l.4.2a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.2a2 2 0 0 1 2 0l.1.1a2 2 0 0 0 2.7-.7l.3-.5a2 2 0 0 0-.7-2.8l-.1-.1a2 2 0 0 1-1-1.7v-.4a2 2 0 0 1 1-1.7l.1-.1a2 2 0 0 0 .7-2.8l-.3-.5a2 2 0 0 0-2.7-.7l-.1.1a2 2 0 0 1-2 0l-.4-.2a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z" /><circle cx="12" cy="12" r="3" /></>,
  'search': <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  'bell': <><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /><path d="M4 17h16l-1.4-2.1a3 3 0 0 1-.6-1.7V10a6 6 0 0 0-12 0v3.2c0 .6-.2 1.2-.6 1.7Z" /></>,
  'circle-help': <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
  'layout-dashboard': <><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></>,
  'users': <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  'menu': <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>,
  'file-text': <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></>,
  'message-square': <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  'layout-template': <><rect width="18" height="7" x="3" y="3" rx="1" /><rect width="9" height="7" x="3" y="14" rx="1" /><rect width="5" height="7" x="16" y="14" rx="1" /></>,
  'bot': <><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></>,
  'boxes': <><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" /><path d="m7 16.5-4.74-2.85" /><path d="m7 16.5 5-3" /><path d="M7 16.5v5.17" /><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" /><path d="m17 16.5-5-3" /><path d="m17 16.5 4.74-2.85" /><path d="M17 16.5v5.17" /><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" /><path d="M12 8 7.26 5.15" /><path d="m12 8 4.74-2.85" /><path d="M12 13.5V8" /></>,
  'database': <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>,
  'code-2': <><path d="m18 16 4-4-4-4" /><path d="m6 8-4 4 4 4" /><path d="m14.5 4-5 16" /></>,
  'shield-check': <><path d="M20 13c0 5-3.5 7.5-7.7 9a2 2 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.9 1.9 0 0 1 2.5 0C15.5 3.8 18 5 20 5a1 1 0 0 1 1 1Z" /><path d="m9 12 2 2 4-4" /></>,
  'history': <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></>,
  'plus': <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  'activity': <path d="M22 12h-2.5l-3 8-6-16-3 8H2" />,
  'repeat': <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  'network': <><rect x="9" y="2" width="6" height="6" rx="1" /><rect x="2" y="16" width="6" height="6" rx="1" /><rect x="16" y="16" width="6" height="6" rx="1" /><path d="M5 16v-3h14v3" /><path d="M12 13V8" /></>,
  'timer': <><path d="M10 2h4" /><path d="M12 14v-4" /><circle cx="12" cy="14" r="8" /></>,
  'user-round-check': <><path d="M2 21a8 8 0 0 1 13-6.2" /><circle cx="10" cy="8" r="5" /><path d="m16 19 2 2 4-4" /></>,
  'search-check': <><path d="m8 11 2 2 4-4" /><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  'git-pull-request': <><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><path d="M6 9v12" /></>,
  'ellipsis': <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
  'sliders-horizontal': <><path d="M10 5h11" /><path d="M3 5h3" /><path d="M14 12h7" /><path d="M3 12h7" /><path d="M18 19h3" /><path d="M3 19h11" /><circle cx="8" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="16" cy="19" r="2" /></>,
  'play': <path d="m6 4 13 8-13 8Z" />,
  'building-2': <><path d="M6 22V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v18" /><path d="M14 9h4a2 2 0 0 1 2 2v11" /><path d="M2 22h20" /><path d="M9 7h1" /><path d="M9 11h1" /><path d="M9 15h1" /></>,
  'plug': <><path d="M12 22v-5" /><path d="M9 7V2" /><path d="M15 7V2" /><path d="M6 13a6 6 0 0 0 12 0V7H6Z" /></>,
  'layers': <><path d="m12 2 9 5-9 5-9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  'scroll-text': <><path d="M15 12h-5" /><path d="M15 8h-5" /><path d="M19 17V5a2 2 0 0 0-2-2H4" /><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2h4" /></>,
  'check': <path d="M20 6 9 17l-5-5" />,
  'check-check': <><path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></>,
  'triangle-alert': <><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  'inbox': <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z" /></>,
  'download': <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>,
  'loader-circle': <path d="M21 12a9 9 0 1 1-6.2-8.6" />,
}

export function Icon({ name, size = 14, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: `0 0 ${size}px` }}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
