import * as SQL from "../SQL";
import type { Callback } from "../index";
import postgresqlDialect from "./postgresql";

const TYPE_MAP: Record<string, string> = {
  text: "STRING",
  integer: "INT",
  number: "DOUBLE",
  serial: "LONG",
  boolean: "BOOLEAN",
  date: "DATE",
  datetime: "TIMESTAMP",
  time: "TIMESTAMP",
  uuid: "UUID",
  point: "STRING",
  enum: "STRING",
  binary: "BLOB",
  object: "BLOB",
};

const normalizePropertyType = (property: Record<string, any>): string | null => {
  if (!property) {
    return null;
  }

  if (property.__orm3PreferLong) {
    return TYPE_MAP.serial;
  }

  if (property.serial || property.type === "serial") {
    return TYPE_MAP.serial;
  }

  if (property.type === "date" && property.time) {
    return TYPE_MAP.datetime;
  }

  const mapped = TYPE_MAP[property.type];

  if (mapped) {
    return mapped;
  }

  if (property.rational === false && property.type === "number") {
    return TYPE_MAP.integer;
  }

  return "STRING";
};

const appendColumnQualifiers = (type: string, property: Record<string, any>, _driver: any): string => {
  let result = type;

  if (property.required) {
    result += " NOT NULL";
  }

  // QuestDB currently rejects DEFAULT clauses in CREATE TABLE statements. The ORM
  // assigns default values at the application layer, so we purposely skip
  // emitting DEFAULT expressions during schema creation.

  return result;
};

const buildColumnDefinition = (property: Record<string, any>, driver: any): string | false => {
  const mappedType = normalizePropertyType(property);

  if (!mappedType) {
    return false;
  }

  return appendColumnQualifiers(mappedType, property, driver);
};

export const hasCollection = (driver: any, name: string, cb: Callback<boolean>): void => {
  const sql = `SELECT table_name FROM tables() WHERE table_name = ${driver.query.escapeVal(name)}`;

  driver.execSimpleQuery(sql, (err: Error | null, rows: any[]) => {
    if (err) {
      cb(err);
      return;
    }

    cb(null, Array.isArray(rows) && rows.length > 0);
  });
};

export const getCollectionProperties = (driver: any, name: string, cb: Callback<Record<string, any>>): void => {
  const sql = `SELECT column, type FROM table_columns(${driver.query.escapeVal(name)})`;

  driver.execSimpleQuery(sql, (err: Error | null, rows: any[]) => {
    if (err) {
      cb(err);
      return;
    }

    const columns: Record<string, any> = {};

    for (const row of rows || []) {
      if (!row || !row.column) {
        continue;
      }

      columns[row.column] = {
        type: String(row.type || "").toLowerCase(),
      };
    }

    cb(null, columns);
  });
};

export const getCollectionIndexes = (_driver: any, _name: string, cb: Callback<Record<string, any>>): void => {
  cb(null, {});
};

export const addIndex = (_driver: any, _name: string, _unique: boolean, _collection: string, _columns: string[], cb: Callback): void => {
  cb(null);
};

export const removeIndex = (_driver: any, _name: string, _collection: string, cb: Callback): void => {
  cb(null);
};

export const convertIndexes = (_collection: any, indexes: any[]): any[] => indexes;

export const supportsType = (type: string): string => {
  switch (type) {
    case "serial":
      return TYPE_MAP.serial;
    case "integer":
      return TYPE_MAP.integer;
    case "number":
      return TYPE_MAP.number;
    case "boolean":
      return TYPE_MAP.boolean;
    case "date":
      return TYPE_MAP.date;
    case "enum":
      return TYPE_MAP.enum;
    case "uuid":
      return TYPE_MAP.uuid;
    case "text":
    default:
      return TYPE_MAP.text;
  }
};

export const createCollection = (driver: any, name: string, columns: string[], keys: string[], cb: Callback): void => {
  const sql = SQL.CREATE_TABLE({ name, columns, keys }, driver);
  driver.execSimpleQuery(sql, cb);
};

export const dropCollection = (driver: any, name: string, cb: Callback): void => {
  const sql = `DROP TABLE IF EXISTS ${driver.query.escapeId(name)}`;
  driver.execSimpleQuery(sql, cb);
};

export const addCollectionColumn = (_driver: any, _name: string, _column: string, _afterColumn: string | null, cb: Callback): void => {
  cb(null);
};

export const modifyCollectionColumn = (_driver: any, _name: string, _column: string, cb: Callback): void => {
  cb(null);
};

export const dropCollectionColumn = (_driver: any, _name: string, _column: string, cb: Callback): void => {
  cb(null);
};

const questdbDialect = {
  ...postgresqlDialect,
  hasCollection,
  getCollectionProperties,
  getCollectionIndexes,
  addIndex,
  removeIndex,
  convertIndexes,
  processKeys: () => [],
  getType: (_collection: string, property: Record<string, any>, driver: any) => {
    const definition = buildColumnDefinition(property, driver);
    return definition === false ? false : { value: definition };
  },
  supportsType,
  createCollection,
  dropCollection,
  addCollectionColumn,
  modifyCollectionColumn,
  dropCollectionColumn,
};

export default questdbDialect;
