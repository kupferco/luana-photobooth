import 'dotenv/config'
import { z } from 'zod'

/**
 * Validated once at boot. A missing secret should stop the process here with
 * a readable message, not surface as an undefined halfway through someone's
 * sign-in.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),

  GCP_PROJECT_ID: z.string().default('photolu'),
  GCS_BUCKET: z.string().default('photolu-media'),

  RESEND_API_KEY: z.string().min(1),
  /** Must be on a domain verified in Resend, or sends fail silently-ish. */
  RESEND_FROM: z.string().default('Photo Booth <noreply@kupfer.co>'),

  /** At least 32 bytes. Generate with: openssl rand -base64 48 */
  JWT_SECRET: z.string().min(32),
  /** Short: a stolen access token should stop working quickly. */
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  /** Long: the owner should not be signed out mid-party. */
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 60),

  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  throw new Error(
    `Environment is not usable:\n${missing}\n\nCopy services/api/.env.example to .env and fill it in.`,
  )
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'
