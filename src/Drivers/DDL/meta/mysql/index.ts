import { DatabaseIndex, IndexMetadata } from '../databaseIndex';
import type { UnknownRecord } from '../util';

export interface MysqlIndexMetadata extends IndexMetadata {
  key_name: string;
  table: string;
  column_name: string;
}

export class MysqlIndex extends DatabaseIndex<MysqlIndexMetadata> {
  constructor(props: UnknownRecord) {
    super(props);
  }

  getName(): string {
    return this.meta.key_name;
  }

  getTableName(): string {
    return this.meta.table;
  }

  getColumnName(): string {
    return this.meta.column_name;
  }
}
