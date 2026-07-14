export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  // The table already exists on staging (migration 0105), so it is renamed rather
  // than recreated. "Entry" said nothing about what the row is; a matching entry is
  // what a member publishes to be found by: an offer, a need, or an interest.
  await queryFn(`RENAME TABLE gms_entries TO matching_entries;`)
  await queryFn(`ALTER TABLE matching_entries CHANGE entry_uuid uuid char(36) NOT NULL;`)
  await queryFn(
    `ALTER TABLE matching_entries CHANGE entry_type matching_type varchar(12) NOT NULL;`,
  )
  await queryFn(
    `ALTER TABLE matching_entries RENAME INDEX uniq_gms_entries_entry_uuid TO uniq_matching_entries_uuid;`,
  )
  await queryFn(
    `ALTER TABLE matching_entries RENAME INDEX idx_gms_entries_user_id TO idx_matching_entries_user_id;`,
  )
}

export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(
    `ALTER TABLE matching_entries RENAME INDEX idx_matching_entries_user_id TO idx_gms_entries_user_id;`,
  )
  await queryFn(
    `ALTER TABLE matching_entries RENAME INDEX uniq_matching_entries_uuid TO uniq_gms_entries_entry_uuid;`,
  )
  await queryFn(
    `ALTER TABLE matching_entries CHANGE matching_type entry_type varchar(12) NOT NULL;`,
  )
  await queryFn(`ALTER TABLE matching_entries CHANGE uuid entry_uuid char(36) NOT NULL;`)
  await queryFn(`RENAME TABLE matching_entries TO gms_entries;`)
}
