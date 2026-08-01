// Staging-only follow-up to 0110/0111.
//
// On master the group tables and this index arrive together in one migration. Here the
// tables were already created by 0110/0111 long before, so only the index is left to add.
// It is not cosmetic: contributions carried no index on user_id at all -- not even on
// user_id alone -- and every per-member question pays for that, above all the group
// pre-fill on the submission form, which reads the member's most recent statement.

export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(
    'CREATE INDEX idx_contributions_user_created ON contributions (user_id, created_at);',
  )
}

export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn('DROP INDEX idx_contributions_user_created ON contributions;')
}
