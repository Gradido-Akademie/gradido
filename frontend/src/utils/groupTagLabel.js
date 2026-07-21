// Group functions ("Weg A"): how a group is written wherever it is shown — the contribution
// lists, the submission dropdown and the community info page. Kept in one place so the four
// call sites cannot drift into three different spellings.
export const groupTagLabel = (groupTag) =>
  groupTag.name ? `${groupTag.name} (#${groupTag.tag})` : `#${groupTag.tag}`

export const groupTagLabels = (groupTags) => (groupTags ?? []).map(groupTagLabel).join(', ')
