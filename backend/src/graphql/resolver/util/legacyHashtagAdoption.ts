import { Contribution as DbContribution } from 'database'
import { type HashtagMatch, matchLegacyHashtag } from './legacyHashtagRule'

// Group functions: adopt the hashtags that predate the group field into real links.
//
// Before the field existed, a "#word" in the memo was the only way to name a group. Nothing
// resolves that on read any more -- a "#word" is ordinary text. This is the one place that
// still reads a memo for a group, on purpose and only when an administrator asks for it.
//
// The rule itself lives in legacyHashtagRule, free of imports so it can be tested without a
// database. Everything here is the plumbing around it.

const READ_BATCH = 500
const INSERT_BATCH = 200

// Contributions that never said anything about their group: no link row and no
// group_tags_set_at stamp. Anything else has already made a statement -- including a
// deliberate "no group", which is the whole reason that stamp exists.
//
// The SQL pre-filter is the bare tag, not the hashtag: it is a superset of both spellings
// (each contains the tag), so no candidate can be missed however many blanks sit between
// the '#' and the word. It over-returns -- memo is utf8mb4_general_ci and therefore
// case- and accent-insensitive, and a memo merely mentioning the word passes -- and that is
// the safe direction, because matchLegacyHashtag then decides.
//
// ⚠️ The pre-filter cannot use an index (leading wildcard). This walks the contributions
// table. That is affordable because it happens when an administrator asks, once per group,
// and never on a page render -- but it is a real cost on a large table, and if it ever
// becomes one, the honest fix is a bound on how far back it looks, not a silent cap here.
const forEachCandidate = async (
  tag: string,
  visit: (id: number, match: Exclude<HashtagMatch, null>) => void,
): Promise<void> => {
  let lastId = 0
  for (;;) {
    const rows: Array<{ id: number; memo: string }> = await DbContribution.query(
      `SELECT c.id, c.memo
         FROM contributions c
        WHERE c.id > ?
          AND c.memo LIKE CONCAT('%', ?, '%')
          AND c.group_tags_set_at IS NULL
          AND NOT EXISTS (
                SELECT 1 FROM contribution_group_tags cgt WHERE cgt.contribution_id = c.id)
        ORDER BY c.id
        LIMIT ${READ_BATCH}`,
      [lastId, tag],
    )
    if (rows.length === 0) {
      return
    }
    lastId = rows[rows.length - 1].id
    for (const row of rows) {
      const match = matchLegacyHashtag(row.memo, tag)
      if (match) {
        visit(row.id, match)
      }
    }
  }
}

export interface LegacyHashtagCounts {
  exact: number
  loose: number
}

// What a run would find right now. Counted fresh rather than read off the group, because
// the answer changes as contributions get a group by other means.
export const countLegacyHashtags = async (tag: string): Promise<LegacyHashtagCounts> => {
  const counts: LegacyHashtagCounts = { exact: 0, loose: 0 }
  await forEachCandidate(tag, (_id, match) => {
    counts[match] += 1
  })
  return counts
}

// Link the matching contributions to the group. Returns how many rows were written.
//
// Safe to run again: the guard above excludes anything that already carries a link, and
// INSERT IGNORE covers the race. Running twice is in fact the expected path -- adopt the
// exact spelling first, look at the numbers, then come back for the loose one.
export const adoptLegacyHashtags = async (
  groupTagId: number,
  tag: string,
  includeLoose: boolean,
): Promise<number> => {
  const ids: number[] = []
  await forEachCandidate(tag, (id, match) => {
    if (match === 'exact' || includeLoose) {
      ids.push(id)
    }
  })
  let written = 0
  for (let i = 0; i < ids.length; i += INSERT_BATCH) {
    const chunk = ids.slice(i, i + INSERT_BATCH)
    await DbContribution.query(
      'INSERT IGNORE INTO contribution_group_tags (contribution_id, group_tag_id) VALUES ' +
        chunk.map(() => '(?, ?)').join(', '),
      chunk.flatMap((id) => [id, groupTagId]),
    )
    written += chunk.length
  }
  return written
}
