import { lowercaseKeys, UnknownRecord } from './util';

export type TableType = 'VIEW' | 'TABLE';

export interface TableMetadata extends UnknownRecord {
  table_name: string;
  table_type?: string | null;
}

export class Table {
  protected readonly meta: TableMetadata;

  constructor(props: UnknownRecord) {
    this.meta = lowercaseKeys(props) as TableMetadata;
  }

  getName(): string {
    const name = this.meta.table_name;

    if (!name) {
      throw new Error('Table name metadata is missing');
    }

    return name;
  }

  getType(): TableType {
    return this.meta.table_type === 'VIEW' ? 'VIEW' : 'TABLE';
  }
}
