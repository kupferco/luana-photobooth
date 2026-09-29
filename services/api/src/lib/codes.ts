import { randomBytes, randomInt } from 'node:crypto'

/**
 * Short codes that people read off a screen and type on a phone, often in a
 * dim room holding a drink.
 *
 * Crockford's alphabet minus the vowels: no 0/O, no 1/I/L, and no vowels so a
 * code cannot accidentally spell something unfortunate on someone's party
 * QR card.
 */
const ALPHABET = '23456789BCDFGHJKMNPQRSTVWXYZ'

function shortCode(length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return out
}

/**
 * What the guest QR encodes, and what someone types if the QR will not scan.
 * Six characters from a 28-letter alphabet is ~481 million combinations --
 * far more than enough given these are scoped to live events and rate
 * limited, and short enough to print legibly on a table card.
 */
export const eventJoinCode = () => shortCode(6)

/** Shown on the booth so a guest can tell which montage is theirs in a queue. */
export const sessionCode = () => shortCode(5)

/** Typed once by the owner when claiming a Pi. Short-lived. */
export const pairingCode = () => shortCode(6)

/**
 * The secret in a guest's URL. This is a credential, not a display code, so
 * it is full-strength randomness rather than something typeable.
 */
export const guestToken = () => randomBytes(32).toString('base64url')

/** The long-lived token a paired device holds. */
export const deviceToken = () => randomBytes(32).toString('base64url')

/**
 * Normalises what someone typed: upper case, separators stripped.
 *
 * Nothing is guessed beyond that. The alphabet already excludes *both* halves
 * of every confusable pair -- 0 and O, 1 and I and L -- so no valid code can
 * contain a character that might be misread as another valid one. A code
 * carrying one of those is simply wrong, and saying so beats silently
 * substituting a character and unlocking someone else's event.
 */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '')
}

/** True if every character could belong to a code we issued. */
export function isWellFormedCode(input: string): boolean {
  return input.length > 0 && [...input].every((c) => ALPHABET.includes(c))
}
