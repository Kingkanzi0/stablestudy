import { SOCIAL_FIELDS } from '../lib/socials'

const ICONS = {
  x: 'M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z',
  telegram: 'M21.5 4.3 2.9 11.5c-1.3.5-1.2 2.3.1 2.7l4.7 1.5 1.8 5.6c.3.9 1.5 1.2 2.2.5l2.6-2.5 4.9 3.6c.8.6 2 .1 2.2-.9l3.2-15.4c.3-1.3-1-2.4-2.3-1.9Zm-3.4 4.1-8 7.3-.3 3.1-1.4-4.5 9.4-6.1c.4-.3.7.1.3.2Z',
  discord: 'M19.6 5.3A17 17 0 0 0 15.4 4l-.5 1.1a15.6 15.6 0 0 0-5.8 0L8.6 4a17 17 0 0 0-4.2 1.3C1.8 9.2 1 13 1.4 16.8a17.1 17.1 0 0 0 5.2 2.6l1.1-1.8a11 11 0 0 1-1.7-.8l.4-.3a12.2 12.2 0 0 0 11.2 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.8a17 17 0 0 0 5.2-2.6c.5-4.4-.8-8.2-3-11.5ZM8.5 14.5c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm7 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z',
  github: 'M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.7 9.7 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z',
  linkedin: 'M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4V21H3V9.5Zm6.5 0h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.2 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8V21h-4V9.5Z',
  website: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8ZM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4ZM4.3 14a8.2 8.2 0 0 1 0-4h3.3a16.5 16.5 0 0 0 0 4H4.3Zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16ZM8 8H5.1a8 8 0 0 1 4.3-3.6C8.8 5.5 8.3 6.7 8 8Zm4 12c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4Zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4Zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6Zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.3a8.2 8.2 0 0 1 0 4h-3.3Z',
}


function href(key, value) {
  if (key === 'x') return `https://x.com/${value}`
  if (key === 'telegram') return `https://t.me/${value}`
  if (key === 'github') return `https://github.com/${value}`
  if (key === 'linkedin' || key === 'website') return value
  return null // Discord usernames can't be linked to
}

/** Row of social links for a profile. */
export default function Socials({ socials, size = 18 }) {
  const entries = SOCIAL_FIELDS.filter((f) => socials?.[f.key])
  if (!entries.length) return null
  return (
    <ul className="socials">
      {entries.map((f) => {
        const value = socials[f.key]
        const url = href(f.key, value)
        const icon = (
          <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
            <path d={ICONS[f.key]} fill="currentColor" />
          </svg>
        )
        const text = f.key === 'website' || f.key === 'linkedin' ? value.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '') : `${f.prefix || ''}${value}`
        return (
          <li key={f.key}>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer nofollow" title={f.label}>
                {icon}
                <span>{text}</span>
              </a>
            ) : (
              <span title={f.label}>
                {icon}
                <span>{text}</span>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
