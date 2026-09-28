import { useEffect, useRef, useState } from 'react'
import { timeAgo } from '../lib/format'
import { personName, useStore } from '../store'
import type { Message, Project } from '../types'
import { Avatar, Badge, Button, cx } from './ui'

export default function Chat({ project }: { project: Project }) {
  const { me, dispatch } = useStore()
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const inCrew = project.lead === me || project.roles.some((r) => r.assignee === me)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [project.messages.length])

  const send = () => {
    if (!text.trim()) return
    dispatch({ type: 'say', projectId: project.id, text: text.trim() })
    setText('')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {project.messages.map((m) => (
          <ChatItem key={m.id} project={project} m={m} />
        ))}
        <div ref={end} />
      </div>
      {inCrew ? (
        <form
          className="flex gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the crew…"
            className="h-10 flex-1 rounded-full border border-line bg-paper px-4 text-sm outline-none focus:border-ink/40"
          />
          <Button size="md" disabled={!text.trim()}>
            Send
          </Button>
        </form>
      ) : (
        <p className="border-t border-line p-4 text-center text-sm text-muted">Only the crew can post here.</p>
      )}
    </div>
  )
}

function ChatItem({ project, m }: { project: Project; m: Message }) {
  const { me, dispatch } = useStore()

  if (m.kind === 'system')
    return (
      <p className="mx-auto max-w-sm text-center text-xs leading-relaxed text-muted">
        {m.text} <span className="whitespace-nowrap opacity-70">· {timeAgo(m.at)}</span>
      </p>
    )

  const mine = m.author === me

  if (m.kind === 'counter') {
    const role = project.roles.find((r) => r.id === m.roleId)
    const canResolve = project.lead === me && !m.resolution && project.status === 'signing'
    return (
      <div className="animate-rise rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
        <div className="flex items-center gap-2">
          <Avatar handle={m.author} size={24} />
          <span className="text-sm font-medium">{personName(m.author)}</span>
          <span className="text-xs text-muted">counter-offer · {timeAgo(m.at)}</span>
          {m.resolution && (
            <span className="ml-auto">
              <Badge tone={m.resolution === 'accepted' ? 'ok' : 'neutral'}>
                {m.resolution === 'accepted' ? 'Accepted' : 'Kept original'}
              </Badge>
            </span>
          )}
        </div>
        <p className="mt-3 font-display text-2xl font-bold">
          {role?.title}: ${m.amount?.toLocaleString('en-US')}
        </p>
        <p className="mt-2 text-sm leading-relaxed">{m.text}</p>
        {canResolve && role && (
          <>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                variant="accent"
                onClick={() => dispatch({ type: 'resolveCounter', projectId: project.id, messageId: m.id, accept: true })}
              >
                Accept ${m.amount}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: 'resolveCounter', projectId: project.id, messageId: m.id, accept: false })}
              >
                Keep ${role.pay}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Accepting updates the draft. Everyone who signed will be asked to sign again.
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={cx('flex gap-2', mine && 'flex-row-reverse')}>
      <Avatar handle={m.author} size={28} />
      <div className={cx('max-w-[80%]', mine && 'text-right')}>
        <p className="mb-1 text-xs text-muted">
          {personName(m.author)} · {timeAgo(m.at)}
        </p>
        <p
          className={cx(
            'inline-block rounded-2xl px-4 py-2 text-left text-sm leading-relaxed',
            mine ? 'bg-ink text-paper' : 'border border-line bg-card',
          )}
        >
          {m.text}
        </p>
      </div>
    </div>
  )
}
