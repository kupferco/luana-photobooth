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
  /*
   * No default.
   *
   * It used to fall back to the production bucket, so a deployment that
   * forgot to set this wrote guests' photographs into production and
   * looked like it was working. Failing to start is the better outcome.
   */
  GCS_BUCKET: z.string().min(1),

  /**
   * The Google AI key for generated artwork. Optional.
   *
   * Absent means the Generate button reports that it is not configured
   * rather than the service refusing to start: everything else in the
   * product works without it, and a missing key should not take a party's
   * booth down with it.
   */
  GOOGLE_AI_API_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().min(1),
  /** Must be on a domain verified in Resend, or sends fail silently-ish. */
  RESEND_FROM: z.string().default('Lumina <noreply@kupfer.co>'),

  /** At least 32 bytes. Generate with: openssl rand -base64 48 */
  JWT_SECRET: z.string().min(32),
  /** Short: a stolen access token should stop working quickly. */
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  /** Long: the owner should not be signed out mid-party. */
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 60),

  /**
   * Where a shared photo opens. Shared links are built here rather than in
   * the app, because email sends them too and there is only one right
   * answer per environment.
   */
  GUEST_URL: z.string().url().default('http://localhost:5173'),

  /**
   * Where the owner app lives, for emails that ask someone to sign in.
   *
   * Not GUEST_URL: that is the page a partygoer opens, and it has no way in.
   */
  APP_URL: z.string().url().default('http://localhost:8083'),

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
