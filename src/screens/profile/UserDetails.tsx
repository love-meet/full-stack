import { useTranslation } from 'react-i18next'
import type { Profile } from '../../hooks/useProfile'

type Props = {
  profile: Profile
  isMe: boolean
}

export default function UserDetails({ profile: p, isMe }: Props) {
  const { t } = useTranslation()
  const age = ageFromDob(p.dob)
  const birthday = formatBirthday(p.dob)
  const location = [p.city, p.region, p.country_name ?? p.country_code]
    .filter(Boolean)
    .join(', ')
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.display_name || '—'
  const lookingForLabels: Record<string, string> = {
    serious: t('profile.seriousRelationship'),
    casual: t('profile.casualDating'),
    friends: t('profile.newFriends'),
  }
  const lookingForLabel = lookingForLabels[p.looking_for ?? ''] ?? t('profile.casualRelationship')

  return (
    <div className="mx-4 my-3 bg-surface-2 rounded-2xl p-5 space-y-5">
      <Row icon="👤" iconColor="text-coral" title={t('profile.fullName')} value={fullName} />
      <Row icon="📍" iconColor="text-success" title={t('profile.location')} value={location || '—'} />
      <Row
        icon="🎂"
        iconColor="text-gold"
        title={t('profile.birthday')}
        value={birthday ? `${birthday}${age != null ? ` ${t('profile.yearsOld', { age })}` : ''}` : '—'}
      />
      <Row icon="ℹ︎" iconColor="text-coral" title={t('profile.bio')} value={p.bio || '—'} />
      <Row icon="♥" iconColor="text-rose" title={t('profile.relationshipInterests')} value={lookingForLabel} />
      <Row
        icon="✦"
        iconColor="text-rose"
        title={t('profile.hobbies')}
        value={p.interests.length ? p.interests.join(', ') : t('profile.noHobbies')}
      />
      {isMe && (
        <Row
          icon="◎"
          iconColor="text-magenta"
          title={t('profile.targetAgeRange')}
          value={p.age_min && p.age_max ? t('profile.yearsRange', { min: p.age_min, max: p.age_max }) : '—'}
        />
      )}
    </div>
  )
}

function Row({
  icon,
  iconColor,
  title,
  value,
}: {
  icon: string
  iconColor: string
  title: string
  value: string
}) {
  return (
    <div className="flex items-start gap-4">
      <span className={`text-base leading-none ${iconColor}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-ink-muted">{title}</div>
        <div className="text-sm text-ink whitespace-pre-wrap break-words">{value}</div>
      </div>
    </div>
  )
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  const t = new Date()
  let age = t.getFullYear() - d.getFullYear()
  const m = t.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--
  return age
}

function formatBirthday(dob: string | null): string {
  if (!dob) return ''
  const d = new Date(dob)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
