export const config = { runtime: 'edge' }

const API_BASE = 'https://api.openelectricity.org.au/v4'

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // Strip /api prefix, forward remaining path + query string to OE API
  const apiPath = url.pathname.replace(/^\/api/, '')
  const target  = `${API_BASE}${apiPath}${url.search}`

  const apiKey = process.env.OE_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OE_API_KEY env var not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const response = await fetch(target, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })

  const body = await response.text()

  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
