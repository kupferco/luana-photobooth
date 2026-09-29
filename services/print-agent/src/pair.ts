import { pair, saveToken } from './client'

/**
 * Claims this Pi for an event.
 *
 *   npm run pair -- ABC123
 *
 * The code comes from the event in the app and is good for fifteen minutes
 * and one use. After this the Pi never needs a person again: the token is on
 * disk and survives reboots and redeploys.
 */
const code = process.argv[2]

if (!code) {
  console.error('Usage: npm run pair -- <CODE>\n\nGet a code from the event in the app.')
  process.exit(1)
}

try {
  const { token, eventId } = await pair(code.trim())
  await saveToken(token)
  console.log(
    `\n  Paired.${eventId ? ` Attached to event ${eventId}.` : ''}\n` +
      `  Start the agent with: npm start\n`,
  )
} catch (e) {
  console.error(`\n  ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
}
