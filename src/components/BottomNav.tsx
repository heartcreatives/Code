import { NavLink } from 'react-router-dom'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-semibold',
    isActive ? 'text-court' : 'text-ink-faint',
  ].join(' ')

export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-paper-edge bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex h-[66px] max-w-md items-center px-4">
        <NavLink to="/" end className={tabClass}>
          <HomeIcon />
          Home
        </NavLink>

        <div className="relative flex w-24 justify-center">
          <NavLink
            to="/log"
            aria-label="Log an entry"
            className={({ isActive }) =>
              [
                'absolute -top-7 flex h-[62px] w-[62px] items-center justify-center rounded-full',
                'shadow-lift ring-4 ring-paper transition-transform active:scale-95',
                isActive ? 'bg-court-deep text-optic' : 'bg-optic text-court-deep',
              ].join(' ')
            }
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </svg>
          </NavLink>
          <span className="mt-9 text-[11px] font-semibold text-ink-faint">Log</span>
        </div>

        <NavLink to="/history" className={tabClass}>
          <HistoryIcon />
          History
        </NavLink>
      </div>
    </nav>
  )
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
