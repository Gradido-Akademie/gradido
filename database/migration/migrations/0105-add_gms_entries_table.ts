export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(`
    CREATE TABLE gms_entries (
      id int unsigned NOT NULL AUTO_INCREMENT,
      entry_uuid char(36) NOT NULL,
      user_id int unsigned NOT NULL,
      entry_type varchar(12) NOT NULL,
      summary varchar(160) NOT NULL,
      details text,
      remote tinyint(1) NOT NULL DEFAULT 0,
      active tinyint(1) NOT NULL DEFAULT 1,
      created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uniq_gms_entries_entry_uuid (entry_uuid),
      KEY idx_gms_entries_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`)
}

export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(`DROP TABLE gms_entries;`)
}
