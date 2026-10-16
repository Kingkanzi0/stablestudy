import { useApi } from './useApi'

/** Public profile (name, picture, socials) for a wallet address. Cached across the app. */
export function useProfile(address) {
  const valid = /^0x[0-9a-fA-F]{40}$/.test(address || '')
  const { data } = useApi(valid ? `/profiles/${address.toLowerCase()}` : null, { enabled: valid })
  return data?.profile ?? null
}

/** The signed-in account's own profile. */
export function useMe() {
  return useApi('/me', { auth: true })
}
