import { createClient } from '@supabase/supabase-js'

// Set in .env.local (and in Vercel). Without them the app runs the offline demo.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = url && key ? createClient(url, key) : null

export const BUCKET = 'project-files'
