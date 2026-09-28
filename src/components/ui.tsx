import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { personName } from '../store'

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost'

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/85',
  accent: 'bg-accent text-white hover:brightness-95',
  outline: 'border border-line bg-card text-ink hover:border-ink/40',
  ghost: 'text-muted hover:text-ink hover:bg-ink/5',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-5 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        buttonStyles[variant],
        className,
      )}
    />
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-3xl border border-line bg-card', className)}>{children}</div>
}

const AVATAR_COLORS = ['#ff6a3d', '#3d7bff', '#1f8a5b', '#a855f7', '#e0a100', '#e5487a']

export function Avatar({ handle, size = 32 }: { handle?: string; size?: number }) {
  if (!handle)
    return (
      <span
        className="inline-grid shrink-0 place-items-center rounded-full border border-dashed border-muted/50 text-muted"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        aria-label="Open role"
      >
        +
      </span>
    )
  const hash = [...handle].reduce((h, c) => h + c.charCodeAt(0), 0)
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
      aria-label={personName(handle)}
    >
      {personName(handle)[0]}
    </span>
  )
}

type Tone = 'neutral' | 'ok' | 'warn' | 'accent'

const toneStyles: Record<Tone, string> = {
  neutral: 'bg-ink/5 text-muted',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  accent: 'bg-accent-soft text-accent',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', toneStyles[tone])}>
      {children}
    </span>
  )
}

const fieldBase =
  'w-full rounded-2xl border border-line bg-card px-4 text-ink placeholder:text-muted/60 outline-none transition focus:border-ink/50 focus:ring-4 focus:ring-ink/5'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldBase, 'h-11', className)} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldBase, 'resize-none py-3 leading-relaxed', className)} />
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </span>
  )
}

export function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx('font-display tabular-nums', className)}>
      ${value.toLocaleString('en-US')}
      <span className="ml-1 align-middle text-[0.45em] font-sans font-medium tracking-wide text-muted">USDC</span>
    </span>
  )
}

export { cx }
