import { fixtureApi, FIXTURE_TENANT_ID } from './fixtures'
import { liveApi } from './live'
import type { PhotoboothApi } from './types'

/**
 * Which backend the screens talk to.
 *
 * Fixtures by default while the flows around the capture sequence are still
 * being designed -- signing in, the dashboard, the gallery, emailing a
 * montage. Set EXPO_PUBLIC_API_MODE=live to point at the real API.
 *
 * The capture path itself is not mocked: what could be wrong about it lives
 * in real timing and real uploads, which a fixture cannot reproduce.
 */
const MODE = process.env.EXPO_PUBLIC_API_MODE ?? 'fixtures'

export const usingFixtures = MODE !== 'live'

export const api: PhotoboothApi = usingFixtures ? fixtureApi : liveApi

export { FIXTURE_TENANT_ID }
export * from './types'
