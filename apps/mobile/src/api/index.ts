import { fixtureApi, FIXTURE_TENANT_ID } from './fixtures'
import { liveApi } from './live'
import type { PhotoboothApi } from './types'

/**
 * Which backend the screens talk to.
 *
 * The real API is the default, including locally: `npm run client` should
 * give you the actual product, not a rehearsal of it. Needing a second
 * command for the real thing was friction with no purpose.
 *
 * Fixtures are opt-in, via `npm run client:fixtures`, for designing screens
 * without a server running. They are not a mode anything ships in.
 */
const MODE = process.env.EXPO_PUBLIC_API_MODE ?? 'live'

export const usingFixtures = MODE === 'fixtures'

export const api: PhotoboothApi = usingFixtures ? fixtureApi : liveApi

export { FIXTURE_TENANT_ID }
export * from './types'
