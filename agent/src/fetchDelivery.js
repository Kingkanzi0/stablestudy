const MAX_BYTES = 400_000
const MAX_CHARS = 40_000
const TIMEOUT_MS = 20_000

/** Turns HTML into readable text: drops scripts/styles, keeps headings, links and list breaks. */
export function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<h([1-6])[^>]*>/gi, (_, n) => `\n${'#'.repeat(Number(n))} `)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

/** For a GitHub repo link, also read its README so the judge sees what the repo contains. */
export function githubReadmeUrl(url) {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)\/?$/.exec(url)
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2].replace(/\.git$/, '')}/HEAD/README.md` : null
}

async function fetchText(url, fetchImpl) {
  const res = await fetchImpl(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'iSabi-Verifier-Agent/1.0' },
  })
  const type = res.headers.get('content-type') || ''
  if (!res.ok) return { ok: false, status: res.status, contentType: type, text: '' }
  if (!/text|json|xml|markdown/i.test(type) && type) {
    return { ok: true, status: res.status, contentType: type, text: `[Binary file of type ${type}; content not readable as text]` }
  }
  const buf = await res.arrayBuffer()
  let text = new TextDecoder().decode(buf.slice(0, MAX_BYTES))
  if (/html/i.test(type)) text = htmlToText(text)
  return { ok: true, status: res.status, contentType: type, text }
}

/**
 * Fetches what the provider delivered. Never throws: returns { ok:false, error } if it can't be read,
 * so the judge can say so in its report.
 */
export async function fetchDelivery(url, fetchImpl = fetch) {
  try {
    const main = await fetchText(url, fetchImpl)
    let text = main.text
    const readme = githubReadmeUrl(url)
    if (readme) {
      const r = await fetchText(readme, fetchImpl).catch(() => null)
      if (r?.ok && r.text) text = `${text}\n\n--- README.md ---\n${r.text}`
    }
    if (!main.ok) return { ok: false, error: `The link returned HTTP ${main.status}.`, text: '' }
    const truncated = text.length > MAX_CHARS
    return { ok: true, contentType: main.contentType, text: text.slice(0, MAX_CHARS), truncated }
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timed out' : err.message
    return { ok: false, error: `The link could not be opened (${reason}).`, text: '' }
  }
}
