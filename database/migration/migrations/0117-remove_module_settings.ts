// AI-GENERATED — not an architecture reference
// Removes the module-settings table again.
//
// STAGING ONLY. The admin module switch was tried on this strand on 06.08.2026 and taken
// off again on 07.08.: the requirement it answered - hide matching until it is finished -
// is met by the build-time MATCHING_ACTIVE flag, without a table.
//
// Why a new migration rather than deleting 0116: this database has already run it. The
// runner compares the newest recorded file name against the highest file in this
// directory, so with 0116 recorded and gone the database reads as "higher version than
// required" and refuses to start. Migrations are history; the way back is forward.
//
// IF EXISTS because a fresh database never saw 0116 - it was removed along with the
// feature, so nothing here created the table.

export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(`DROP TABLE IF EXISTS module_settings;`)
}

export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(`
    CREATE TABLE IF NOT EXISTS module_settings (
      id int unsigned NOT NULL,
      matching_active tinyint(1) NOT NULL DEFAULT 0,
      updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`)
}
