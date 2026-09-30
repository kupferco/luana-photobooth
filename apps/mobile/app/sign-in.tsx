import { router } from 'expo-router'
import { createElement, useCallback, useRef, useState } from 'react'
import { Image, Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, ApiError } from '../src/api'
import { useT } from '../src/locale'
import { useSession } from '../src/session'
import { Body, Button, Field, Heading, Notice, Screen } from '../src/ui'

const MARK = require('../assets/logo-colour.png')
const MARK_SIZE = { width: 180, height: 120 }

/**
 * The mark, with the same white light it has on the landing page, so its
 * black outline does not vanish into a dark screen.
 *
 * On the web it is a plain <img>, not an <Image>. The light is a CSS drop
 * shadow, which follows the drawing's own edge -- but react-native-web draws
 * an Image as a background on a box, and the shadow then lights up the box:
 * a glowing rectangle with the figures inside it.
 *
 * Native gets the mark without the light. Nothing there follows the edge of
 * a drawing on iOS, and a rectangle of light is worse than none.
 */
function Mark({ label }: { label: string }) {
  if (Platform.OS !== 'web') {
    return (
      <Image source={MARK} accessibilityLabel={label} resizeMode="contain" style={MARK_SIZE} />
    )
  }

  // On the web Metro resolves an image to its URL, or to an object holding it.
  const asset = MARK as string | { uri: string }

  return createElement('img', {
    src: typeof asset === 'string' ? asset : asset.uri,
    alt: label,
    style: {
      ...MARK_SIZE,
      objectFit: 'contain',
      filter:
        'drop-shadow(0 0 2px rgba(255,255,255,0.85)) drop-shadow(0 0 14px rgba(255,255,255,0.5)) drop-shadow(0 0 36px rgba(255,255,255,0.4))',
    },
  })
}

/**
 * Email, then a six-digit code. Both steps live on one screen so the code
 * never travels in a route param, and so someone switching to their mail app
 * and back finds the half-finished form still here -- nothing depended on
 * following a link.
 */
export default function SignIn() {
  const { signIn } = useSession()
  const t = useT()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sentAt = useRef<number>(0)

  const requestCode = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await api.requestCode(email.trim())
      sentAt.current = Date.now()
      setStep('code')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('auth.couldNotSend'))
    } finally {
      setBusy(false)
    }
  }, [email])

  const verify = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const { user } = await api.verifyCode(email.trim(), code.trim())
      signIn(user)
      router.replace('/(tabs)')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('auth.couldNotSignIn'))
      setCode('')
    } finally {
      setBusy(false)
    }
  }, [email, code, signIn])

  return (
    <Screen>
      {/* Where the header used to be. The inset is what the header was
          quietly providing: without it the mark sits under the notch. */}
      <View style={{ alignItems: 'center', paddingTop: insets.top + 40, paddingBottom: 24 }}>
        <Mark label={t('app.name')} />
      </View>

      <Heading>{step === 'email' ? t('auth.signIn') : t('auth.checkEmail')}</Heading>

      {step === 'email' ? (
        <>
<Body muted>{t('auth.emailStep')}</Body>

          <Field
            label={t('auth.emailLabel')}
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            inputMode="email"
            returnKeyType="go"
            onSubmitEditing={requestCode}
          />

          {error ? <Notice tone="bad">{error}</Notice> : null}

          <Button
            label={t('auth.sendCode')}
            onPress={requestCode}
            busy={busy}
            disabled={!email.includes('@')}
          />
        </>
      ) : (
        <>
<Body muted>{t('auth.codeSentTo', { email })}</Body>

          <Field
            label={t('auth.codeLabel')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder={t('auth.codePlaceholder')}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={verify}
            style={{ letterSpacing: 8, fontSize: 28 }}
          />

          {error ? <Notice tone="bad">{error}</Notice> : null}

          <Button
            label={t('auth.signIn')}
            onPress={verify}
            busy={busy}
            disabled={code.length !== 6}
          />
          <Button
            label={t('auth.differentEmail')}
            variant="secondary"
            onPress={() => {
              setStep('email')
              setCode('')
              setError(null)
            }}
          />
        </>
      )}
    </Screen>
  )
}
