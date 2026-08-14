import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, hasSupabase } from '../lib/supabase'

type Access = 'checking' | 'allowed' | 'denied'

interface AuthValue {
  ready: boolean
  session: Session | null
  userId: string | null
  email: string | null
  /** Demo mode: no Supabase configured, data stays on this device. */
  demo: boolean
  access: Access
  sendMagicLink(email: string): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!hasSupabase)
  const [session, setSession] = useState<Session | null>(null)
  const [access, setAccess] = useState<Access>(hasSupabase ? 'checking' : 'allowed')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // The allowlist is enforced by RLS in the database; this read just tells us
  // whether to show the ledger or a polite "ask the owner" screen.
  useEffect(() => {
    if (!supabase) return
    if (!session) {
      setAccess('checking')
      return
    }
    let cancelled = false
    supabase
      .from('allowlist')
      .select('email')
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return
        setAccess(!error && data && data.length > 0 ? 'allowed' : 'denied')
      })
    return () => {
      cancelled = true
    }
  }, [session])

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      session,
      userId: hasSupabase ? (session?.user.id ?? null) : null,
      email: hasSupabase ? (session?.user.email ?? null) : 'demo mode',
      demo: !hasSupabase,
      access,
      async sendMagicLink(email: string) {
        if (!supabase) return
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
      },
      async signOut() {
        if (!supabase) return
        await supabase.auth.signOut()
      },
    }),
    [ready, session, access],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
