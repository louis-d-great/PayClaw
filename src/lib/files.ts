// Files up to this size are kept inline as data URLs in the prototype so they survive a reload.
// Supabase Storage replaces this with real uploads.
export const INLINE_LIMIT = 1_500_000

export type MediaKind = 'image' | 'audio' | 'video' | 'file'

export const mediaKind = (mime = ''): MediaKind =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'file'

export type ReadFile = { name: string; size: number; mime: string; url?: string }

export const readFile = (f: File | Blob, name: string): Promise<ReadFile> =>
  new Promise((resolve) => {
    const base = { name, size: f.size, mime: f.type || 'application/octet-stream' }
    if (f.size > INLINE_LIMIT) return resolve(base)
    const r = new FileReader()
    r.onload = () => resolve({ ...base, url: String(r.result) })
    r.onerror = () => resolve(base)
    r.readAsDataURL(f)
  })

export const sizeLabel = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`)
