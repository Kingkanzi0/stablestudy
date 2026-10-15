import { network } from '../config/network'

const TOKEN_KEY = 'skillpay.session'

export function loadSession() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return s.expiresAt > Date.now() ? s : null
  } catch {
    return null
  }
}

export function saveSession(session) {
  try {
    if (session) localStorage.setItem(TOKEN_KEY, JSON.stringify(session))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable: session lasts for this tab only */
  }
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  let res
  try {
    res = await fetch(`${network.apiUrl}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Can’t reach the iSabi server. Check your connection and try again.')
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.details)
  return data
}

/** Ask the API to index a confirmed transaction right away. Failures are non-fatal. */
export async function syncTx(txHash) {
  for (let i = 0; i < 3; i++) {
    try {
      return await api('/sync', { method: 'POST', body: { txHash } })
    } catch (e) {
      if (e.status !== 404) return null
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  return null
}
