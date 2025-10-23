import _ from "lodash";
import { Queue } from "./Queue";
import mysqlDialect from "./Dialects/mysql";
import postgresqlDialect from "./Dialects/postgresql";
import sqliteDialect from "./Dialects/sqlite";

export type Callback<T = any> = (err?: Error | null, result?: T) => void;
export type DebugFn = (...args: any[]) => void;

export interface SyncOptions {
  driver: any;
  debug?: DebugFn | false;
  suppressColumnDrop?: boolean;
}

interface CollectionDefinition {
  name: string;
  properties: Record<string, any>;
}

interface TypeDefinition {
  datastoreType: (property: Record<string, any>) => any;
}

interface ColumnDefinition {
  value: string;
  before?: false | ((driver: any, next: Callback) => void);
}

type DialectModule = Record<string, any>;

const DIALECTS: Record<string, DialectModule> = {
  mysql: mysqlDialect,
  postgresql: postgresqlDialect,
  sqlite: sqliteDialect,
};

const noOp: DebugFn = () => {};

export class Sync {
  private readonly debug: DebugFn;
  private readonly driver: any;
  private readonly dialect: DialectModule;
  private readonly suppressColumnDrop: boolean;
  private readonly collections: CollectionDefinition[] = [];
  private readonly types: Record<string, TypeDefinition> = {};
  private totalChanges = 0;

  constructor(options: SyncOptions) {
    this.driver = options.driver;
    this.debug = typeof options.debug === "function" ? options.debug : noOp;
    this.suppressColumnDrop = Boolean(options.suppressColumnDrop);

    const dialectName = this.driver && this.driver.dialect;
    this.dialect = DIALECTS[dialectName];

    if (!this.dialect) {
      throw new Error(`Unsupported dialect '${dialectName}'`);
    }
  }

  defineCollection(collection: string, properties: Record<string, any>): this {
    this.collections.push({
      name: collection,
      properties,
    });

    return this;
  }

  defineType(type: string, definition: TypeDefinition): this {
    this.types[type] = definition;
    return this;
  }

  sync(cb: Callback<{ changes: number }>): void {
    let index = 0;

    const processNext = (): void => {
      if (index >= this.collections.length) {
        cb(null, { changes: this.totalChanges });
        return;
      }

      const collection = this.collections[index++];

      this.processCollection(collection, (err?: Error | null) => {
        if (err) {
          cb(err);
          return;
        }

        processNext();
      });
    };

    this.totalChanges = 0;
    processNext();
  }

  private processCollection(collection: CollectionDefinition, cb: Callback): void {
    this.dialect.hasCollection(this.driver, collection.name, (err: Error | null, has: boolean) => {
      if (err) {
        cb(err);
        return;
      }

      if (!has) {
        this.createCollection(collection, cb);
        return;
      }

      // Legacy path from original module intentionally skipped (see upstream comments)
      cb(null, false);
    });
  }

  private createCollection(collection: CollectionDefinition, cb: Callback): void {
    const columns: string[] = [];
    const keys: string[] = [];
    const before: Array<(driver: any, next: Callback) => void> = [];

    const nextBefore = (): void => {
      if (before.length === 0) {
        this.dialect.createCollection(this.driver, collection.name, columns, keys, (err: Error | null) => {
          if (err) {
            cb(err);
            return;
          }

          this.syncIndexes(collection.name, this.getCollectionIndexes(collection), cb);
        });
        return;
      }

      const next = before.shift();

      if (!next) {
        nextBefore();
        return;
      }

      next(this.driver, (err?: Error | null) => {
        if (err) {
          cb(err);
          return;
        }

        nextBefore();
      });
    };

    const propertyKeys = Object.keys(collection.properties);

    for (const key of propertyKeys) {
      const prop = collection.properties[key];
      prop.mapsTo = prop.mapsTo || key;

      const column = this.createColumn(collection.name, prop);

      if (column === false) {
        cb(new Error(`Unknown type for property '${key}'`));
        return;
      }

      if (prop.key) {
        keys.push(prop.mapsTo);
      }

      columns.push(column.value);

      if (column.before && typeof column.before === "function") {
        before.push(column.before);
      }
    }

    this.debug(`Creating ${collection.name}`);

    if (typeof this.dialect.processKeys === "function") {
      const processed = this.dialect.processKeys(keys);
      if (Array.isArray(processed)) {
        keys.splice(0, keys.length, ...processed);
      }
    }

    this.totalChanges += 1;
    nextBefore();
  }

  private createColumn(collection: string, prop: Record<string, any>): ColumnDefinition | false {
    let type = null;

    if (Object.prototype.hasOwnProperty.call(this.types, prop.type)) {
      type = this.types[prop.type].datastoreType(prop);
    } else {
      type = this.dialect.getType(collection, prop, this.driver);
    }

    if (type === false || type === null || type === undefined) {
      return false;
    }

    const column: ColumnDefinition = typeof type === "string" ? { value: type } : type;

    if (prop.mapsTo === undefined) {
      // eslint-disable-next-line no-console
      console.log("undefined prop.mapsTo", prop, new Error().stack);
    }

    const value = `${this.driver.query.escapeId(prop.mapsTo)} ${column.value}`;

    return {
      value,
      before: column.before ?? false,
    };
  }

  private syncIndexes(name: string, indexes: any[], cb: Callback): void {
    if (!indexes.length) {
      cb(null);
      return;
    }

    this.dialect.getCollectionIndexes(this.driver, name, (err: Error | null, dbIndexes: Record<string, any>) => {
      if (err) {
        cb(err);
        return;
      }

      const queue = new Queue(cb);

      for (let i = 0; i < indexes.length; i += 1) {
        const index = indexes[i];

        if (!Object.prototype.hasOwnProperty.call(dbIndexes, index.name)) {
          this.debug(`Adding index ${name}.${index.name} (${index.columns.join(", ")})`);
          this.totalChanges += 1;

          queue.add((next: Callback) => {
            this.dialect.addIndex(this.driver, index.name, index.unique, name, index.columns, next);
          });
          continue;
        }

        if (!dbIndexes[index.name].unique !== !index.unique) {
          this.debug(`Replacing index ${name}.${index.name}`);
          this.totalChanges += 1;

          queue.add((next: Callback) => {
            this.dialect.removeIndex(this.driver, index.name, name, next);
          });

          queue.add((next: Callback) => {
            this.dialect.addIndex(this.driver, index.name, index.unique, name, index.columns, next);
          });
        }

        delete dbIndexes[index.name];
      }

      Object.keys(dbIndexes).forEach((indexName) => {
        this.debug(`Removing index ${name}.${indexName}`);
        this.totalChanges += 1;

        queue.add((next: Callback) => {
          this.dialect.removeIndex(this.driver, indexName, name, next);
        });
      });

      queue.check();
    });
  }

  private getCollectionIndexes(collection: CollectionDefinition): any[] {
    const indexes: any[] = [];

    for (const key of Object.keys(collection.properties)) {
      const prop = collection.properties[key];
      prop.name = prop.name || key;

      if (prop.unique) {
        const uniqueValues = Array.isArray(prop.unique) ? prop.unique : [prop.unique];

        for (const uniqueIndex of uniqueValues) {
          if (uniqueIndex === true) {
            indexes.push({
              name: this.getIndexName(collection, prop),
              unique: true,
              columns: [key],
            });
            continue;
          }

          let found = false;
          for (let i = 0; i < indexes.length; i += 1) {
            if (indexes[i].name === uniqueIndex) {
              indexes[i].columns.push(key);
              found = true;
              break;
            }
          }

          if (!found) {
            indexes.push({
              name: uniqueIndex,
              unique: true,
              columns: [key],
            });
          }
        }
      }

      if (prop.index) {
        const indexValues = Array.isArray(prop.index) ? prop.index : [prop.index];

        for (const indexValue of indexValues) {
          if (indexValue === true) {
            indexes.push({
              name: this.getIndexName(collection, prop),
              columns: [key],
            });
            continue;
          }

          let found = false;
          for (let i = 0; i < indexes.length; i += 1) {
            if (indexes[i].name === indexValue) {
              indexes[i].columns.push(key);
              found = true;
              break;
            }
          }

          if (!found) {
            indexes.push({
              name: indexValue,
              columns: [key],
            });
          }
        }
      }
    }

    if (typeof this.dialect.convertIndexes === "function") {
      return this.dialect.convertIndexes(collection, indexes);
    }

    return indexes;
  }

  private getIndexName(collection: CollectionDefinition, prop: Record<string, any>): string {
    const postfix = prop.unique ? "unique" : "index";

    if (this.driver.dialect === "sqlite") {
      return `${collection.name}_${prop.name}_${postfix}`;
    }

    return `${prop.name}_${postfix}`;
  }

  private needToSync(property: Record<string, any>, column: Record<string, any>): boolean {
    if (property.serial && property.type === "number") {
      property.type = "serial";
    }

    if (property.type !== column.type) {
      if (typeof this.dialect.supportsType !== "function") {
        return true;
      }

      if (this.dialect.supportsType(property.type) !== column.type) {
        return true;
      }
    }

    if (property.type === "serial") {
      return false;
    }

    if (property.required !== column.required && !property.key) {
      return true;
    }

    if (Object.prototype.hasOwnProperty.call(property, "defaultValue") && property.defaultValue !== column.defaultValue) {
      return true;
    }

    if ((property.type === "number" || property.type === "integer") && Object.prototype.hasOwnProperty.call(column, "size")) {
      const propertySize = property.size || 4;
      if (propertySize !== column.size) {
        return true;
      }
    }

    if (property.type === "enum" && column.type === "enum") {
      const differenceA = _.difference(property.values || [], column.values || []);
      const differenceB = _.difference(column.values || [], property.values || []);

      if (differenceA.length > 0 || differenceB.length > 0) {
        return true;
      }
    }

    return false;
  }

  private syncCollection(collection: CollectionDefinition, columns: Record<string, any>, cb: Callback): void {
    const queue = new Queue(cb);
    let lastKey: string | null = null;

    this.debug(`Synchronizing ${collection.name}`);

    for (const key of Object.keys(collection.properties)) {
      const property = collection.properties[key];

      if (!Object.prototype.hasOwnProperty.call(columns, key)) {
        const column = this.createColumn(collection.name, property);

        if (column === false) {
          queue.add((next: Callback) => {
            next(new Error(`Unknown type for property '${key}'`));
          });
          lastKey = key;
          continue;
        }

        this.debug(`Adding column ${collection.name}.${key}: ${column.value}`);
        this.totalChanges += 1;

        const beforeHook = column.before;

        if (beforeHook) {
          queue.add((next: Callback) => {
            beforeHook(this.driver, (err?: Error | null) => {
              if (err) {
                next(err);
                return;
              }

              this.dialect.addCollectionColumn(this.driver, collection.name, column.value, lastKey, next);
            });
          });
        } else {
          queue.add((next: Callback) => {
            this.dialect.addCollectionColumn(this.driver, collection.name, column.value, lastKey, next);
          });
        }
      } else if (this.needToSync(property, columns[key])) {
        const column = this.createColumn(collection.name, property);

        if (column === false) {
          queue.add((next: Callback) => {
            next(new Error(`Unknown type for property '${key}'`));
          });
          lastKey = key;
          continue;
        }

        this.debug(`Modifying column ${collection.name}.${key}: ${column.value}`);
        this.totalChanges += 1;

        const beforeHook = column.before;

        if (beforeHook) {
          queue.add((next: Callback) => {
            beforeHook(this.driver, (err?: Error | null) => {
              if (err) {
                next(err);
                return;
              }

              this.dialect.modifyCollectionColumn(this.driver, collection.name, column.value, next);
            });
          });
        } else {
          queue.add((next: Callback) => {
            this.dialect.modifyCollectionColumn(this.driver, collection.name, column.value, next);
          });
        }
      }

      lastKey = key;
    }

    if (!this.suppressColumnDrop) {
      for (const key of Object.keys(columns)) {
        if (!Object.prototype.hasOwnProperty.call(collection.properties, key)) {
          queue.add((next: Callback) => {
            this.debug(`Dropping column ${collection.name}.${key}`);
            this.totalChanges += 1;

            this.dialect.dropCollectionColumn(this.driver, collection.name, key, next);
          });
        }
      }
    }

    const indexes = this.getCollectionIndexes(collection);

    if (indexes.length) {
      queue.add((next: Callback) => {
        this.syncIndexes(collection.name, indexes, next);
      });
    }

    queue.check();
  }
}

export const dialect = (name: string): DialectModule => {
  const module = DIALECTS[name];

  if (!module) {
    throw new Error(`Unknown SQL DDL dialect '${name}'`);
  }

  return module;
};

export default {
  Sync,
  dialect,
};
