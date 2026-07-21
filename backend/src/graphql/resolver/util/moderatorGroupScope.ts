import { RoleNames } from '@enum/RoleNames'
import {
  Contribution as DbContribution,
  GroupTag as DbGroupTag,
  UserRole as DbUserRole,
} from 'database'
import { In } from 'typeorm'
import { LogError } from '@/server/LogError'
import { buildModeratorScopePredicate, parseModeratorScope } from './findContributions'

// Both moderator kinds are scoped alike: a MODERATOR_AI is a moderator who may additionally
// use Crea — not a wider role. Every visibility-scope check goes through this helper, so a
// moderator-like role cannot silently slip past the scope. Admins stay unrestricted.
export const isScopedModeratorRole = (role?: string | null): boolean =>
  role === RoleNames.MODERATOR || role === RoleNames.MODERATOR_AI

// The visibility scope is a real access boundary, not merely a list filter: a scoped
// moderator may only act on contributions their scope covers. This gates the action being
// attempted NOW — anything they did earlier stays untouched in the record, it just cannot
// be continued once the group is taken away. Matching runs through the very same predicate
// as the contribution list, so view and action can never disagree.
export const assertContributionInModeratorScope = async (
  contributionId: number,
  role?: DbUserRole | null,
): Promise<void> => {
  if (!role || !isScopedModeratorRole(role.role)) {
    return
  }
  const scope = parseModeratorScope(role.visibleGroupTags)
  if (!scope) {
    return
  }
  const predicate = buildModeratorScopePredicate(scope)
  if (!predicate) {
    return
  }
  const inScope = await DbContribution.createQueryBuilder('Contribution')
    .where('Contribution.id = :contributionId', { contributionId })
    .andWhere(predicate.sql, predicate.params)
    .getCount()
  if (inScope === 0) {
    throw new LogError('Contribution is outside the moderator group scope', contributionId)
  }
}

// Group functions ("Weg A"): a moderator's visibility scope, stored as a JSON array on
// user_roles.visible_group_tags. Values are canonical group tags plus the reserved
// sentinels '*all' (see everything) and '*untagged' (contributions without a tag).
const SCOPE_SENTINELS = ['*all', '*untagged']

export const loadModeratorScope = async (userId: number): Promise<string[]> => {
  const role = await DbUserRole.findOne({ where: { userId } })
  return parseModeratorScope(role?.visibleGroupTags ?? null) ?? []
}

export const saveModeratorScope = async (userId: number, scope: string[]): Promise<string[]> => {
  const role = await DbUserRole.findOne({ where: { userId } })
  if (!role) {
    throw new LogError('User has no role to scope', userId)
  }
  const seen = new Set<string>()
  const normalised: string[] = []
  for (const raw of scope) {
    const value = raw.trim()
    if (value.length === 0) {
      continue
    }
    const token = SCOPE_SENTINELS.includes(value) ? value : value.replace(/^#+/, '')
    if (!seen.has(token)) {
      seen.add(token)
      normalised.push(token)
    }
  }
  const badSentinels = normalised.filter(
    (token) => token.startsWith('*') && !SCOPE_SENTINELS.includes(token),
  )
  if (badSentinels.length > 0) {
    throw new LogError('Unknown scope value(s)', badSentinels.join(', '))
  }
  const realTags = normalised.filter((token) => !token.startsWith('*'))
  if (realTags.length > 0) {
    const canonical = await DbGroupTag.find({ where: { tag: In(realTags) } })
    const known = new Set(canonical.map((tag) => tag.tag))
    const unknown = realTags.filter((tag) => !known.has(tag))
    if (unknown.length > 0) {
      throw new LogError('Unknown group tag(s)', unknown.join(', '))
    }
  }
  role.visibleGroupTags = normalised.length > 0 ? JSON.stringify(normalised) : null
  await role.save()
  return normalised
}
