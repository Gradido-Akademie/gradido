import { ContributionFilterArgs } from '@arg/ContributionFilterArgs'
import { Paginated } from '@arg/Paginated'
import { Contribution as DbContribution } from 'database'
import { FRONTEND_CONTRIBUTIONS_ITEM_ANCHOR_PREFIX } from 'shared'
import { Brackets, In, SelectQueryBuilder } from 'typeorm'
import { CONFIG } from '@/config'
import { Order } from '@/graphql/enum/Order'
import { buildGroupTagPredicate } from './findContributions'

// Group functions ("Weg A"): the wallet's own search. The text matches the memo and — in
// the community list — the name of the person who submitted. The e-mail address is
// deliberately NOT searchable here (admin only), so nobody can look people up by e-mail
// from the wallet.
const applyWalletFilter = (
  queryBuilder: SelectQueryBuilder<DbContribution>,
  filter: ContributionFilterArgs | null | undefined,
  searchUserNames: boolean,
): void => {
  if (!filter) {
    return
  }
  const query = filter.query?.trim()
  if (query) {
    const like = `%${query}%`
    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where('Contribution.memo LIKE :walletQuery', { walletQuery: like })
        if (searchUserNames) {
          qb.orWhere('user.first_name LIKE :walletQuery', { walletQuery: like })
            .orWhere('user.last_name LIKE :walletQuery', { walletQuery: like })
            .orWhere('user.alias LIKE :walletQuery', { walletQuery: like })
            .orWhere(
              "LOWER(CONCAT(user.first_name, ' ', user.last_name)) LIKE LOWER(:walletQuery)",
              { walletQuery: like },
            )
        }
      }),
    )
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
  const idQuery = DbContribution.createQueryBuilder('Contribution')
    .select(['Contribution.id'])
    .where('Contribution.userId = :userId', { userId })
    .withDeleted()
  // Own contributions: searching by name is pointless, they all belong to this member.
  applyWalletFilter(idQuery, filter, false)

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
 * Load all contributions
 * @param paginated pagination, see {@link Paginated}
 */
export const loadAllContributions = async (
  paginated: Paginated,
  filter?: ContributionFilterArgs | null,
): Promise<[DbContribution[], number]> => {
  const { order, currentPage, pageSize } = paginated
  // Same two-step shape as above: filterable id selection first, then the full rows.
  const idQuery = DbContribution.createQueryBuilder('Contribution').select(['Contribution.id'])
  // The community list may be searched by the submitter's name — never by e-mail.
  if (filter?.query) {
    idQuery.leftJoin('Contribution.user', 'user')
  }
  applyWalletFilter(idQuery, filter, true)

  const count = await idQuery.getCount()
  const contributionIds = await idQuery
    .orderBy('Contribution.createdAt', order)
    .addOrderBy('Contribution.id', order)
    .skip((currentPage - 1) * pageSize)
    .take(pageSize)
    .getMany()

  const contributions = await DbContribution.find({
    relations: { user: { emailContact: true } },
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
