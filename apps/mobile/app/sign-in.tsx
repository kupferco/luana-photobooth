import { router } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { Text } from 'react-native'
import { api, ApiError } from '../src/api'
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
      setError(e instanceof ApiError ? e.message : 'Could not send the code.')
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
      router.replace('/events')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign you in.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }, [email, code, signIn])

  return (
    <Screen>
      <Heading>{step === 'email' ? 'Sign in' : 'Check your email'}</Heading>

      {step === 'email' ? (
        <>
          <Body muted>
            We will email you a six-digit code. No password to remember.
          </Body>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
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
            label="Send me a code"
            onPress={requestCode}
            busy={busy}
            disabled={!email.includes('@')}
          />
        </>
      ) : (
        <>
          <Body muted>
            We sent a code to <Text style={{ fontWeight: '600' }}>{email}</Text>. It
            expires in ten minutes.
          </Body>

          <Field
            label="Six-digit code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
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
            label="Sign in"
            onPress={verify}
            busy={busy}
            disabled={code.length !== 6}
          />
          <Button
            label="Use a different email"
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
