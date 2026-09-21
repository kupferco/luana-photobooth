import { locales, type Locale } from '@dk/i18n'
import { router } from 'expo-router'
import { useLocale, useT } from '../src/locale'
import { useSession } from '../src/session'
import { Body, Button, Card, Heading, Label, Screen } from '../src/ui'

const LABELS: Record<Locale, string> = {
  'en-GB': 'English',
  'pt-BR': 'Português (Brasil)',
}

export default function Settings() {
  const t = useT()
  const { locale, setLocale } = useLocale()
  const { user, signOut } = useSession()

  return (
    <Screen>
      <Heading>{t('nav.settings')}</Heading>

      <Card>
        <Label>{user?.email ?? ''}</Label>
        <Body muted>{t('app.name')}</Body>
      </Card>

      <Card>
        <Label>Language</Label>
        {locales.map((option) => (
          <Button
            key={option}
            label={LABELS[option]}
            variant={option === locale ? 'primary' : 'secondary'}
            onPress={() => setLocale(option)}
          />
        ))}
      </Card>

      <Button
        label={t('auth.signOut')}
        variant="secondary"
        onPress={async () => {
          await signOut()
          router.replace('/sign-in')
        }}
      />
    </Screen>
  )
}
