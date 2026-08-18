import { useState } from 'react'
import { CourtLines } from '../components/CourtLines'
import { LogoBadge } from '../components/Logo'
import { useAuth } from '../state/AuthContext'

export function SignIn() {
  const { sendMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await sendMagicLink(email)
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="card relative overflow-hidden p-6">
        <CourtLines className="absolute inset-0 h-full w-full text-sky opacity-[0.08]" />
        <div className="relative">
          <div className="flex flex-col items-center text-center">
            <LogoBadge />
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight text-white">
              Court ledger
            </h1>
          </div>

          {sent ? (
            <div className="mt-5">
              <p className="text-[15px] leading-relaxed text-ink-soft">
                Check <span className="font-semibold text-ink">{email}</span> — tap the link in the
                email and you’re in. It only works on this phone, and only for staff on the court’s
                list.
              </p>
              <button
                type="button"
                className="mt-4 text-[15px] font-semibold text-sky underline"
                onClick={() => setSent(false)}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <p className="text-[15px] leading-relaxed text-ink-soft">
                No password. Enter your work email and we’ll send you a sign-in link.
              </p>
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  className="field"
                  placeholder="you@paayo.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <p className="text-[14px] font-semibold text-spend">{error}</p>}
              <button type="submit" className="btn-primary" disabled={busy || !email}>
                {busy ? 'Sending…' : 'Send my sign-in link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}

export function NotAllowed() {
  const { email, signOut } = useAuth()
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold text-white">Not on the court list</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">{email}</span> isn’t one of the staff emails set
          up for this ledger, so there’s nothing to show. Ask the owner to add you, then sign in
          again.
        </p>
        <button type="button" className="mt-5 btn-quiet" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </main>
  )
}
