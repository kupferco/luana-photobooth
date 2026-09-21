import { locales, type Locale } from '@dk/i18n'
import { router } from 'expo-router'
import { useLocale, useT } from '../../src/locale'
import { useSession } from '../../src/session'
import { useAppearance, type Appearance } from '../../src/theme'
import { Body, Button, Card, Label, Screen } from '../../src/ui'

const LANGUAGES: Record<Locale, string> = {
  'en-GB': 'English',
  'pt-BR': 'Português (Brasil)',
}

export default function Profile() {
  const t = useT()
  const { locale, setLocale } = useLocale()
  const { appearance, setAppearance } = useAppearance()
  const { user, signOut } = useSession()

  const appearances: Appearance[] = ['system', 'light', 'dark']

  return (
    <Screen>
      {user ? (
        <Card>
          <Label>{user.email}</Label>
          <Body muted>{t('app.name')}</Body>
        </Card>
      ) : null}

      <Card>
        <Label>{t('profile.language')}</Label>
        {locales.map((option) => (
          <Button
            key={option}
            label={LANGUAGES[option]}
            variant={option === locale ? 'primary' : 'secondary'}
            onPress={() => setLocale(option)}
          />
        ))}
      </Card>

      <Card>
        <Label>{t('profile.appearance')}</Label>
        {appearances.map((option) => (
          <Button
            key={option}
            label={t(`profile.${option}`)}
            variant={option === appearance ? 'primary' : 'secondary'}
            onPress={() => setAppearance(option)}
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
