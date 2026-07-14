import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { type User as UserType } from './User'

@Entity('matching_entries', {
  engine: 'InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
})
export class MatchingEntry extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { unsigned: true })
  id: number

  @Index({ unique: true })
  @Column({ name: 'uuid', type: 'char', length: 36, nullable: false })
  uuid: string

  @Index()
  @Column({ name: 'user_id', type: 'int', unsigned: true, nullable: false })
  userId: number

  @ManyToOne(() => require('./User').User)
  @JoinColumn({ name: 'user_id' })
  user: UserType

  @Column({
    name: 'matching_type',
    type: 'varchar',
    length: 12,
    nullable: false,
    collation: 'utf8mb4_unicode_ci',
  })
  matchingType: string

  @Column({ type: 'varchar', length: 160, nullable: false, collation: 'utf8mb4_unicode_ci' })
  summary: string

  @Column({ type: 'text', nullable: true, default: null })
  details: string | null

  @Column({ type: 'bool', nullable: false, default: false })
  remote: boolean

  @Column({ type: 'bool', nullable: false, default: true })
  active: boolean

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date
}
