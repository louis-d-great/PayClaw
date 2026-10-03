import { keccak256, toBytes } from 'viem'

// What a submission commits to on-chain: its note and the exact files. The app hashes this
// into the vault's workHash; the server recomputes it before recording the submission, so the
// words and files on the milestone page are provably the ones that were submitted.
export type WorkFile = { name: string; size: number; mime?: string; kind: 'preview' | 'final'; path: string }

export const workPayload = (note: string, files: WorkFile[]) => JSON.stringify({ note, files: files.map((f) => f.path) })
export const workHash = (note: string, files: WorkFile[]) => keccak256(toBytes(workPayload(note, files)))
export const noteHash = (note: string) => keccak256(toBytes(note))
