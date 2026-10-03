import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { addressUrl, balanceOf, createWallet, fromUsd6, getTestDollars, shortAddress, walletsEnabled } from '../lib/tempo'
import { personName, useStore } from '../store'
import { Button, Card, Money } from './ui'

/** The signed-in person's wallet address, if they've set one up. */
export function useMyWallet() {
  const { me, profiles } = useStore()
  return profiles[me]?.wallet as Address | undefined
}

export function useBalance(address?: Address) {
  const [balance, setBalance] = useState<number | undefined>()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!address) return
    let live = true
    balanceOf(address)
      .then((b) => live && setBalance(fromUsd6(b)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [address, tick])
  return { balance, refresh: () => setTick((t) => t + 1) }
}

export const friendlyError = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  if (/NotAllowedError|not allowed|cancel|abort/i.test(msg)) return 'The passkey prompt was closed. Try again when you’re ready.'
  return msg.split('\n')[0].slice(0, 220)
}

/** Creates the wallet with a passkey. Used on the dashboard and inline when signing or funding. */
export function CreateWalletButton({ onDone, label = 'Create my wallet' }: { onDone?: (a: Address) => void; label?: string }) {
  const { me, userId, refresh } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div>
      <Button
        variant="accent"
        disabled={busy || !userId}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            const address = await createWallet(userId!, `${personName(me)} (CrewPay)`)
            await refresh()
            onDone?.(address)
          } catch (e) {
            setError(friendlyError(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Waiting for your passkey…' : label}
      </Button>
      {error && <p className="mt-2 text-sm text-warn">{error}</p>}
    </div>
  )
}

/** Dashboard card: set up the wallet, or see its balance and top it up with test dollars. */
export function WalletCard() {
  const { mode } = useStore()
  const wallet = useMyWallet()
  const { balance, refresh } = useBalance(wallet)
  const [topping, setTopping] = useState(false)
  if (mode !== 'live' || !walletsEnabled) return null

  if (!wallet)
    return (
      <Card className="mb-8 flex flex-wrap items-center gap-5 p-6">
        <div className="min-w-60 flex-1">
          <p className="font-display text-xl font-bold">Set up your CrewPay wallet</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            It’s where your pay arrives and how you sign deals. You unlock it with a passkey: Face ID, your fingerprint, your
            Windows PIN or your phone. No app to install, no seed phrase, and CrewPay pays every network fee.
          </p>
        </div>
        <CreateWalletButton />
      </Card>
    )

  return (
    <Card className="mb-8 flex flex-wrap items-center gap-4 p-5">
      <div className="flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Your CrewPay wallet · Tempo testnet</p>
        <p className="mt-1">
          {balance === undefined ? <span className="text-muted">Checking balance…</span> : <Money value={Math.floor(balance * 100) / 100} className="text-2xl font-bold" />}
        </p>
        <a href={addressUrl(wallet)} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted hover:text-ink">
          {shortAddress(wallet)} ↗
        </a>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={topping}
        onClick={async () => {
          setTopping(true)
          try {
            await getTestDollars(wallet)
            refresh()
          } finally {
            setTopping(false)
          }
        }}
      >
        {topping ? 'Adding…' : 'Get test dollars'}
      </Button>
    </Card>
  )
}
