import { Column, ColumnMetadata } from '../column';
import type { UnknownRecord } from '../util';

export type YesNo = 'YES' | 'NO';

export interface MysqlColumnMetadata extends ColumnMetadata {
  column_name: string;
  is_nullable: YesNo;
  character_maximum_length: number | null;
  data_type: string;
  column_key?: 'PRI' | 'UNI' | 'MUL' | '' | null;
  column_default: string | null;
  extra?: string | null;
  constraint_name?: string | null;
  referenced_table_name?: string | null;
  referenced_column_name?: string | null;
  update_rule?: string | null;
  delete_rule?: string | null;
}

export class MysqlColumn extends Column<MysqlColumnMetadata> {
  constructor(props: UnknownRecord) {
    super(props);
  }

  getName(): string {
    return this.meta.column_name;
  }

  isNullable(): boolean {
    return this.meta.is_nullable === 'YES';
  }

  getMaxLength(): number | null {
    return this.meta.character_maximum_length ?? null;
  }

  getDataType(): string {
    return this.meta.data_type;
  }

  isPrimaryKey(): boolean {
    return this.meta.column_key === 'PRI';
  }

  getDefaultValue(): string | null {
    return this.meta.column_default;
  }

  isUnique(): boolean {
    return this.meta.column_key === 'UNI' || this.meta.column_key === 'PRI';
  }

  isAutoIncrementing(): boolean {
    return this.meta.extra === 'auto_increment';
  }

  override getConstraintName(): string | null {
    return this.meta.constraint_name ?? null;
  }

  override getReferencedTableName(): string | null {
    return this.meta.referenced_table_name ?? null;
  }

  override getReferencedColumnName(): string | null {
    return this.meta.referenced_column_name ?? null;
  }

  override getUpdateRule(): string | null {
    return this.meta.update_rule ?? null;
  }

  override getDeleteRule(): string | null {
    return this.meta.delete_rule ?? null;
  }
}
