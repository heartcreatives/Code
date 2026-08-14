import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { Log } from './screens/Log'
import { NotAllowed, SignIn } from './screens/SignIn'
import { useAuth } from './state/AuthContext'
import { LedgerProvider } from './state/LedgerContext'

// The charting library is a big download on court wifi, so the dashboard and
// history load after the shell rather than blocking first paint.
const Dashboard = lazy(() => import('./screens/Dashboard').then((m) => ({ default: m.Dashboard })))
const History = lazy(() => import('./screens/History').then((m) => ({ default: m.History })))

export default function App() {
  const { ready, session, demo, access } = useAuth()

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-[15px] text-ink-faint">Opening the ledger…</p>
      </main>
    )
  }

  if (!demo && !session) return <SignIn />
  if (!demo && access === 'denied') return <NotAllowed />

  return (
    <LedgerProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-court focus:px-4 focus:py-2 focus:text-paper"
      >
        Skip to content
      </a>
      <main
        id="main"
        className="mx-auto min-h-dvh max-w-md px-4 pt-3"
        style={{ paddingBottom: 'calc(var(--nav-h) + 20px)' }}
      >
        <Suspense fallback={<p className="pt-8 text-[15px] text-ink-faint">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/log" element={<Log />} />
            <Route path="/history" element={<History />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
    </LedgerProvider>
  )
}
