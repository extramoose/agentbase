const cache = new Map<string, { data: UnfurlData; expires: number }>()
const MAX_CACHE = 200
const TTL_MS = 5 * 60 * 1000

interface UnfurlData {
  title: string | null
  description: string | null
  image: string | null
  favicon: string | null
  domain: string | null
}

function extractMeta(html: string, property: string): string | null {
  // Match <meta property="..." content="..."> and <meta name="..." content="...">
  // Also handles content before property/name attribute
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

function extractFavicon(html: string, origin: string): string | null {
  // Try <link rel="icon" href="..."> and <link rel="shortcut icon" href="...">
  const patterns = [
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']*)["']/i,
    /<link[^>]+href=["']([^"']*)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) {
      const href = m[1]
      if (href.startsWith('http')) return href
      if (href.startsWith('//')) return `https:${href}`
      if (href.startsWith('/')) return `${origin}${href}`
      return `${origin}/${href}`
    }
  }
  return `${origin}/favicon.ico`
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return m?.[1]?.trim() || null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  // Validate URL
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const domain = parsed.hostname.replace(/^www\./, '')

  // Check cache
  const cached = cache.get(url)
  if (cached && cached.expires > Date.now()) {
    return Response.json(cached.data)
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AgentBase/1.0; +https://agentbase.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return Response.json({ title: null, description: null, image: null, favicon: null, domain } satisfies UnfurlData)
    }

    const html = await res.text()
    const origin = parsed.origin

    const ogTitle = extractMeta(html, 'og:title')
    const ogDesc = extractMeta(html, 'og:description')
    const ogImage = extractMeta(html, 'og:image')
    const twitterTitle = extractMeta(html, 'twitter:title')
    const twitterDesc = extractMeta(html, 'twitter:description')
    const twitterImage = extractMeta(html, 'twitter:image')
    const metaDesc = extractMeta(html, 'description')
    const pageTitle = extractTitle(html)

    const data: UnfurlData = {
      title: ogTitle || twitterTitle || pageTitle || null,
      description: ogDesc || twitterDesc || metaDesc || null,
      image: ogImage || twitterImage || null,
      favicon: extractFavicon(html, origin),
      domain,
    }

    // Store in cache, evict oldest if over limit
    if (cache.size >= MAX_CACHE) {
      const oldest = cache.keys().next().value
      if (oldest) cache.delete(oldest)
    }
    cache.set(url, { data, expires: Date.now() + TTL_MS })

    return Response.json(data)
  } catch {
    // Timeout or fetch error — return domain only
    return Response.json({ title: null, description: null, image: null, favicon: null, domain } satisfies UnfurlData)
  }
}
