import { DatabaseIndex, IndexMetadata } from '../databaseIndex';
import type { UnknownRecord } from '../util';

export interface PgIndexMetadata extends IndexMetadata {
  index_name: string;
  table_name: string;
  column_name: string;
}

export class PgIndex extends DatabaseIndex<PgIndexMetadata> {
  constructor(props: UnknownRecord) {
    super(props);
  }

  getName(): string {
    return this.meta.index_name;
  }

  getTableName(): string {
    return this.meta.table_name;
  }

  getColumnName(): string {
    return this.meta.column_name;
  }
}
