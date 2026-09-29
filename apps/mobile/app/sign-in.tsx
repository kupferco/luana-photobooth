import { router } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { api, ApiError } from '../src/api'
import { useT } from '../src/locale'
import { useSession } from '../src/session'
import { Body, Button, Field, Heading, Notice, Screen } from '../src/ui'

/**
 * Email, then a six-digit code. Both steps live on one screen so the code
 * never travels in a route param, and so someone switching to their mail app
 * and back finds the half-finished form still here -- nothing depended on
 * following a link.
 */
export default function SignIn() {
  const { signIn } = useSession()
  const t = useT()
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
