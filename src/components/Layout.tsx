import { Link, NavLink, Outlet } from 'react-router-dom'
import { PEOPLE, personName, useStore } from '../store'
import { Avatar, cx } from './ui'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="relative inline-block h-6 w-9">
        <span className="absolute left-0 top-0 h-6 w-6 rounded-full bg-accent" />
        <span className="absolute right-0 top-0 h-6 w-6 rounded-full bg-ink mix-blend-multiply" />
      </span>
      <span className="font-display text-xl font-bold tracking-tight">crewpay</span>
    </Link>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx('rounded-full px-3 py-1.5 text-sm font-medium transition', isActive ? 'bg-ink text-paper' : 'text-muted hover:text-ink')

export default function Layout() {
  const { me, dispatch } = useStore()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/new" className={navClass}>
              New project
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/new" className="grid h-9 w-9 place-items-center rounded-full bg-ink text-lg text-paper sm:hidden" aria-label="New project">
              +
            </Link>
            {/* Prototype only: stands in for real sign-in so you can play every side of a deal. */}
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
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
