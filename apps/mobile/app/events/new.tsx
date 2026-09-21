import { router } from 'expo-router'
import { useState } from 'react'
import { api, ApiError } from '../../src/api'
import { useSession } from '../../src/session'
import { Body, Button, Field, Heading, Notice, Screen } from '../../src/ui'

export default function NewEvent() {
  const { tenantId } = useSession()
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
      setError(e instanceof ApiError ? e.message : 'Could not create the party.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Heading>New party</Heading>
      <Body muted>
        You can change any of this later. Photos are kept for 90 days after the
        date you set.
      </Body>

      <Field
        label="What is it called?"
        value={name}
        onChangeText={setName}
        placeholder="Luana's 8th birthday"
        autoFocus
      />
      <Field
        label="When?"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        hint="A proper date picker goes here once the flow settles."
      />

      {error ? <Notice tone="bad">{error}</Notice> : null}

      <Button label="Create" onPress={create} busy={busy} disabled={name.trim().length === 0} />
    </Screen>
  )
}
