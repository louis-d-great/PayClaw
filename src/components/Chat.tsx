import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { parties, personName, useStore, type Channel } from '../store'
import { dmKey, type Attachment, type Handle, type Message, type Project } from '../types'
import { mediaKind, readFile as readRaw, sizeLabel } from '../lib/files'
import { Avatar, Badge, Button, cx } from './ui'

const readFile = async (f: File | Blob, name: string): Promise<Attachment> => {
  const r = await readRaw(f, name)
  return { ...r, kind: mediaKind(r.mime) }
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

function dayLabel(iso: string, now: number) {
  const d = new Date(iso)
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const channelMessages = (p: Project, channel: Channel) => (channel === 'group' ? p.messages : (p.dms[channel] ?? []))

export function unreadCount(p: Project, channel: Channel, me: Handle, seen: Record<string, string>) {
  const since = seen[`${p.id}:${channel}:${me}`] ?? ''
  return channelMessages(p, channel).filter((m) => m.author !== me && m.author !== 'system' && m.at > since).length
}

// Group chat plus a private DM with each other member of the project.
export default function ChatPanel({ project }: { project: Project }) {
  const { me, seen } = useStore()
  const members = parties(project)
  const inCrew = members.includes(me)
  const [channel, setChannel] = useState<Channel>('group')
  const others = members.filter((h) => h !== me)
  const dmWith = channel === 'group' ? undefined : others.find((h) => dmKey(me, h) === channel)
  // Switching "Viewing as" can leave a DM that isn't yours open; fall back to the group.
  const active: Channel = dmWith ? channel : 'group'

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 pt-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-bold">{dmWith ? personName(dmWith) : 'Group chat'}</p>
          {dmWith ? <Badge>Private</Badge> : <Badge tone="ok">Official record</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {dmWith
            ? 'Only you two can see this. DMs are never used as evidence, so agree on terms in the group chat.'
            : 'Everyone on the project sees this. It’s the evidence if there’s ever a dispute.'}
        </p>
        {inCrew && (
          <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto pb-3">
            <ChannelTab active={active === 'group'} onClick={() => setChannel('group')} unread={unreadCount(project, 'group', me, seen)}>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] text-paper">#</span> Group
            </ChannelTab>
            {others.map((h) => (
              <ChannelTab
                key={h}
                active={active === dmKey(me, h)}
                onClick={() => setChannel(dmKey(me, h))}
                unread={unreadCount(project, dmKey(me, h), me, seen)}
              >
                <Avatar handle={h} size={20} /> {personName(h)}
              </ChannelTab>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <Conversation key={active} project={project} channel={active} to={dmWith} canPost={inCrew} />
      </div>
    </div>
  )
}

function ChannelTab({ active, onClick, unread, children }: { active: boolean; onClick: () => void; unread: number; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition',
        active ? 'bg-ink text-paper' : 'bg-ink/5 text-muted hover:text-ink',
      )}
    >
      {children}
      {unread > 0 && !active && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] text-white">{unread}</span>}
    </button>
  )
}

function Conversation({ project, channel, to, canPost }: { project: Project; channel: Channel; to?: Handle; canPost: boolean }) {
  const { me, now, seen, dispatch } = useStore()
  const messages = channelMessages(project, channel)
  const end = useRef<HTMLDivElement>(null)
  const [replyTo, setReplyTo] = useState<Message | undefined>()
  const [viewing, setViewing] = useState<Attachment | undefined>()

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
    if (canPost) dispatch({ type: 'seen', projectId: project.id, channel })
  }, [messages.length, canPost, channel, project.id, dispatch])

  // ✓✓ once everyone else in this chat has opened it after the message was sent.
  const readers = channel === 'group' ? parties(project).filter((h) => h !== me) : to ? [to] : []
  const seenBy = (m: Message) => readers.length > 0 && readers.every((h) => (seen[`${project.id}:${channel}:${h}`] ?? '') >= m.at)
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-1 overflow-y-auto bg-paper/40 px-3 py-4">
        {messages.length === 0 && (
          <p className="mx-auto mt-8 max-w-xs text-center text-sm text-muted">
            {to ? `No messages with ${personName(to)} yet. Say hi.` : 'No messages yet.'}
          </p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || dayLabel(prev.at, now) !== dayLabel(m.at, now)
          const grouped = !!prev && !newDay && prev.author === m.author && m.kind === 'text' && prev.kind === 'text'
          return (
            <div key={m.id}>
              {newDay && (
                <p className="my-3 text-center">
                  <span className="rounded-full bg-card px-3 py-1 text-[11px] font-medium text-muted shadow-[0_0_0_1px_var(--color-line)]">
                    {dayLabel(m.at, now)}
                  </span>
                </p>
              )}
              <Item
                project={project}
                m={m}
                grouped={grouped}
                quoted={m.replyTo ? byId.get(m.replyTo) : undefined}
                seen={seenBy(m)}
                onReply={canPost ? () => setReplyTo(m) : undefined}
                onOpen={setViewing}
              />
            </div>
          )
        })}
        <div ref={end} />
      </div>
      {canPost ? (
        <Composer
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(undefined)}
          onSend={(text, attachments) => {
            dispatch({ type: 'say', projectId: project.id, text, attachments, replyTo: replyTo?.id, to })
            setReplyTo(undefined)
          }}
          placeholder={to ? `Message ${personName(to)}` : 'Message the crew'}
        />
      ) : (
        <p className="border-t border-line p-4 text-center text-sm text-muted">Only the crew can post here.</p>
      )}
      {viewing && <Lightbox a={viewing} onClose={() => setViewing(undefined)} />}
    </div>
  )
}

function Item({
  project,
  m,
  grouped,
  quoted,
  seen,
  onReply,
  onOpen,
}: {
  project: Project
  m: Message
  grouped: boolean
  quoted?: Message
  seen: boolean
  onReply?: () => void
  onOpen: (a: Attachment) => void
}) {
  const { me, dispatch } = useStore()

  if (m.kind === 'system')
    return (
      <p className="mx-auto my-2 max-w-sm rounded-xl bg-card/80 px-3 py-1.5 text-center text-xs leading-relaxed text-muted">
        {m.text} <span className="whitespace-nowrap opacity-70">· {clock(m.at)}</span>
      </p>
    )

  if (m.kind === 'counter') {
    const role = project.roles.find((r) => r.id === m.roleId)
    const canResolve = project.lead === me && !m.resolution && project.status === 'signing'
    return (
      <div className="animate-rise my-2 rounded-2xl border border-accent/30 bg-card p-4">
        <div className="flex items-center gap-2">
          <Avatar handle={m.author} size={24} />
          <span className="text-sm font-medium">{personName(m.author)}</span>
          <span className="text-xs text-muted">counter-offer · {clock(m.at)}</span>
          {m.resolution && (
            <span className="ml-auto">
              <Badge tone={m.resolution === 'accepted' ? 'ok' : 'neutral'}>{m.resolution === 'accepted' ? 'Accepted' : 'Closed'}</Badge>
            </span>
          )}
        </div>
        <p className="mt-3 font-display text-2xl font-bold">
          {role?.title}: ${m.amount?.toLocaleString('en-US')}
        </p>
        {m.depositPct !== undefined && m.amount !== undefined && (
          <p className="mt-1 text-sm text-muted">
            {m.depositPct}% up front (${Math.round((m.amount * m.depositPct) / 100).toLocaleString('en-US')} deposit)
            {!m.resolution && role && ` · currently $${role.pay.toLocaleString('en-US')} with ${role.depositPct}% up front`}
          </p>
        )}
        <p className="mt-2 text-sm leading-relaxed">{m.text}</p>
        {canResolve && role && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="accent" onClick={() => dispatch({ type: 'resolveCounter', projectId: project.id, messageId: m.id, accept: true })}>
                Accept ${m.amount}
              </Button>
              <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'resolveCounter', projectId: project.id, messageId: m.id, accept: false })}>
                Keep current terms
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">Accepting updates the draft. Everyone who signed will be asked to sign again.</p>
          </>
        )}
      </div>
    )
  }

  const mine = m.author === me
  return (
    <div className={cx('group flex items-end gap-2', mine && 'flex-row-reverse', grouped ? 'mt-0.5' : 'mt-3')}>
      <div className="w-7 shrink-0">{!grouped && !mine && <Avatar handle={m.author} size={28} />}</div>
      <div className={cx('flex min-w-0 max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
        {!grouped && !mine && <p className="mb-0.5 px-1 text-xs font-medium text-muted">{personName(m.author)}</p>}
        <div
          className={cx(
            'min-w-0 overflow-hidden rounded-2xl text-sm leading-relaxed',
            mine ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md border border-line bg-card',
          )}
        >
          {quoted && (
            <div className={cx('mx-1.5 mt-1.5 rounded-xl border-l-4 border-accent px-3 py-1.5 text-xs', mine ? 'bg-paper/10' : 'bg-paper')}>
              <p className="font-medium">{quoted.author === 'system' ? 'CrewPay' : personName(quoted.author)}</p>
              <p className="line-clamp-2 opacity-80">{quoted.text || (quoted.attachments?.length ? `📎 ${quoted.attachments[0].name}` : '')}</p>
            </div>
          )}
          {m.attachments?.map((a, i) => (
            <AttachmentView key={i} a={a} mine={mine} onOpen={() => onOpen(a)} />
          ))}
          <p className="whitespace-pre-wrap break-words px-3.5 pb-1.5 pt-2">
            {m.text}
            <span className={cx('float-right ml-3 mt-1.5 text-[10px] tabular-nums', mine ? 'text-paper/60' : 'text-muted')}>
              {clock(m.at)}
              {mine && (
                <span className={cx('ml-1', seen && 'text-accent')} aria-label={seen ? 'Seen' : 'Sent'}>
                  {seen ? '✓✓' : '✓'}
                </span>
              )}
            </span>
          </p>
        </div>
      </div>
      {onReply && (
        <button
          onClick={onReply}
          className="mb-1 shrink-0 rounded-full px-2 py-1 text-xs text-muted opacity-100 transition hover:bg-ink/5 hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
          aria-label="Reply"
        >
          ↩ Reply
        </button>
      )}
    </div>
  )
}

function AttachmentView({ a, mine, onOpen }: { a: Attachment; mine: boolean; onOpen: () => void }) {
  if (a.url && a.kind === 'image')
    return (
      <button onClick={onOpen} className="block w-full p-1">
        <img src={a.url} alt={a.name} className="max-h-64 w-full rounded-xl object-cover" />
      </button>
    )
  if (a.url && a.kind === 'audio')
    return (
      <div className="px-2 pt-2">
        <audio controls src={a.url} className="h-10 w-60 max-w-full" />
      </div>
    )
  if (a.url && a.kind === 'video')
    return (
      <div className="p-1">
        <video controls src={a.url} className="max-h-64 w-full rounded-xl" />
      </div>
    )
  const icon = a.kind === 'image' ? '🖼' : a.kind === 'audio' ? '🎙' : a.kind === 'video' ? '🎬' : '📄'
  return (
    <div className={cx('mx-1.5 mt-1.5 flex items-center gap-3 rounded-xl px-3 py-2', mine ? 'bg-paper/10' : 'bg-paper')}>
      <span className="text-lg">{icon}</span>
      <div className="min-w-0">
        <p className="truncate font-medium">{a.name}</p>
        <p className="text-xs opacity-70">
          {sizeLabel(a.size)}
          {!a.url && ' · saved when storage is connected'}
        </p>
      </div>
    </div>
  )
}

function Lightbox({ a, onClose }: { a: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4" onClick={onClose} role="dialog" aria-label={a.name}>
      <img src={a.url} alt={a.name} className="max-h-[85vh] max-w-full rounded-2xl" />
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-card px-4 py-1.5 text-sm">{a.name} · tap to close</p>
    </div>
  )
}

function Composer({
  replyTo,
  onCancelReply,
  onSend,
  placeholder,
}: {
  replyTo?: Message
  onCancelReply: () => void
  onSend: (text: string, attachments: Attachment[]) => void
  placeholder: string
}) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [recording, setRecording] = useState<{ rec: MediaRecorder; started: number } | undefined>()
  const [elapsed, setElapsed] = useState(0)
  const [notice, setNotice] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (replyTo) area.current?.focus()
  }, [replyTo])

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - recording.started) / 1000)), 250)
    return () => clearInterval(t)
  }, [recording])

  const send = () => {
    if (!text.trim() && files.length === 0) return
    onSend(text.trim(), files)
    setText('')
    setFiles([])
  }

  const addFiles = async (list: FileList | null) => {
    if (!list) return
    const read = await Promise.all([...list].map((f) => readFile(f, f.name)))
    setFiles((cur) => [...cur, ...read])
  }

  const startVoice = async () => {
    setNotice('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        if (blob.size === 0) return
        const voice = await readFile(blob, 'Voice note')
        setFiles((cur) => [...cur, { ...voice, kind: 'audio' }])
      }
      rec.start()
      setElapsed(0)
      setRecording({ rec, started: Date.now() })
    } catch {
      setNotice('Microphone isn’t available here. You can still attach an audio file.')
    }
  }

  const stopVoice = () => {
    recording?.rec.stop()
    setRecording(undefined)
  }

  return (
    <div className="border-t border-line bg-card p-2">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border-l-4 border-accent bg-paper px-3 py-2 text-xs">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Replying to {replyTo.author === 'system' ? 'CrewPay' : personName(replyTo.author)}</p>
            <p className="truncate text-muted">{replyTo.text || replyTo.attachments?.[0]?.name}</p>
          </div>
          <button onClick={onCancelReply} className="text-muted hover:text-ink" aria-label="Cancel reply">
            ×
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {files.map((f, i) => (
            <div key={i} className="relative shrink-0">
              {f.url && f.kind === 'image' ? (
                <img src={f.url} alt={f.name} className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <div className="flex h-16 w-32 flex-col justify-center rounded-xl bg-paper px-2 text-xs">
                  <span className="truncate font-medium">{f.kind === 'audio' ? '🎙 ' : '📄 '}{f.name}</span>
                  <span className="text-muted">{sizeLabel(f.size)}</span>
                </div>
              )}
              <button
                onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-ink text-xs text-paper"
                aria-label={`Remove ${f.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {notice && <p className="mb-2 px-2 text-xs text-warn">{notice}</p>}
      {recording ? (
        <div className="flex items-center gap-3 rounded-full bg-accent-soft px-4 py-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
          <span className="text-sm font-medium tabular-nums">
            Recording {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </span>
          <Button size="sm" variant="accent" className="ml-auto" onClick={stopVoice}>
            Done
          </Button>
        </div>
      ) : (
        <form
          className="flex items-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg text-muted hover:bg-ink/5 hover:text-ink"
            aria-label="Attach photos or files"
          >
            📎
          </button>
          <input ref={picker} type="file" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
          <textarea
            ref={area}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="max-h-[120px] min-h-10 flex-1 resize-none rounded-3xl border border-line bg-paper px-4 py-2 text-sm leading-6 outline-none focus:border-ink/40"
          />
          {text.trim() || files.length ? (
            <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-paper" aria-label="Send">
              ➤
            </button>
          ) : (
            <button
              type="button"
              onClick={startVoice}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink/5 text-lg hover:bg-ink/10"
              aria-label="Record a voice note"
            >
              🎙
            </button>
          )}
        </form>
      )}
    </div>
  )
}
