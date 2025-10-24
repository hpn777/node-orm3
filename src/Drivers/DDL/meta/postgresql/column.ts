import { Column, ColumnMetadata } from '../column';
import type { UnknownRecord } from '../util';

export interface PgColumnMetadata extends ColumnMetadata {
  column_name: string;
  is_nullable: 'YES' | 'NO';
  character_maximum_length: number | null;
  data_type: string;
  is_primary_key?: string | null;
  column_default?: string | null;
  column_key?: string | null;
  constraint_name?: string | null;
  referenced_table_name?: string | null;
  referenced_column_name?: string | null;
  update_rule?: string | null;
  delete_rule?: string | null;
}

export class PgColumn extends Column<PgColumnMetadata> {
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
    return this.meta.is_primary_key === 'PRIMARY KEY';
  }

  getDefaultValue(): string | null {
    if (this.isAutoIncrementing()) {
      return null;
    }

    const defaultValue = this.meta.column_default;
    if (!defaultValue) {
      return null;
    }

    return defaultValue.replace(`::${this.meta.data_type}`, '');
  }

  isUnique(): boolean {
    return this.meta.column_key === 'UNIQUE' || this.meta.column_key === 'PRIMARY KEY';
  }

  isAutoIncrementing(): boolean {
    return (this.meta.column_default ?? '').startsWith('nextval');
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
