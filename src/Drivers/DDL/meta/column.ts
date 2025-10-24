import { lowercaseKeys, UnknownRecord } from './util';

export interface ColumnMetadata extends UnknownRecord {}

export abstract class Column<TMeta extends ColumnMetadata = ColumnMetadata> {
  protected readonly meta: TMeta;

  protected constructor(props: UnknownRecord) {
    this.meta = lowercaseKeys(props) as TMeta;
  }

  abstract getName(): string;

  abstract isNullable(): boolean;

  abstract getDataType(): string;

  abstract getMaxLength(): number | null | undefined;

  abstract isPrimaryKey(): boolean;

  abstract getDefaultValue(): string | null;

  abstract isUnique(): boolean;

  abstract isAutoIncrementing(): boolean;

  getConstraintName(): string | null {
    return null;
  }

  getReferencedTableName(): string | null {
    return null;
  }

  getReferencedColumnName(): string | null {
    return null;
  }

  getUpdateRule(): string | null {
    return null;
  }

  getDeleteRule(): string | null {
    return null;
  }
}
