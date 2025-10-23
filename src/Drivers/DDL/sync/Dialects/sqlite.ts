import { Queue } from "../Queue";
import * as SQL from "../SQL";

type Callback<T = any> = (err?: Error | null, result?: T) => void;

export const hasCollection = (driver: any, name: string, cb: Callback<boolean>): void => {
  driver.execQuery(
    "SELECT * FROM sqlite_master WHERE type = 'table' and name = ?",
    [name],
    (err: Error | null, rows: any[]) => {
      if (err) {
        cb(err);
        return;
      }

      cb(null, rows.length > 0);
    },
  );
};

export const addPrimaryKey = (driver: any, tableName: string, columnName: string, cb: Callback): void => {
  const sql = "ALTER TABLE ?? ADD CONSTRAINT ?? PRIMARY KEY(??);";
  driver.execQuery(sql, [tableName, `${columnName}PK`, columnName], cb);
};

export const dropPrimaryKey = (driver: any, tableName: string, columnName: string, cb: Callback): void => {
  const sql = "ALTER TABLE ?? DROP CONSTRAINT ??;";
  driver.execQuery(sql, [tableName, `${columnName}PK`], cb);
};

export const addForeignKey = (driver: any, tableName: string, options: any, cb: Callback): void => {
  const sql = "ALTER TABLE ?? ADD FOREIGN KEY(??) REFERENCES ??(??);";
  driver.execQuery(sql, [tableName, options.name, options.references.table, options.references.column], cb);
};

export const dropForeignKey = (driver: any, tableName: string, columnName: string, cb: Callback): void => {
  const sql = "ALTER TABLE ?? DROP CONSTRAINT ??;";
  driver.execQuery(sql, [tableName, `${tableName}_${columnName}_fkey`], cb);
};

export const getCollectionProperties = (driver: any, name: string, cb: Callback<Record<string, any>>): void => {
  driver.execQuery("PRAGMA table_info(??)", [name], (err: Error | null, cols: any[]) => {
    if (err) {
      cb(err);
      return;
    }

    const columns: Record<string, any> = {};

    for (let i = 0; i < cols.length; i += 1) {
      const dCol = cols[i];
      const column: Record<string, any> = {};

      if (dCol.pk) {
        column.key = true;
      }

      if (dCol.notnull) {
        column.required = true;
      }

      if (dCol.dflt_value) {
        const match = String(dCol.dflt_value).match(/^'(.*)'$/);
        if (match) {
          column.defaultValue = match[1];
        } else {
          column.defaultValue = match ? match[0] : dCol.dflt_value;
        }
      }

      switch ((dCol.type || "").toUpperCase()) {
        case "INTEGER": {
          if (dCol.pk === 1) {
            column.type = "serial";
          } else {
            column.type = "integer";
          }
          break;
        }
        case "INTEGER UNSIGNED": {
          column.type = "boolean";
          break;
        }
        case "REAL": {
          column.type = "number";
          column.rational = true;
          break;
        }
        case "DATETIME": {
          column.type = "date";
          column.time = true;
          break;
        }
        case "BLOB": {
          column.type = "binary";
          column.big = true;
          break;
        }
        case "TEXT": {
          column.type = "text";
          break;
        }
        default: {
          cb(new Error(`Unknown column type '${dCol.type}'`));
          return;
        }
      }

      columns[dCol.name] = column;
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
      },
      driver,
    ),
    cb,
  );
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

export const dropCollectionColumn = (_driver: any, _name: string, _column: string, cb: Callback): void => {
  cb();
};

export const getCollectionIndexes = (driver: any, name: string, cb: Callback<Record<string, any>>): void => {
  driver.execQuery(`PRAGMA index_list(${driver.query.escapeId(name)})`, (err: Error | null, rows: any[]) => {
    if (err) {
      cb(err);
      return;
    }

    const indexes = convertIndexRows(rows);
    const queue = new Queue((queueErr?: Error | null) => {
      cb(queueErr, indexes);
    });

    Object.keys(indexes).forEach((key) => {
      if (key.match(/^sqlite_autoindex/)) {
        delete indexes[key];
        return;
      }

      queue.add((next: Callback) => {
        driver.execQuery(`PRAGMA index_info(${driver.query.escapeVal(key)})`, (infoErr: Error | null, infoRows: any[]) => {
          if (infoErr) {
            next(infoErr);
            return;
          }

          for (let i = 0; i < infoRows.length; i += 1) {
            indexes[key].columns.push(infoRows[i].name);
          }

          next();
        });
      });
    });

    queue.check();
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

export const removeIndex = (driver: any, name: string, _collection: string, cb: Callback): void => {
  driver.execQuery(`DROP INDEX IF EXISTS ${driver.query.escapeId(name)}`, cb);
};

export const processKeys = (keys: string[]): string[] => {
  if (keys.length === 1) {
    return [];
  }
  return keys;
};

export const supportsType = (type: string): string => {
  switch (type) {
    case "boolean":
    case "enum":
      return "number";
    default:
      return type;
  }
};

export const getType = (_collection: string, property: Record<string, any>, driver: any): { value: string; before: false } | false => {
  let type: string | false = false;
  let customType: any = null;

  if (property.type === "number" && property.rational === false) {
    property.type = "integer";
    delete property.rational;
  }

  switch (property.type) {
    case "text":
      type = "TEXT";
      break;
    case "integer":
      type = "INTEGER";
      break;
    case "number":
      type = "REAL";
      break;
    case "serial":
      property.serial = true;
      property.key = true;
      type = "INTEGER";
      break;
    case "boolean":
      type = "INTEGER UNSIGNED";
      break;
    case "date":
      type = "DATETIME";
      break;
    case "binary":
    case "object":
      type = "BLOB";
      break;
    case "enum":
      type = "INTEGER";
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

  if (property.key) {
    if (!property.required) {
      type += " NOT NULL";
    }

    if (property.serial) {
      type += " PRIMARY KEY";
    }
  }

  if (property.serial) {
    if (!property.key) {
      type += " PRIMARY KEY";
    }
    type += " AUTOINCREMENT";
  }

  if (Object.prototype.hasOwnProperty.call(property, "defaultValue")) {
    type += ` DEFAULT ${driver.query.escapeVal(property.defaultValue)}`;
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

    if (!Object.prototype.hasOwnProperty.call(indexes, row.name)) {
      indexes[row.name] = {
        columns: [] as string[],
        unique: row.unique === 1,
      };
    }
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
  processKeys,
  supportsType,
  getType,
};
