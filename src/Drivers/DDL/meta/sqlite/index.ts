import { DatabaseIndex, IndexMetadata } from '../databaseIndex';
import type { UnknownRecord } from '../util';

export interface SqliteIndexMetadata extends IndexMetadata {
  index_name: string;
  table_name: string;
  name: string;
}

export class SqliteIndex extends DatabaseIndex<SqliteIndexMetadata> {
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
    return this.meta.name;
  }
}
