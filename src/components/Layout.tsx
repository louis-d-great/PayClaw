import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Tour from './Tour'
import { PEOPLE, personName, useStore } from '../store'
import { Avatar, cx } from './ui'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="relative inline-block h-6 w-9">
        <span className="absolute left-0 top-0 h-6 w-6 rounded-full bg-accent" />
        <span className="absolute right-0 top-0 h-6 w-6 rounded-full bg-ink mix-blend-multiply" />
      </span>
      <span className="font-display text-xl font-bold tracking-tight">CrewPay</span>
    </Link>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx('rounded-full px-3 py-1.5 text-sm font-medium transition', isActive ? 'bg-ink text-paper' : 'text-muted hover:text-ink')

export default function Layout() {
  const { me, dispatch, clockOffset, mode, setMode, signOut, notice, clearNotice, busy } = useStore()
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(clearNotice, 8000)
    return () => clearTimeout(t)
  }, [notice, clearNotice])
  return (
    <div className="min-h-screen">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 border-b border-line/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/new" className={navClass} data-tour="new">
              New project
            </NavLink>
            <NavLink to={`/u/${me.replace(/^@/, '')}`} className={navClass} data-tour="profile">
              Profile
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/new" className="grid h-9 w-9 place-items-center rounded-full bg-ink text-lg text-paper sm:hidden" aria-label="New project" data-tour="new-mobile">
              +
            </Link>
            {mode === 'live' ? (
              <>
                <Link to={`/u/${me.replace(/^@/, '')}`} className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-3 text-sm" data-tour="profile-chip">
                  <Avatar handle={me} size={26} />
                  <span className="max-w-32 truncate font-medium">{personName(me)}</span>
                </Link>
                <button onClick={signOut} className="text-sm text-muted hover:text-ink">
                  Sign out
                </button>
              </>
            ) : (
              // Demo only: stands in for real sign-in so you can play every side of a deal.
              <label className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-3 text-sm">
                <Avatar handle={me} size={26} />
                <span className="hidden text-muted sm:inline">Viewing as</span>
                <select
                  value={me}
                  onChange={(e) => dispatch({ type: 'switchUser', me: e.target.value })}
                  className="bg-transparent font-medium outline-none"
                >
                  {PEOPLE.map((h) => (
                    <option key={h} value={h}>
                      {personName(h)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6">
        <Outlet />
      </main>
      <Tour />
      {busy && (
        <div
          role="status"
          className="fixed left-1/2 top-20 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-line bg-card p-4 text-sm shadow-[0_8px_30px_-12px_rgba(29,27,22,.35)]"
        >
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
          <p className="flex-1 leading-relaxed">
            {busy} <span className="text-muted">Confirm with your passkey if asked. CrewPay covers the fee.</span>
          </p>
        </div>
      )}
      {notice && !busy && (
        <div
          role="status"
          className="fixed left-1/2 top-20 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border border-line bg-card p-4 text-sm shadow-[0_8px_30px_-12px_rgba(29,27,22,.35)]"
        >
          <p className="flex-1 leading-relaxed">{notice}</p>
          <button onClick={clearNotice} className="text-muted hover:text-ink" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {mode === 'demo' && (
        // Demo only: move the clock forward to watch time-based rules fire.
        <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-card/95 py-1.5 pl-4 pr-1.5 text-xs shadow-[0_8px_30px_-12px_rgba(29,27,22,.35)] backdrop-blur">
          <span className="whitespace-nowrap text-muted">
            Demo clock{clockOffset > 0 ? ` · +${Math.round(clockOffset / 86_400_000)} days` : ''}
          </span>
          <button onClick={() => dispatch({ type: 'advance', days: 7 })} className="whitespace-nowrap rounded-full bg-ink px-3 py-1.5 font-medium text-paper">
            Skip 7 days
          </button>
          {supabase && (
            <button onClick={() => setMode('live')} className="whitespace-nowrap rounded-full px-3 py-1.5 font-medium text-muted hover:text-ink">
              Exit demo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
