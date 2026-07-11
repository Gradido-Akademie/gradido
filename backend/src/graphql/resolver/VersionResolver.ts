import { BackendVersion } from '@model/BackendVersion'
import { Query, Resolver } from 'type-graphql'
import { getBuildInfo } from '@/server/version'

@Resolver()
export class VersionResolver {
  /**
   * Public (no @Authorized): reports the running backend's commit so a backend-only
   * deploy can be verified with a plain POST to /graphql. The admin bundle hash cannot
   * show a backend-only deploy (LOG-054). Exposes only the commit SHA — the repo is
   * open source — and the resolution source (git | env | unknown).
   */
  @Query(() => BackendVersion)
  version(): BackendVersion {
    return getBuildInfo()
  }
}
