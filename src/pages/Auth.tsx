import { useState, type ReactNode } from 'react'
import { Button, Card, Input, Label } from '../components/ui'
import { supabase } from '../lib/supabase'

// Screens shown before the app: loading, sign-in by email link, and picking a handle.

function Mark() {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      <span className="relative inline-block h-6 w-9">
        <span className="absolute left-0 top-0 h-6 w-6 rounded-full bg-accent" />
        <span className="absolute right-0 top-0 h-6 w-6 rounded-full bg-ink mix-blend-multiply" />
      </span>
      <span className="font-display text-xl font-bold tracking-tight">CrewPay</span>
    </div>
  )
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-12">
      <div className="animate-rise w-full max-w-md">
        <Mark />
        {children}
      </div>
    </div>
  )
}

export function Splash({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <Screen>
      {error ? (
        <Card className="p-6 text-center">
          <p className="font-medium">Couldn’t reach CrewPay.</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          {onRetry && (
            <Button className="mt-4" onClick={onRetry}>
              Try again
            </Button>
          )}
        </Card>
      ) : (
        <p className="text-center text-sm text-muted">Loading…</p>
      )}
    </Screen>
  )
}

export function SignIn({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    setBusy(true)
    setError('')
    // The link brings you back to the page you were on, e.g. an invite.
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.href } })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <Screen>
      <Card className="p-6 sm:p-8">
        {sent ? (
          <>
            <h1 className="font-display text-2xl font-bold">Check your email</h1>
            <p className="mt-2 text-muted">
              We sent a sign-in link to <b className="text-ink">{email.trim()}</b>. Open it on this device and you’re in.
            </p>
            <button onClick={() => setSent(false)} className="mt-6 text-sm text-muted underline hover:text-ink">
              Use a different email
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (email.includes('@')) send()
            }}
          >
            <h1 className="font-display text-2xl font-bold">Sign in</h1>
            <p className="mt-2 text-muted">Build your crew, agree on pay, get paid. No password: we email you a link.</p>
            <label className="mt-6 block">
              <Label>Email</Label>
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            {error && <p className="mt-3 text-sm text-warn">{error}</p>}
            <Button type="submit" size="lg" variant="accent" className="mt-5 w-full" disabled={busy || !email.includes('@')}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Just looking?{' '}
        <button onClick={onDemo} className="font-medium text-ink underline">
          Explore the demo
        </button>{' '}
        with sample projects.
      </p>
    </Screen>
  )
}

export function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clean = handle.trim().replace(/^@+/, '').toLowerCase()
  const valid = name.trim().length > 0 && /^[a-z0-9_]{2,30}$/.test(clean)

  const save = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase!.from('profiles').insert({ id: userId, handle: clean, name: name.trim() })
    setBusy(false)
    if (error) setError(error.code === '23505' ? `@${clean} is taken. Try another.` : error.message)
    else onDone()
  }

  return (
    <Screen>
      <Card className="p-6 sm:p-8">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) save()
          }}
        >
          <h1 className="font-display text-2xl font-bold">Set up your profile</h1>
          <p className="mt-2 text-muted">Your crew sees this name. Leads invite you by your handle.</p>
          <label className="mt-6 block">
            <Label>Your name</Label>
            <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Louis Arogundade" />
          </label>
          <label className="mt-4 block">
            <Label hint="Letters, numbers, _">Handle</Label>
            <div className="flex items-center gap-1">
              <span className="text-muted">@</span>
              <Input autoCapitalize="none" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="louis" />
            </div>
          </label>
          {handle && !/^[a-z0-9_]{2,30}$/.test(clean) && (
            <p className="mt-2 text-xs text-muted">2–30 characters: lowercase letters, numbers and underscores.</p>
          )}
          {error && <p className="mt-3 text-sm text-warn">{error}</p>}
          <Button type="submit" size="lg" variant="accent" className="mt-6 w-full" disabled={!valid || busy}>
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        <button onClick={() => supabase!.auth.signOut()} className="underline hover:text-ink">
          Sign out
        </button>
      </p>
    </Screen>
  )
}
