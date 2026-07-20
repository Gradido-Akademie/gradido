import { ContributionGroupTag as DbContributionGroupTag, GroupTag as DbGroupTag } from 'database'
import { In } from 'typeorm'

// Group functions ("Weg A"): set (replace) the structured group tags of a contribution.
// Only tags that exist in the canonical list are stored; unknown or invalid tags are
// ignored (non-blocking on submission — do not scare the user off). A legacy inline
// "#tag" in the memo is left untouched and stays searchable via the filter fallback.
export const setContributionGroupTags = async (
  contributionId: number,
  tags: string[],
): Promise<void> => {
  const seen = new Set<string>()
  const normalised: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#+/, '')
    if (tag.length === 0 || /\s/.test(tag)) {
      continue
    }
    if (!seen.has(tag)) {
      seen.add(tag)
      normalised.push(tag)
    }
  }
  await DbContributionGroupTag.delete({ contributionId })
  if (normalised.length === 0) {
    return
  }
  const canonical = await DbGroupTag.find({ where: { tag: In(normalised) } })
  const links = canonical.map((canon) => {
    const link = DbContributionGroupTag.create()
    link.contributionId = contributionId
    link.groupTagId = canon.id
    return link
  })
  if (links.length > 0) {
    await DbContributionGroupTag.save(links)
  }
}
