import { lowercaseKeys, UnknownRecord } from './util';

export interface IndexMetadata extends UnknownRecord {
  index_name?: string;
  table_name?: string;
  column_name?: string;
  null?: string | null;
}

export abstract class DatabaseIndex<TMeta extends IndexMetadata = IndexMetadata> {
  protected readonly meta: TMeta;

  protected constructor(props: UnknownRecord) {
    this.meta = lowercaseKeys(props) as TMeta;
  }

  abstract getName(): string;

  abstract getTableName(): string;

  abstract getColumnName(): string;

  isNullable(): boolean {
    return this.meta.null === 'YES';
  }
}
