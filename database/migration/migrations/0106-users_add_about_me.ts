export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(
    'ALTER TABLE `users` ADD COLUMN `about_me` text NULL DEFAULT NULL AFTER `gms_publish_location`;',
  )
}

export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn('ALTER TABLE `users` DROP COLUMN `about_me`;')
}
