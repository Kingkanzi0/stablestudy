/** Project logo, or a coloured initial when there isn't one. */
export default function CampaignLogo({ campaign, size = 44 }) {
  if (campaign.logoUrl) {
    return <img className="campaign-logo" src={campaign.logoUrl} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />
  }
  const hue = [...campaign.projectName].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)
  return (
    <span className="campaign-logo campaign-logo-initial" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 50% 40%)` }}>
      {campaign.projectName.charAt(0).toUpperCase()}
    </span>
  )
}
