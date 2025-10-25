import _ from "lodash";
import * as SQL from "../SQL";
import { Queue } from "../Queue";

type Callback<T = any> = (err?: Error | null, result?: T) => void;

type ColumnSizes = Record<number, string>;

const columnSizes: { integer: ColumnSizes; floating: ColumnSizes } = {
  integer: { 2: "SMALLINT", 4: "INTEGER", 8: "BIGINT" },
  floating: { 4: "REAL", 8: "DOUBLE PRECISION" },
};

const getNumericSize = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const hasCollection = (driver: any, name: string, cb: Callback<boolean>): void => {
  driver.execQuery("SELECT * FROM information_schema.tables WHERE table_name = ?", [name], (err: Error | null, rows: any[]) => {
    if (err) {
      cb(err);
      return;
    }

    cb(null, rows.length > 0);
  });
};

export const getColumnProperties = (dCol: any): Record<string, any> => {
  const column: Record<string, any> = {};
  const dataType = (dCol.data_type || "").toUpperCase();

  switch (dataType) {
    case "SMALLINT":
    case "INTEGER":
    case "BIGINT": {
      if (typeof dCol.column_default === "string" && dCol.column_default.indexOf("nextval(") === 0) {
        column.type = "serial";
      } else {
        column.type = "integer";
      }
      Object.keys(columnSizes.integer).forEach((key) => {
        const numericKey = Number(key);
        if (columnSizes.integer[numericKey] === dataType) {
          column.size = numericKey;
        }
      });
      break;
    }
    case "REAL":
    case "DOUBLE PRECISION": {
      column.type = "number";
      column.rational = true;
      Object.keys(columnSizes.floating).forEach((key) => {
        const numericKey = Number(key);
        if (columnSizes.floating[numericKey] === dataType) {
          column.size = numericKey;
        }
      });
      break;
    }
    case "BOOLEAN": {
      column.type = "boolean";
      break;
    }
    case "TIMESTAMP WITHOUT TIME ZONE": {
      column.time = true;
      column.type = "date";
      break;
    }
    case "DATE": {
      column.type = "date";
      break;
    }
    case "BYTEA": {
      column.type = "binary";
      break;
    }
    case "TEXT": {
      column.type = "text";
      break;
    }
    case "CHARACTER VARYING": {
      column.type = "text";
      if (dCol.character_maximum_length) {
        column.size = dCol.character_maximum_length;
      }
      break;
    }
    case "UUID": {
      column.type = "uuid";
      break;
    }
    case "USER-DEFINED": {
      if (typeof dCol.udt_name === "string" && dCol.udt_name.match(/_enum_/)) {
        column.type = "enum";
        column.values = [];
        break;
      }
      throw new Error(`Unknown column type '${dCol.data_type}'`);
    }
    default:
      throw new Error(`Unknown column type '${dCol.data_type}'`);
  }

  return column;
};

export const getCollectionProperties = (driver: any, name: string, cb: Callback<Record<string, any>>): void => {
  driver.execQuery("SELECT * FROM information_schema.columns WHERE table_name = ?", [name], (err: Error | null, cols: any[]) => {
    if (err) {
      cb(err);
      return;
    }

    const columns: Record<string, any> = {};

    for (let i = 0; i < cols.length; i += 1) {
      const dCol = cols[i];
      const column: Record<string, any> = {};

      if (typeof dCol.is_nullable === "string" && dCol.is_nullable.toUpperCase() === "NO") {
        column.required = true;
      }

      if (dCol.column_default !== null && dCol.column_default !== undefined) {
        const match = String(dCol.column_default).match(/^'(.+)'::/);
        if (match) {
          column.defaultValue = match[1];
        } else {
          column.defaultValue = dCol.column_default;
        }
      }

      try {
        _.extend(column, getColumnProperties(dCol));
      } catch (error) {
        cb(error as Error);
        return;
      }

      columns[dCol.column_name] = column;
    }

    checkColumnTypes(driver, name, columns, cb);
  });
};

export const createCollection = (driver: any, name: string, columns: string[], keys: string[], cb: Callback): void => {
  driver.execQuery(
    SQL.CREATE_TABLE(
      {
        name,
        columns,
        keys,
      },
      driver,
    ),
    cb,
  );
};

export const dropCollection = (driver: any, name: string, cb: Callback): void => {
  driver.execQuery(
    SQL.DROP_TABLE(
      {
        name,
      },
      driver,
    ),
    cb,
  );
};

export const addPrimaryKey = (driver: any, tableName: string, columnName: string, cb: Callback): void => {
  const sql = "ALTER TABLE ?? ADD CONSTRAINT ?? PRIMARY KEY(??);";
  driver.execQuery(sql, [tableName, `${tableName}_${columnName}_pk`, columnName], cb);
};

export const dropPrimaryKey = (driver: any, tableName: string, columnName: string, cb: Callback): void => {
  const sql = "ALTER TABLE ?? DROP CONSTRAINT ??;";
  driver.execQuery(sql, [tableName, `${tableName}_${columnName}_pk`], cb);
};

export const addForeignKey = (driver: any, tableName: string, options: any, cb: Callback): void => {
  const sql = "ALTER TABLE ?? ADD FOREIGN KEY(??) REFERENCES ?? (??);";
  driver.execQuery(sql, [tableName, options.name, options.references.table, options.references.column], cb);
};

export const dropForeignKey = (driver: any, tableName: string, columnName: string, cb: Callback): void => {
  const sql = "ALTER TABLE ?? DROP CONSTRAINT ??;";
  driver.execQuery(sql, [tableName, `${tableName}_${columnName}_fkey`], cb);
};

export const addCollectionColumn = (driver: any, name: string, column: string, _afterColumn: string | null, cb: Callback): void => {
  const sql = "ALTER TABLE ?? ADD " + column + ";";
  driver.execQuery(sql, [name], cb);
};

export const renameCollectionColumn = (driver: any, name: string, oldColName: string, newColName: string, cb: Callback): void => {
  const sql = SQL.ALTER_TABLE_RENAME_COLUMN(
    {
      name,
      oldColName,
      newColName,
    },
    driver,
  );

  driver.execQuery(sql, cb);
};

export const modifyCollectionColumn = (driver: any, name: string, column: string, cb: Callback): void => {
  const firstSpace = column.indexOf(" ");
  const colName = column.substr(0, firstSpace);
  const queue = new Queue(cb);
  let remainder = column.substr(firstSpace + 1);
  let colType = remainder;

  const secondSpace = remainder.indexOf(" ");
  if (secondSpace > 0) {
    colType = remainder.substr(0, secondSpace);
    remainder = remainder.substr(secondSpace + 1);
  } else {
    remainder = "";
  }

  queue.add((next: Callback) => {
    driver.execQuery(`ALTER TABLE ${name} ALTER ${colName} TYPE ${colType}`, next);
  });

  if (remainder) {
    if (remainder.match(/NOT NULL/)) {
      queue.add((next: Callback) => {
        driver.execQuery(`ALTER TABLE ${name} ALTER ${colName} SET NOT NULL`, next);
      });
    } else {
      queue.add((next: Callback) => {
        driver.execQuery(`ALTER TABLE ${name} ALTER ${colName} DROP NOT NULL`, next);
      });
    }

    const defaultMatch = remainder.match(/DEFAULT (.+)$/);
    if (defaultMatch) {
      queue.add((next: Callback) => {
        driver.execQuery(`ALTER TABLE ${name} ALTER ${colName} SET DEFAULT ${defaultMatch[1]}`, next);
      });
    }
  }

  queue.check();
};

export const dropCollectionColumn = (driver: any, name: string, column: string, cb: Callback): void => {
  driver.execQuery(
    SQL.ALTER_TABLE_DROP_COLUMN(
      {
        name,
        column,
      },
      driver,
    ),
    cb,
  );
};

export const getCollectionIndexes = (driver: any, name: string, cb: Callback<Record<string, any>>): void => {
  const sql =
    "SELECT t.relname, i.relname, a.attname, ix.indisunique, ix.indisprimary " +
    "FROM pg_class t, pg_class i, pg_index ix, pg_attribute a " +
    "WHERE t.oid = ix.indrelid AND i.oid = ix.indexrelid " +
    "AND a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) " +
    "AND t.relkind = 'r' AND t.relname = ?";

  driver.execQuery(sql, [name], (err: Error | null, rows: any[]) => {
    if (err) {
      cb(err);
      return;
    }

    cb(null, convertIndexRows(rows));
  });
};

export const addIndex = (driver: any, name: string, unique: boolean, collection: string, columns: string[], cb: Callback): void => {
  driver.execQuery(
    SQL.CREATE_INDEX(
      {
        name,
        unique,
        collection,
        columns,
      },
      driver,
    ),
    cb,
  );
};

export const removeIndex = (driver: any, _collection: string, name: string, cb: Callback): void => {
  driver.execQuery(`DROP INDEX ${driver.query.escapeId(name)}`, cb);
};

export const convertIndexes = (collection: any, indexes: any[]): any[] => {
  for (let i = 0; i < indexes.length; i += 1) {
    indexes[i].name = `${collection.name}_${indexes[i].name}`;
  }

  return indexes;
};

export const getType = (collection: string, property: Record<string, any>, driver: any): { value: string; before: false | ((drv: any, next: Callback) => void) } | false => {
  let type: string | false = false;
  let before: false | ((drv: any, next: Callback) => void) = false;
  let customType: any = null;

  if (property.type === "number" && property.rational === false) {
    property.type = "integer";
    delete property.rational;
  }

  if (property.serial) {
    type = "SERIAL";
  } else {
    switch (property.type) {
      case "text":
        type = "TEXT";
        break;
      case "integer":
        type = columnSizes.integer[getNumericSize(property.size, 4)];
        break;
      case "number":
        type = columnSizes.floating[getNumericSize(property.size, 4)];
        break;
      case "serial":
        property.serial = true;
        property.key = true;
        type = "SERIAL";
        break;
      case "boolean":
        type = "BOOLEAN";
        break;
      case "date":
        type = property.time ? "TIMESTAMP WITHOUT TIME ZONE" : "DATE";
        break;
      case "binary":
      case "object":
        type = "BYTEA";
        break;
      case "enum": {
        type = `${collection}_enum_${String(property.mapsTo || "").toLowerCase()}`;
        if (!Array.isArray(property.values) || property.values.length === 0) {
          return false;
        }
        before = (drv: any, next: Callback): void => {
          const enumType = `${collection}_enum_${String(property.mapsTo || "").toLowerCase()}`;

          drv.execQuery("SELECT * FROM pg_catalog.pg_type WHERE typname = ?", [enumType], (err: Error | null, rows: any[]) => {
            if (!err && rows.length) {
              next();
              return;
            }

            const values = property.values.map((val: any) => drv.query.escapeVal(val));

            drv.execQuery(`CREATE TYPE ${enumType} AS ENUM (${values.join(", ")})`, next);
          });
        };
        break;
      }
      case "point":
        type = "POINT";
        break;
      case "uuid":
        type = "UUID";
        break;
      default:
        customType = driver.customTypes ? driver.customTypes[property.type] : null;
        if (customType) {
          type = customType.datastoreType();
        }
    }

    if (!type) {
      return false;
    }

    if (property.required) {
      type += " NOT NULL";
    }

    if (Object.prototype.hasOwnProperty.call(property, "defaultValue")) {
      if (property.type === "date" && property.defaultValue === Date.now) {
        type += " DEFAULT now()";
      } else {
        let defaultValue = property.defaultValue;

        if (property.type === "boolean") {
          if (typeof defaultValue === "string") {
            const normalized = defaultValue.trim().toLowerCase();
            defaultValue = ["true", "1", "t", "yes", "y"].includes(normalized);
          } else {
            defaultValue = Boolean(defaultValue);
          }
        }

        type += ` DEFAULT ${driver.query.escapeVal(defaultValue)}`;
      }
    }

    if (Object.prototype.hasOwnProperty.call(property, "defaultExpression")) {
      type += ` DEFAULT ${property.defaultExpression}`;
    }
  }

  return {
    value: type,
    before,
  };
};

function convertIndexRows(rows: any[]): Record<string, any> {
  const indexes: Record<string, any> = {};

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];

    if (row.indisprimary) {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(indexes, row.relname)) {
      indexes[row.relname] = {
        columns: [] as string[],
        unique: row.indisunique,
      };
    }

    indexes[row.relname].columns.push(row.attname);
  }

  return indexes;
}

function checkColumnTypes(driver: any, collection: string, columns: Record<string, any>, cb: Callback<Record<string, any>>): void {
  const queue = new Queue((err?: Error | null) => {
    if (err) {
      cb(err);
      return;
    }

    cb(null, columns);
  });

  Object.keys(columns).forEach((key) => {
    if (columns[key].type === "enum") {
      queue.add((next: Callback) => {
        const colName = `${collection}_enum_${key}`;

        driver.execQuery(
          "SELECT t.typname, string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder) AS enum_values " +
            "FROM pg_catalog.pg_type t JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid  " +
            "WHERE t.typname = ? GROUP BY 1",
          [colName],
          (err: Error | null, rows: any[]) => {
            if (err) {
              next(err);
              return;
            }

            if (rows.length) {
              columns[key].values = rows[0].enum_values.split("|");
            }

            next();
          },
        );
      });
    }
  });

  queue.check();
}

export default {
  hasCollection,
  getColumnProperties,
  getCollectionProperties,
  createCollection,
  dropCollection,
  addPrimaryKey,
  dropPrimaryKey,
  addForeignKey,
  dropForeignKey,
  addCollectionColumn,
  renameCollectionColumn,
  modifyCollectionColumn,
  dropCollectionColumn,
  getCollectionIndexes,
  addIndex,
  removeIndex,
  convertIndexes,
  getType,
};
