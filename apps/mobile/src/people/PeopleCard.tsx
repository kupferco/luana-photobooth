import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { api } from '../api'
import type { Member } from '../api/types'
import { ApiError } from '../api/types'
import { useT } from '../locale'
import { useTheme } from '../theme'
import { Body, Button, Card, Field, Label, Notice, Spinner } from '../ui'

/**
 * Who else can run this -- one party, or the whole account.
 *
 * One component for both because they are the same screen to whoever reads
 * it, and differ only in reach. Passing an event narrows it to that party:
 * the person sees it and nothing else on the account, which is what "help
 * me with Saturday" should mean.
 *
 * Account-wide still exists for the other case -- a partner who co-runs
 * everything, or a company account -- and is worth keeping separate rather
 * than making somebody re-invite the same person for every party.
 *
 * There is nothing to accept. Adding an address is the whole of it: they
 * sign in with their own email the usual way and the party is there. So
 * this never shows a pending state, because there isn't one.
 */
export function PeopleCard({
  tenantId,
  eventId,
}: {
  tenantId: string
  /** Given: this one party. Omitted: every party on the account. */
  eventId?: string
}) {
  const t = useT()
  const theme = useTheme()

  const [members, setMembers] = useState<Member[] | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(
    null,
  )
  /** Removing asks twice, on the row's own button. See the booth's delete. */
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = eventId
        ? await api.listEventMembers(tenantId, eventId)
        : await api.listMembers(tenantId)
      setMembers(result.members)
      setCanManage(result.canManage)
    } catch (e) {
      setNotice({ tone: 'bad', text: e instanceof Error ? e.message : String(e) })
      setMembers([])
    }
  }, [tenantId, eventId])

  useEffect(() => {
    void load()
  }, [load])

  const add = useCallback(async () => {
    const address = email.trim()
    if (!address || busy) return

    setBusy(true)
    setNotice(null)
    try {
      const { member, created } = eventId
        ? await api.addEventMember(tenantId, eventId, address)
        : await api.addMember(tenantId, address)
      setEmail('')
      await load()
      setNotice({
        tone: 'good',
        text: created
          ? t('people.invited', { email: member.email })
          : t('people.alreadyThere', { email: member.email }),
      })
    } catch (e) {
      setNotice({
        tone: 'bad',
        text:
          e instanceof ApiError
            ? e.message
            : t('people.inviteFailed'),
      })
    } finally {
      setBusy(false)
    }
  }, [email, busy, tenantId, eventId, load, t])

  const remove = useCallback(
    async (member: Member) => {
      if (confirming !== member.userId) {
        setConfirming(member.userId)
        return
      }
      setConfirming(null)
      setBusy(true)
      setNotice(null)
      try {
        if (eventId) await api.removeEventMember(tenantId, eventId, member.userId)
        else await api.removeMember(tenantId, member.userId)
        await load()
      } catch (e) {
        setNotice({
          tone: 'bad',
          text: e instanceof ApiError ? e.message : t('people.removeFailed'),
        })
      } finally {
        setBusy(false)
      }
    },
    [confirming, tenantId, eventId, load, t],
  )

  return (
    <Card>
      <Label>{t(eventId ? 'people.eventTitle' : 'people.title')}</Label>

      {members === null ? (
        <Spinner />
      ) : (
        members.map((member) => (
          <View key={member.userId} style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: theme.color.text.primary, fontSize: theme.fontSize.md }}
                  numberOfLines={1}
                >
                  {member.name ?? member.email}
                </Text>
                <Text
                  style={{
                    color: theme.color.text.secondary,
                    fontSize: theme.fontSize.xs,
                  }}
                  numberOfLines={1}
                >
                  {/* Both lines would repeat when there is no name yet, which
                      is every invitee who has not signed in. */}
                  {[
                    member.name ? member.email : null,
                    t(`people.role.${member.role}`),
                    member.isYou ? t('people.you') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>

              {/* Removing yourself is not offered: it is the one change you
                  cannot undo from in here, and the server refuses it anyway
                  when you are the last owner. */}
              {canManage && !member.isYou ? (
                <View style={{ minWidth: 120 }}>
                  <Button
                    label={
                      confirming === member.userId
                        ? t('people.removeConfirm')
                        : t('people.remove')
                    }
                    variant={confirming === member.userId ? 'danger' : 'secondary'}
                    disabled={busy}
                    onPress={() => void remove(member)}
                  />
                </View>
              ) : null}
            </View>
          </View>
        ))
      )}

      {canManage ? (
        <>
          <Field
            label={t('people.emailLabel')}
            hint={t(eventId ? 'people.eventHint' : 'people.hint')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            inputMode="email"
            placeholder="name@example.com"
            onSubmitEditing={() => void add()}
          />
          <Button
            label={t('people.invite')}
            busy={busy}
            disabled={!email.trim()}
            onPress={() => void add()}
          />
        </>
      ) : (
        <Body muted>{t('people.ownerOnly')}</Body>
      )}

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
    </Card>
  )
}
