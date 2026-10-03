// Testnet only: tops a wallet up with Tempo's free test stablecoins, so a Lead can fund a
// project in the demo without buying anything. Proxied here because the RPC method isn't
// meant to be called from browsers.
const RPC = 'https://rpc.moderato.tempo.xyz'

export async function POST(request: Request) {
  const { address } = (await request.json().catch(() => ({}))) as { address?: string }
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return Response.json({ error: 'Send a wallet address.' }, { status: 400 })
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tempo_fundAddress', params: [address] }),
  })
  const json = (await res.json()) as { result?: unknown; error?: { message: string } }
  if (json.error) return Response.json({ error: json.error.message }, { status: 502 })
  return Response.json({ ok: true })
}
