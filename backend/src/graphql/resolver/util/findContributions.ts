import { Paginated } from '@arg/Paginated'
import { SearchContributionsFilterArgs } from '@arg/SearchContributionsFilterArgs'
import { AppDatabase, Contribution as DbContribution } from 'database'
import { Brackets, In, IsNull, LessThanOrEqual, Like, Not, SelectQueryBuilder } from 'typeorm'

import { LogError } from '@/server/LogError'

interface Relations {
  [key: string]: boolean | Relations
}

function joinRelationsRecursive(
  relations: Relations,
  queryBuilder: SelectQueryBuilder<DbContribution>,
  currentPath: string,
): void {
  for (const key in relations) {
    queryBuilder.leftJoinAndSelect(`${currentPath}.${key}`, key)
    if (typeof relations[key] === 'object') {
      // If it's a nested relation
      joinRelationsRecursive(relations[key] as Relations, queryBuilder, key)
    }
  }
}

// --- Group functions ("Weg A"): group-tag filter + moderator visibility scope ---

// A contribution "carries" tag T if it has a structured contribution_group_tags entry
// for T OR a legacy inline "#T" in its memo (backward compatible). Correlated subquery
// against the outer `Contribution` alias.
const tagMatchSql = (key: string): string =>
  `(EXISTS (SELECT 1 FROM contribution_group_tags cgt ` +
  `INNER JOIN group_tags gt ON gt.id = cgt.group_tag_id ` +
  `WHERE cgt.contribution_id = Contribution.id AND gt.tag = :${key}) ` +
  `OR Contribution.memo LIKE :${key}Like)`

// "Untagged": neither a structured tag nor any inline hashtag in the memo.
const UNTAGGED_SQL =
  `(NOT EXISTS (SELECT 1 FROM contribution_group_tags cgt ` +
  `WHERE cgt.contribution_id = Contribution.id) AND Contribution.memo NOT LIKE '%#%')`

// Parse a moderator's stored scope (JSON text on user_roles.visible_group_tags) into a
// string array. null (= no restriction) for empty/invalid input.
export const parseModeratorScope = (raw: string | null | undefined): string[] | null => {
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return null
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return null
  }
}

export const findContributions = async (
  { pageSize, currentPage, order }: Paginated,
  filter: SearchContributionsFilterArgs,
  withDeleted = false,
  relations: Relations | undefined = undefined,
  countOnly = false,
  moderatorScope: string[] | null = null,
): Promise<[DbContribution[], number]> => {
  const connection = AppDatabase.getInstance()
  if (!connection.isConnected()) {
    throw new LogError('Cannot connect to db')
  }
  const queryBuilder = connection
    .getDataSource()
    .getRepository(DbContribution)
    .createQueryBuilder('Contribution')
  if (relations) {
    joinRelationsRecursive(relations, queryBuilder, 'Contribution')
  }
  if (withDeleted) {
    queryBuilder.withDeleted()
  }
  queryBuilder.where({
    ...(filter.statusFilter?.length && { contributionStatus: In(filter.statusFilter) }),
    ...(filter.userId && { userId: filter.userId }),
    ...(filter.noHashtag && { memo: Not(Like(`%#%`)) }),
  })
  if (filter.hideResubmission) {
    const now = new Date(new Date().toUTCString())
    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where({ resubmissionAt: IsNull() }).orWhere({ resubmissionAt: LessThanOrEqual(now) })
      }),
    )
  }
  queryBuilder.printSql()
  if (filter.query) {
    const queryString = '%' + filter.query + '%'
    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where({ memo: Like(queryString) })
        if (relations?.user) {
          qb.orWhere('user.first_name LIKE :firstName', { firstName: queryString })
            .orWhere('user.last_name LIKE :lastName', { lastName: queryString })
            .orWhere('user.alias LIKE :alias', { alias: queryString })
            .orWhere("LOWER(CONCAT(user.first_name, ' ', user.last_name)) LIKE LOWER(:fullName)", {
              fullName: queryString.toLowerCase(),
            })
            .orWhere('emailContact.email LIKE :emailContact', { emailContact: queryString })
            .orWhere({ memo: Like(queryString) })
        }
      }),
    )
  }
  // Group-tag filter from the admin UI (a single selected group). Separate from the
  // free-text `query` above, so both can be applied at the same time.
  if (filter.groupTag) {
    queryBuilder.andWhere(tagMatchSql('uiGroupTag'), {
      uiGroupTag: filter.groupTag,
      uiGroupTagLike: `%#${filter.groupTag}%`,
    })
  }
  // Hard moderator visibility scope: a group moderator only sees the contributions of the
  // tags they are authorised for. null / '*all' = no restriction (existing moderators keep
  // full visibility); '*untagged' = contributions without any tag.
  if (moderatorScope && !moderatorScope.includes('*all')) {
    const realTags = moderatorScope.filter((tag) => tag.length > 0 && !tag.startsWith('*'))
    const includeUntagged = moderatorScope.includes('*untagged')
    if (realTags.length > 0 || includeUntagged) {
      const parts: string[] = []
      const params: Record<string, string> = {}
      realTags.forEach((tag, index) => {
        const key = `scopeTag${index}`
        parts.push(tagMatchSql(key))
        params[key] = tag
        params[`${key}Like`] = `%#${tag}%`
      })
      if (includeUntagged) {
        parts.push(UNTAGGED_SQL)
      }
      queryBuilder.andWhere(`(${parts.join(' OR ')})`, params)
    }
  }
  if (countOnly) {
    return [[], await queryBuilder.getCount()]
  }
  return queryBuilder
    .orderBy('Contribution.createdAt', order)
    .addOrderBy('Contribution.id', order)
    .skip((currentPage - 1) * pageSize)
    .take(pageSize)
    .getManyAndCount()
}
