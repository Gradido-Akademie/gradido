// Rename "group tag" to "creation group" throughout the schema.
//
// "Group" on its own is ambiguous and will only get worse: a chat will bring groups of its
// own, and the community already has its Gradido circles. These groups are the ones a
// common-good contribution is filed under and a moderator is scoped to -- they belong to
// the creation of Gradido, so they are creation groups.
//
// Done as its own migration rather than by editing the migrations that created these
// tables: those have already run here and on every developer's database, and an edited
// migration does not run again. A rename works wherever it is applied.
//
// Pure renaming -- no column is added, dropped or retyped, and no row is touched. The
// reserved scope tokens inside user_roles.visible_creation_groups ('*all', '*untagged',
// '*grouped') are values, not names, and stay as they are: renaming them would mean
// rewriting stored JSON for no gain, since nobody sees them.

export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  // Columns first, while the tables still carry their old names.
  await queryFn(
    'ALTER TABLE `user_roles` RENAME COLUMN `visible_group_tags` TO `visible_creation_groups`;',
  )
  await queryFn(
    'ALTER TABLE `contributions` RENAME COLUMN `group_tags_set_at` TO `creation_groups_set_at`;',
  )
  await queryFn(
    'ALTER TABLE `contribution_group_tags` RENAME COLUMN `group_tag_id` TO `creation_group_id`;',
  )
  await queryFn(
    'ALTER TABLE `user_group_tags` RENAME COLUMN `group_tag_id` TO `creation_group_id`;',
  )

  await queryFn('ALTER TABLE `group_tags` RENAME TO `creation_groups`;')
  await queryFn('ALTER TABLE `contribution_group_tags` RENAME TO `contribution_creation_groups`;')
  await queryFn('ALTER TABLE `user_group_tags` RENAME TO `user_creation_groups`;')

  // Indices keep their old names through a table rename, so they are renamed too -- an
  // index called idx_cgt_group_tag_id on a table nobody calls that any more is a trap for
  // the next reader.
  await queryFn(
    'ALTER TABLE `creation_groups` RENAME INDEX `uniq_group_tags_tag` TO `uniq_creation_groups_tag`;',
  )
  await queryFn(
    'ALTER TABLE `contribution_creation_groups` RENAME INDEX `uniq_contribution_group_tag` TO `uniq_contribution_creation_group`;',
  )
  await queryFn(
    'ALTER TABLE `contribution_creation_groups` RENAME INDEX `idx_cgt_group_tag_id` TO `idx_ccg_creation_group_id`;',
  )
  await queryFn(
    'ALTER TABLE `contribution_creation_groups` RENAME INDEX `idx_cgt_contribution_id` TO `idx_ccg_contribution_id`;',
  )
  await queryFn(
    'ALTER TABLE `user_creation_groups` RENAME INDEX `uniq_user_group_tag` TO `uniq_user_creation_group`;',
  )
  await queryFn(
    'ALTER TABLE `user_creation_groups` RENAME INDEX `idx_ugt_group_tag_id` TO `idx_ucg_creation_group_id`;',
  )
  await queryFn(
    'ALTER TABLE `user_creation_groups` RENAME INDEX `idx_ugt_user_id` TO `idx_ucg_user_id`;',
  )
}

export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(
    'ALTER TABLE `user_creation_groups` RENAME INDEX `idx_ucg_user_id` TO `idx_ugt_user_id`;',
  )
  await queryFn(
    'ALTER TABLE `user_creation_groups` RENAME INDEX `idx_ucg_creation_group_id` TO `idx_ugt_group_tag_id`;',
  )
  await queryFn(
    'ALTER TABLE `user_creation_groups` RENAME INDEX `uniq_user_creation_group` TO `uniq_user_group_tag`;',
  )
  await queryFn(
    'ALTER TABLE `contribution_creation_groups` RENAME INDEX `idx_ccg_contribution_id` TO `idx_cgt_contribution_id`;',
  )
  await queryFn(
    'ALTER TABLE `contribution_creation_groups` RENAME INDEX `idx_ccg_creation_group_id` TO `idx_cgt_group_tag_id`;',
  )
  await queryFn(
    'ALTER TABLE `contribution_creation_groups` RENAME INDEX `uniq_contribution_creation_group` TO `uniq_contribution_group_tag`;',
  )
  await queryFn(
    'ALTER TABLE `creation_groups` RENAME INDEX `uniq_creation_groups_tag` TO `uniq_group_tags_tag`;',
  )

  await queryFn('ALTER TABLE `user_creation_groups` RENAME TO `user_group_tags`;')
  await queryFn('ALTER TABLE `contribution_creation_groups` RENAME TO `contribution_group_tags`;')
  await queryFn('ALTER TABLE `creation_groups` RENAME TO `group_tags`;')

  await queryFn(
    'ALTER TABLE `user_group_tags` RENAME COLUMN `creation_group_id` TO `group_tag_id`;',
  )
  await queryFn(
    'ALTER TABLE `contribution_group_tags` RENAME COLUMN `creation_group_id` TO `group_tag_id`;',
  )
  await queryFn(
    'ALTER TABLE `contributions` RENAME COLUMN `creation_groups_set_at` TO `group_tags_set_at`;',
  )
  await queryFn(
    'ALTER TABLE `user_roles` RENAME COLUMN `visible_creation_groups` TO `visible_group_tags`;',
  )
}
