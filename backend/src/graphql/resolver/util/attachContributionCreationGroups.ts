import {
  ContributionCreationGroup as DbContributionCreationGroup,
  CreationGroup as DbCreationGroup,
} from 'database'
import { In } from 'typeorm'
import { CreationGroup } from '@/graphql/model/CreationGroup'

// Everything this needs of a contribution. Typed structurally rather than as the
// Contribution model so callers that only care about the group can hand over the two
// columns instead of building a half-filled model. The Contribution model satisfies it.
export interface HasCreationGroups {
  id: number
  creationGroups: CreationGroup[]
}

// Group functions: fill in the groups a contribution belongs to, for display.
// A contribution belongs to the groups it is linked to — nothing else. A "#word" in a memo
// is ordinary text; the inline convention that predates the group field is adopted into
// real links per group, from the admin.
// Batched: two queries for the whole page, not one per contribution.
export const attachContributionCreationGroups = async (
  contributions: HasCreationGroups[],
): Promise<void> => {
  if (contributions.length === 0) {
    return
  }
  const links = await DbContributionCreationGroup.find({
    where: { contributionId: In(contributions.map((contribution) => contribution.id)) },
  })
  if (links.length === 0) {
    for (const contribution of contributions) {
      contribution.creationGroups = []
    }
    return
  }
  const canonical = await DbCreationGroup.find({
    where: { id: In(links.map((link) => link.creationGroupId)) },
    order: { tag: 'ASC' },
  })
  const byId = new Map(canonical.map((tag) => [tag.id, tag]))

  const structured = new Map<number, DbCreationGroup[]>()
  for (const link of links) {
    const tag = byId.get(link.creationGroupId)
    if (!tag) {
      continue
    }
    const list = structured.get(link.contributionId) ?? []
    list.push(tag)
    structured.set(link.contributionId, list)
  }

  for (const contribution of contributions) {
    contribution.creationGroups = (structured.get(contribution.id) ?? []).map(
      (tag) => new CreationGroup(tag),
    )
  }
}
