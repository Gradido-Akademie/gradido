import { execSync } from 'node:child_process'
import { getLogger } from 'log4js'
import { LOG4JS_BASE_CATEGORY_NAME } from '@/config/const'

const logger = getLogger(`${LOG4JS_BASE_CATEGORY_NAME}.server.version`)

export interface BuildInfo {
  commit: string
  source: 'git' | 'env' | 'unknown'
}

let cached: BuildInfo | undefined

/**
 * Resolves the running backend's commit once and caches it, so `GET /version` can
 * report which build is live. Backend-only deploys are otherwise invisible from the
 * outside — the admin bundle hash only tracks admin builds (LOG-054) — so this makes
 * them verifiable with a plain curl.
 *
 * On ki-playground the backend runs straight from the git checkout, so
 * `git rev-parse HEAD` returns the deployed commit. A real production container has no
 * `.git`, so we fall back to a build/deploy-time `BUILD_COMMIT` env var, then to
 * "unknown". `__dirname` (backend/build) is inside the checkout and walks up to `.git`.
 */
function resolveBuildInfo(): BuildInfo {
  try {
    const commit = execSync('git rev-parse HEAD', {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (commit) {
      return { commit, source: 'git' }
    }
  } catch {
    // not a git checkout (e.g. a production container) — fall back to env/unknown
  }
  const fromEnv = process.env.BUILD_COMMIT?.trim()
  return fromEnv ? { commit: fromEnv, source: 'env' } : { commit: 'unknown', source: 'unknown' }
}

export function getBuildInfo(): BuildInfo {
  if (!cached) {
    cached = resolveBuildInfo()
    logger.info(`build commit ${cached.commit} (source: ${cached.source})`)
  }
  return cached
}
