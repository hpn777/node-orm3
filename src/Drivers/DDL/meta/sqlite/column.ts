import { Column, ColumnMetadata } from '../column';
import type { UnknownRecord } from '../util';

export interface SqliteColumnMetadata extends ColumnMetadata {
  name: string;
  notnull: 0 | 1;
  type: string;
  pk: 0 | 1;
  dflt_value: string | null;
  unique?: boolean;
  auto_increment?: boolean;
}

export class SqliteColumn extends Column<SqliteColumnMetadata> {
  constructor(props: UnknownRecord) {
    super(props);
  }

  getName(): string {
    return this.meta.name;
  }

  isNullable(): boolean {
    return this.meta.notnull === 0;
  }

  getMaxLength(): number | null {
    const match = this.getDataType().match(/\((\d+)\)$/);
    if (!match) {
      return null;
    }

    return Number(match[1]);
  }

  getDataType(): string {
    return this.meta.type.toUpperCase();
  }

  isPrimaryKey(): boolean {
    return this.meta.pk === 1;
  }

  getDefaultValue(): string | null {
    return this.meta.dflt_value;
  }

  isUnique(): boolean {
    return Boolean(this.meta.unique) || this.meta.pk === 1;
  }

  isAutoIncrementing(): boolean {
    return Boolean(this.meta.auto_increment);
  }

  markUnique(): void {
    this.meta.unique = true;
  }

  markAutoIncrement(): void {
    this.meta.auto_increment = true;
  }
}
