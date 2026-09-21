import { router } from 'expo-router'
import { useState } from 'react'
import { api, ApiError } from '../../src/api'
import { useT } from '../../src/locale'
import { useSession } from '../../src/session'
import { Body, Button, Field, Heading, Notice, Screen } from '../../src/ui'

export default function NewEvent() {
  const { tenantId } = useSession()
  const t = useT()
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!tenantId) return
    setBusy(true)
    setError(null)
    try {
      const event = await api.createEvent(tenantId, {
        name: name.trim(),
        eventDate: new Date(date).toISOString(),
      })
      router.replace(`/events/${event.id}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('events.couldNotCreate'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Heading>{t('events.createTitle')}</Heading>
<Body muted>{t('events.createHint')}</Body>

      <Field
        label={t('events.nameLabel')}
        value={name}
        onChangeText={setName}
        placeholder={t('events.namePlaceholder')}
        autoFocus
      />
      <Field
        label={t('events.dateLabel')}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        hint="A proper date picker goes here once the flow settles."
      />

      {error ? <Notice tone="bad">{error}</Notice> : null}

      <Button label={t('events.create')} onPress={create} busy={busy} disabled={name.trim().length === 0} />
    </Screen>
  )
}
