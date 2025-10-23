export interface CreateTableOptions {
  name: string;
  columns: string[];
  keys?: string[];
}

export interface DropTableOptions {
  name: string;
}

export interface AlterTableAddColumnOptions {
  name: string;
  column: string;
  after?: string | null;
  first?: boolean;
}

export interface AlterTableRenameColumnOptions {
  name: string;
  oldColName: string;
  newColName: string;
}

export interface AlterTableModifyColumnOptions {
  name: string;
  column: string;
}

export interface CreateIndexOptions {
  name: string;
  unique?: boolean;
  collection: string;
  columns: string[];
}

export interface DropIndexOptions {
  name: string;
  collection: string;
}

export const CREATE_TABLE = (options: CreateTableOptions, driver: any): string => {
  let sql = `CREATE TABLE ${driver.query.escapeId(options.name)} (${options.columns.join(", ")}`;

  if (options.keys && options.keys.length > 0) {
    const formattedKeys = options.keys.map((val) => driver.query.escapeId(val)).join(", ");
    sql += `, PRIMARY KEY (${formattedKeys})`;
  }

  sql += ")";

  return sql;
};

export const DROP_TABLE = (options: DropTableOptions, driver: any): string => {
  return `DROP TABLE ${driver.query.escapeId(options.name)}`;
};

export const ALTER_TABLE_ADD_COLUMN = (options: AlterTableAddColumnOptions, driver: any): string => {
  let sql = `ALTER TABLE ${driver.query.escapeId(options.name)} ADD ${options.column}`;

  if (options.after) {
    sql += ` AFTER ${driver.query.escapeId(options.after)}`;
  } else if (options.first) {
    sql += " FIRST";
  }

  return sql;
};

export const ALTER_TABLE_RENAME_COLUMN = (options: AlterTableRenameColumnOptions, driver: any): string => {
  const eid = driver.query.escapeId;
  return `ALTER TABLE ${eid(options.name)} RENAME COLUMN ${eid(options.oldColName)} TO ${eid(options.newColName)}`;
};

export const ALTER_TABLE_MODIFY_COLUMN = (options: AlterTableModifyColumnOptions, driver: any): string => {
  return `ALTER TABLE ${driver.query.escapeId(options.name)} MODIFY ${options.column}`;
};

export const ALTER_TABLE_DROP_COLUMN = (options: AlterTableModifyColumnOptions, driver: any): string => {
  return `ALTER TABLE ${driver.query.escapeId(options.name)} DROP ${driver.query.escapeId(options.column)}`;
};

export const CREATE_INDEX = (options: CreateIndexOptions, driver: any): string => {
  const columns = options.columns.map((col) => driver.query.escapeId(col)).join(", ");
  return `CREATE${options.unique ? " UNIQUE" : ""} INDEX ${driver.query.escapeId(options.name)} ON ${driver.query.escapeId(options.collection)} (${columns})`;
};

export const DROP_INDEX = (options: DropIndexOptions, driver: any): string => {
  return `DROP INDEX ${driver.query.escapeId(options.name)} ON ${driver.query.escapeId(options.collection)}`;
};

export default {
  CREATE_TABLE,
  DROP_TABLE,
  ALTER_TABLE_ADD_COLUMN,
  ALTER_TABLE_RENAME_COLUMN,
  ALTER_TABLE_MODIFY_COLUMN,
  ALTER_TABLE_DROP_COLUMN,
  CREATE_INDEX,
  DROP_INDEX,
};
