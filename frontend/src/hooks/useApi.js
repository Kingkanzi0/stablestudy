import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from './useAuth'

/**
 * GET an API path with react-query caching.
 * auth: true waits for a session token; auth: 'optional' sends it when there is one.
 */
export function useApi(path, { auth = false, enabled = true } = {}) {
  const { token } = useAuth()
  return useQuery({
    queryKey: ['api', path, auth ? token : null],
    queryFn: () => api(path, { token: auth ? token : undefined }),
    enabled: Boolean(path) && enabled && (auth !== true || Boolean(token)),
    retry: (count, err) => err.status >= 500 && count < 2,
  })
}
