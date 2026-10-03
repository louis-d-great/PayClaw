import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'

// In development, serve the Vercel functions in api/ from the Vite server, so /api/relay and
// /api/faucet work on localhost exactly as they do on Vercel.
function vercelApi(): Plugin {
  return {
    name: 'crewpay-vercel-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const name = req.url?.match(/^\/api\/([a-z-]+)/)?.[1]
        if (!name) return next()
        try {
          const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<string, (r: Request) => Promise<Response> | Response>
          const fn = mod[req.method ?? 'GET']
          if (!fn) return void res.writeHead(405).end()
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const response = await fn(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body }))
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          server.config.logger.error(String(e))
          res.statusCode = 500
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Server-only secrets (no VITE_ prefix) for the api/ functions in development.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return { plugins: [react(), tailwindcss(), vercelApi()] }
})
