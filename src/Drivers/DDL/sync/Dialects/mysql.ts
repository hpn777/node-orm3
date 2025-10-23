import * as SQL from "../SQL";

type Callback<T = any> = (err?: Error | null, result?: T) => void;

type ColumnSizes = Record<number, string>;

const columnSizes: { integer: ColumnSizes; floating: ColumnSizes } = {
  integer: { 2: "SMALLINT", 4: "INTEGER", 8: "BIGINT" },
  floating: { 4: "FLOAT", 8: "DOUBLE" },
};

const getNumericSize = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const hasCollection = (driver: any, name: string, cb: Callback<boolean>): void => {
  driver.execQuery("SHOW TABLES LIKE ?", [name], (err: Error | null, rows: any[]) => {
    if (err) {
      cb(err);
      return;
    }

    cb(null, rows.length > 0);
  });
};

export const addPrimaryKey = (driver: any, tableName: string, columnName: string, cb: Callback): void => {
  const sql = "ALTER TABLE ?? ADD CONSTRAINT ?? PRIMARY KEY(??);";
  driver.execQuery(sql, [tableName, `${columnName}PK`, columnName], cb);
};

export const dropPrimaryKey = (driver: any, tableName: string, _columnName: string, cb: Callback): void => {
  const sql = "ALTER TABLE ?? DROP PRIMARY KEY;";
  driver.execQuery(sql, [tableName], cb);
};

export const addForeignKey = (driver: any, tableName: string, options: any, cb: Callback): void => {
  const sql = " ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY(??) REFERENCES ??(??)";
  driver.execQuery(sql, [tableName, `${options.name}_fk`, options.name, options.references.table, options.references.column], cb);
};

export const dropForeignKey = (driver: any, tableName: string, columnName: string, cb: Callback): void => {
  const sql = "ALTER TABLE ?? DROP FOREIGN KEY ??;";
  driver.execQuery(sql, [tableName, `${columnName}_fk`], cb);
};

export const getCollectionProperties = (driver: any, name: string, cb: Callback<Record<string, any>>): void => {
  driver.execQuery("SHOW COLUMNS FROM ??", [name], (err: Error | null, cols: any[]) => {
    if (err) {
      cb(err);
      return;
    }

    const columns: Record<string, any> = {};

    for (let i = 0; i < cols.length; i += 1) {
      const dCol = cols[i];
      const column: Record<string, any> = {};

      if (dCol.Type.indexOf(" ") > 0) {
        dCol.SubType = dCol.Type.substr(dCol.Type.indexOf(" ") + 1).split(/\s+/);
        dCol.Type = dCol.Type.substr(0, dCol.Type.indexOf(" "));
      }

      const sizeMatch = dCol.Type.match(/^(.+)\((\d+)\)$/);
      if (sizeMatch) {
        dCol.Size = parseInt(sizeMatch[2], 10);
        dCol.Type = sizeMatch[1];
      }

      if (typeof dCol.Extra === "string" && dCol.Extra.toUpperCase() === "AUTO_INCREMENT") {
        column.serial = true;
        column.unsigned = true;
      }

      if (dCol.Key === "PRI") {
        column.primary = true;
      }

      if (typeof dCol.Null === "string" && dCol.Null.toUpperCase() === "NO") {
        column.required = true;
      }

      if (dCol.Default !== null && dCol.Default !== undefined) {
        column.defaultValue = dCol.Default;
      }

      switch ((dCol.Type || "").toUpperCase()) {
        case "SMALLINT":
        case "INTEGER":
        case "BIGINT":
        case "INT": {
          column.type = "integer";
          column.size = 4;
          Object.keys(columnSizes.integer).forEach((key) => {
            const numericKey = Number(key);
            if (columnSizes.integer[numericKey] === dCol.Type.toUpperCase()) {
              column.size = numericKey;
            }
          });
          break;
        }
        case "FLOAT":
        case "DOUBLE": {
          column.type = "number";
          column.rational = true;
          Object.keys(columnSizes.floating).forEach((key) => {
            const numericKey = Number(key);
            if (columnSizes.floating[numericKey] === dCol.Type.toUpperCase()) {
              column.size = numericKey;
            }
          });
          break;
        }
        case "TINYINT": {
          if (dCol.Size === 1) {
            column.type = "boolean";
          } else {
            column.type = "integer";
          }
          break;
        }
        case "DATETIME": {
          column.time = true;
          column.type = "date";
          break;
        }
        case "DATE": {
          column.type = "date";
          break;
        }
        case "LONGBLOB": {
          column.big = true;
          column.type = "binary";
          break;
        }
        case "BLOB": {
          column.type = "binary";
          break;
        }
        case "VARCHAR": {
          column.type = "text";
          if (dCol.Size) {
            column.size = dCol.Size;
          }
          break;
        }
        default: {
          const enumMatch = dCol.Type.match(/^enum\('(.+)'\)$/i);
          if (enumMatch) {
            column.type = "enum";
            column.values = enumMatch[1].split(/'\s*,\s*'/);
            break;
          }
          cb(new Error(`Unknown column type '${dCol.Type}'`));
          return;
        }
      }

      if (column.serial) {
        column.type = "serial";
      }

      columns[dCol.Field] = column;
    }

    cb(null, columns);
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

export const addCollectionColumn = (driver: any, name: string, column: string, afterColumn: string | null, cb: Callback): void => {
  driver.execQuery(
    SQL.ALTER_TABLE_ADD_COLUMN(
      {
        name,
        column,
        after: afterColumn ?? undefined,
        first: !afterColumn,
      },
      driver,
    ),
    cb,
  );
};

export const renameCollectionColumn = (_driver: any, _name: string, _oldColName: string, _newColName: string, cb: Callback): void => {
  cb(new Error("MySQL doesn't support simple column rename"));
};

export const modifyCollectionColumn = (driver: any, name: string, column: string, cb: Callback): void => {
  driver.execQuery(
    SQL.ALTER_TABLE_MODIFY_COLUMN(
      {
        name,
        column,
      },
      driver,
    ),
    cb,
  );
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
  let q = "";
  q += "SELECT index_name, column_name, non_unique ";
  q += "FROM information_schema.statistics ";
  q += "WHERE table_schema = ? AND table_name = ?";

  driver.execQuery(q, [driver.config.database, name], (err: Error | null, rows: any[]) => {
    if (err) {
      cb(err);
      return;
    }

    cb(null, convertIndexRows(rows));
  });
};

export const addIndex = (driver: any, indexName: string, unique: boolean, collection: string, columns: string[], cb: Callback): void => {
  driver.execQuery(
    SQL.CREATE_INDEX(
      {
        name: indexName,
        unique,
        collection,
        columns,
      },
      driver,
    ),
    cb,
  );
};

export const removeIndex = (driver: any, collection: string, name: string, cb: Callback): void => {
  driver.execQuery(
    SQL.DROP_INDEX(
      {
        name,
        collection,
      },
      driver,
    ),
    cb,
  );
};

export const getType = (collection: string, property: Record<string, any>, driver: any): { value: string; before: false | ((drv: any, next: Callback) => void) } | false => {
  let type: string | false = false;
  let customType: any = null;

  if (property.type === "number" && property.rational === false) {
    property.type = "integer";
    delete property.rational;
  }

  switch (property.type) {
    case "text":
      if (property.big) {
        type = "LONGTEXT";
      } else {
        const computedSize = Math.min(Math.max(getNumericSize(property.size, 255), 1), 65535);
        type = `VARCHAR(${computedSize})`;
      }
      break;
    case "integer":
      type = columnSizes.integer[getNumericSize(property.size, 4)];
      break;
    case "number":
      type = columnSizes.floating[getNumericSize(property.size, 4)];
      break;
    case "serial":
      property.type = "number";
      property.serial = true;
      property.key = true;
      type = "INT(11)";
      break;
    case "boolean":
      type = "TINYINT(1)";
      break;
    case "date":
      type = property.time ? "DATETIME" : "DATE";
      break;
    case "binary":
    case "object":
      type = property.big === true ? "LONGBLOB" : "BLOB";
      break;
    case "enum":
      if (!Array.isArray(property.values) || property.values.length === 0) {
        return false;
      }
      type = `ENUM (${property.values.map((val: any) => driver.query.escapeVal(val)).join(", ")})`;
      break;
    case "point":
      type = "POINT";
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

  if (property.serial) {
    if (!property.required) {
      type += " NOT NULL";
    }
    type += " AUTO_INCREMENT";
  }

  if (Object.prototype.hasOwnProperty.call(property, "defaultValue")) {
    type += ` DEFAULT ${driver.query.escapeVal(property.defaultValue)}`;
  }

  if (Object.prototype.hasOwnProperty.call(property, "defaultExpression")) {
    type += ` DEFAULT (${property.defaultExpression})`;
  }

  return {
    value: type,
    before: false,
  };
};

function convertIndexRows(rows: any[]): Record<string, any> {
  const indexes: Record<string, any> = {};

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];

    if (row.index_name === "PRIMARY") {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(indexes, row.index_name)) {
      indexes[row.index_name] = {
        columns: [] as string[],
        unique: row.non_unique === 0,
      };
    }

    indexes[row.index_name].columns.push(row.column_name);
  }

  return indexes;
}

export default {
  hasCollection,
  addPrimaryKey,
  dropPrimaryKey,
  addForeignKey,
  dropForeignKey,
  getCollectionProperties,
  createCollection,
  dropCollection,
  addCollectionColumn,
  renameCollectionColumn,
  modifyCollectionColumn,
  dropCollectionColumn,
  getCollectionIndexes,
  addIndex,
  removeIndex,
  getType,
};
