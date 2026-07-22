import { ContributionFilterArgs } from '@arg/ContributionFilterArgs'
import { Paginated } from '@arg/Paginated'
import { Contribution as DbContribution } from 'database'
import { FRONTEND_CONTRIBUTIONS_ITEM_ANCHOR_PREFIX } from 'shared'
import { In, SelectQueryBuilder } from 'typeorm'
import { CONFIG } from '@/config'
import { Order } from '@/graphql/enum/Order'
import { buildGroupTagPredicate } from './findContributions'

// Group functions ("Weg A"): the wallet's own search. It matches the memo and the group,
// never a person. The community list does not carry the submitter at all (see
// loadAllContributions), so there is nothing here to search people by — neither by name
// nor, as always, by e-mail address.
const applyWalletFilter = (
  queryBuilder: SelectQueryBuilder<DbContribution>,
  filter: ContributionFilterArgs | null | undefined,
): void => {
  if (!filter) {
    return
  }
  const query = filter.query?.trim()
  if (query) {
    queryBuilder.andWhere('Contribution.memo LIKE :walletQuery', { walletQuery: `%${query}%` })
  }
  if (filter.groupTag) {
    const groupPredicate = buildGroupTagPredicate(filter.groupTag)
    queryBuilder.andWhere(groupPredicate.sql, groupPredicate.params)
  }
}

/*
 * Load user contributions with messages
 * @param userId if userId is set, load all contributions of the user, with messages
 * @param paginated pagination, see {@link Paginated}
 * @param filter optional wallet search (text, group)
 */
export const loadUserContributions = async (
  userId: number,
  paginated: Paginated,
  filter?: ContributionFilterArgs | null,
): Promise<[DbContribution[], number]> => {
  const { order, currentPage, pageSize } = paginated
  // Ids first (cheap and filterable), then the full rows with their relations. The two-step
  // shape is kept on purpose — typeorm would otherwise generate one much slower join query.
  // createdAt has to be selected as well: with skip/take typeorm wraps this in a
  // "distinctAlias" subquery that must carry every column we order by.
  const idQuery = DbContribution.createQueryBuilder('Contribution')
    .select(['Contribution.id', 'Contribution.createdAt'])
    .where('Contribution.userId = :userId', { userId })
    .withDeleted()
  applyWalletFilter(idQuery, filter)

  const count = await idQuery.getCount()
  const contributionIds = await idQuery
    .orderBy('Contribution.createdAt', order)
    .addOrderBy('Contribution.id', order)
    .skip((currentPage - 1) * pageSize)
    .take(pageSize)
    .getMany()

  const contributions = await DbContribution.find({
    relations: { messages: { user: true } },
    withDeleted: true,
    order: { createdAt: order, id: order, messages: { createdAt: Order.ASC } },
    where: { id: In(contributionIds.map((contribution) => contribution.id)) },
  })
  return [contributions, count]
}

/*
 * Load all contributions for the community list
 *
 * Data protection: this list is open to every logged-in member, and it shows deeds
 * including the ones a moderator denied. It therefore carries NO person — the submitter is
 * deliberately not loaded, so the field stays empty even for someone querying the API
 * directly. Each contribution is identified by its number instead; only the person
 * themselves can connect a number to a name, and only if they choose to (their own list
 * shows their numbers). Do not add the user relation back here.
 *
 * @param paginated pagination, see {@link Paginated}
 */
export const loadAllContributions = async (
  paginated: Paginated,
  filter?: ContributionFilterArgs | null,
): Promise<[DbContribution[], number]> => {
  const { order, currentPage, pageSize } = paginated
  // Same two-step shape as above: filterable id selection first, then the full rows.
  // See above: createdAt must be in the select, otherwise the "distinctAlias" subquery
  // typeorm builds for skip/take cannot order by it.
  const idQuery = DbContribution.createQueryBuilder('Contribution').select([
    'Contribution.id',
    'Contribution.createdAt',
  ])
  applyWalletFilter(idQuery, filter)

  const count = await idQuery.getCount()
  const contributionIds = await idQuery
    .orderBy('Contribution.createdAt', order)
    .addOrderBy('Contribution.id', order)
    .skip((currentPage - 1) * pageSize)
    .take(pageSize)
    .getMany()

  const contributions = await DbContribution.find({
    order: { createdAt: order, id: order },
    where: { id: In(contributionIds.map((contribution) => contribution.id)) },
  })
  return [contributions, count]
}

export const contributionFrontendLink = async (
  contributionId: number,
  _createdAt: Date,
): Promise<string> => {
  // TODO: page is sometimes wrong, use page 1 for now, and fix later with more time at hand
  // simplified, don't account for order by id, so when the nearly impossible case occur that createdAt is the same for two contributions,
  // maybe it is the wrong page
  //const countBefore = await DbContribution.count({
  //  where: { createdAt: MoreThan(createdAt) },
  //})
  // const page = Math.floor(countBefore / DEFAULT_PAGINATION_PAGE_SIZE) + 1
  const anchor = `${FRONTEND_CONTRIBUTIONS_ITEM_ANCHOR_PREFIX}${contributionId}`
  return `${CONFIG.COMMUNITY_URL}/contributions/own-contributions/1#${anchor}`
}
