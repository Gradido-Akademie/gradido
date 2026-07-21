import { ContributionGroupTag as DbContributionGroupTag, GroupTag as DbGroupTag } from 'database'
import { In } from 'typeorm'
import { Contribution } from '@/graphql/model/Contribution'
import { GroupTag } from '@/graphql/model/GroupTag'

// Legacy path: pick the "#word" tokens out of a memo and keep the ones that name a real
// group. Letters (umlauts included), digits, '_' and '-' are tag characters; anything else
// ends the token, so "#feuerwehr," resolves to "feuerwehr".
const INLINE_TAG = /#([\p{L}\p{N}_-]+)/gu

const inlineGroupTags = (memo: string, byTag: Map<string, DbGroupTag>): DbGroupTag[] => {
  const found: DbGroupTag[] = []
  const seen = new Set<number>()
  for (const match of memo.matchAll(INLINE_TAG)) {
    const tag = byTag.get(match[1].toLowerCase())
    if (tag && !seen.has(tag.id)) {
      seen.add(tag.id)
      found.push(tag)
    }
  }
  return found
}

// Group functions ("Weg A"): fill in the groups a contribution belongs to, for display.
// Structured links win; where a contribution carries none, a legacy inline "#tag" in the
// memo is resolved against the canonical list — the same backward compatibility the filter
// already has, so older contributions show their group instead of reading "no group".
// Batched: two queries for the whole page, not one per contribution.
export const attachContributionGroupTags = async (contributions: Contribution[]): Promise<void> => {
  if (contributions.length === 0) {
    return
  }
  const [links, canonical] = await Promise.all([
    DbContributionGroupTag.find({
      where: { contributionId: In(contributions.map((contribution) => contribution.id)) },
    }),
    DbGroupTag.find({ order: { tag: 'ASC' } }),
  ])
  const byId = new Map(canonical.map((tag) => [tag.id, tag]))
  const byTag = new Map(canonical.map((tag) => [tag.tag.toLowerCase(), tag]))

  const structured = new Map<number, DbGroupTag[]>()
  for (const link of links) {
    const tag = byId.get(link.groupTagId)
    if (!tag) {
      continue
    }
    const list = structured.get(link.contributionId) ?? []
    list.push(tag)
    structured.set(link.contributionId, list)
  }

  for (const contribution of contributions) {
    const own = structured.get(contribution.id)
    const tags = own && own.length > 0 ? own : inlineGroupTags(contribution.memo, byTag)
    contribution.groupTags = tags.map((tag) => new GroupTag(tag))
  }
}
