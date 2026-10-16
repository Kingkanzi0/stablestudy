import { Link } from 'react-router-dom'
import { Avatar } from './common'
import { useAuth } from '../hooks/useAuth'
import { useMe } from '../hooks/useProfile'

/** Header link to the account: a "Sign in" button, or the person's picture once signed in. */
export default function AccountButton() {
  const { isSignedIn, user } = useAuth()
  const me = useMe()
  if (!isSignedIn) {
    return (
      <Link to="/signin" className="btn btn-ghost account-signin">
        Sign in
      </Link>
    )
  }
  const profile = me.data?.profile || { id: user.id, email: user.email, address: user.wallet }
  return (
    <Link to="/profile" className="account-button" aria-label="Your profile" title={profile.displayName || profile.email || 'Your profile'}>
      <Avatar person={profile} size={36} />
    </Link>
  )
}
