import * as util from 'util';
import Debug from '../../Debug';
import { Query } from '../../SQLQuery';
import * as shared from './_shared';
import postgres = require('./postgres');

const LARGE_LIMIT = '9223372036854775807';

const transformQueryForQuestdb = (sql: string): string => {
  if (typeof sql !== 'string') {
    return sql;
  }

  const trimmed = sql.trimStart();
  if (!/^(select|with)/i.test(trimmed)) {
    return sql;
  }

  let transformed = sql.replace(/LIMIT\s+(\d+)\s+OFFSET\s+(\d+)/gi, (_match, limit, offset) => `LIMIT ${offset}, ${limit}`);

  if (!/LIMIT\s+\d+\s*,/i.test(transformed)) {
    transformed = transformed.replace(/OFFSET\s+(\d+)/gi, (_match, offset) => `LIMIT ${offset}, ${LARGE_LIMIT}`);
  }

  return transformed;
};

const resolveWithCallback = <T>(promise: Promise<T>, cb?: (err: Error | null, result?: T) => void): Promise<T> | void => {
  if (typeof cb === 'function') {
    promise.then((result) => cb(null, result)).catch((error: Error) => cb(error));
    return;
  }
  return promise;
};

const resolveVoidWithCallback = (promise: Promise<void>, cb?: (err: Error | null) => void): Promise<void> | void => {
  if (typeof cb === 'function') {
    promise.then(() => cb(null)).catch((error: Error) => cb(error));
    return;
  }
  return promise;
};

export function Driver(this: any, config: any, connection: any, opts: any): void {
  const questConfig = {
    port: 8812,
    ...config
  };

  if (questConfig.port) {
    const parsedPort = Number(questConfig.port);
    questConfig.port = Number.isFinite(parsedPort) ? parsedPort : 8812;
  }

  postgres.Driver.call(this, questConfig, connection, opts);

  // Ensure the query builder always uses the PostgreSQL dialect while reporting QuestDB as the driver dialect
  this.ddlDialect = 'questdb';
  this.queryDialect = 'postgresql';
  this.query = Query({ dialect: this.queryDialect, timezone: this.config?.timezone || 'local' });
  this.dialect = 'questdb';

  // QuestDB does not yet support RETURNING for INSERT statements
  this.supportsReturning = false;

  const originalExecSimpleQuery = this.execSimpleQuery.bind(this);
  this.execSimpleQuery = function (query: any, cb?: Function): Promise<any[]> | void {
    const sql = typeof query === 'string' ? transformQueryForQuestdb(query) : query;
    return originalExecSimpleQuery(sql, cb);
  };
}

util.inherits(Driver, postgres.Driver);

Object.assign(Driver.prototype, {
  generateQuery: shared.generateQuery,
  execQuery: shared.execQuery,
  eagerQuery: shared.eagerQuery
});

Driver.prototype.insert = function (
  this: any,
  table: string,
  data: Record<string, any>,
  keyProperties: any[] | null,
  cb?: (err: Error | null, ids?: Record<string, any>) => void
): Promise<Record<string, any>> | void {
  const promise = (async () => {
    const insertData: Record<string, any> = { ...data };

    if (Array.isArray(keyProperties) && keyProperties.length > 0) {
      for (const prop of keyProperties) {
        const columnName = prop.mapsTo;

        if (columnName && !Object.prototype.hasOwnProperty.call(insertData, columnName)) {
          const escapedColumn = this.query.escapeId(columnName);
          const escapedTable = this.query.escapeId(table);
          const nextIdSql = `SELECT COALESCE(MAX(${escapedColumn}), 0) + 1 AS orm_next_id FROM ${escapedTable}`;
          const rows = await this.execSimpleQuery(nextIdSql);
          const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : undefined;
          const nextIdValue = row ? (row.orm_next_id ?? row.ORM_NEXT_ID ?? Object.values(row)[0]) : null;
          const numericId = typeof nextIdValue === 'number' ? nextIdValue : Number(nextIdValue) || 1;
          insertData[columnName] = numericId;
        }
      }
    }

    const insertSql = this.query.insert()
      .into(table)
      .set(insertData)
      .build();

    if (this.opts.debug) {
      Debug.sql('questdb', insertSql);
    }

    const ids: Record<string, any> = {};

    await this.execSimpleQuery(insertSql);

    if (Array.isArray(keyProperties)) {
      for (const prop of keyProperties) {
        if (!prop || !prop.mapsTo) {
          ids[prop?.name ?? 'id'] = null;
          continue;
        }

        if (Object.prototype.hasOwnProperty.call(insertData, prop.mapsTo)) {
          ids[prop.name] = insertData[prop.mapsTo];
        } else if (Object.prototype.hasOwnProperty.call(data, prop.mapsTo)) {
          ids[prop.name] = data[prop.mapsTo];
        } else {
          ids[prop.name] = null;
        }
      }
    }

    return ids;
  })();

  return resolveWithCallback(promise, cb);
};

Driver.prototype.remove = function (
  this: any,
  table: string,
  conditions: Record<string, any>,
  cb?: (err: Error | null, rows?: any[]) => void
): Promise<any[]> | void {
  const promise = (async () => {
    const hasConditions = conditions && typeof conditions === 'object' && Object.keys(conditions).length > 0;

    if (!hasConditions) {
      await this.clear(table);
      return [];
    }

  const baseTableNameRaw = typeof table === 'string' ? table.split('.').pop() || table : 'orm3_table';
  const baseTableName = baseTableNameRaw.replace(/"/g, '');
  const tempTable = `${baseTableName}__orm3_rm_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    const escapedTempTable = this.query.escapeId(tempTable);
    const escapedOriginalTable = this.query.escapeId(table);

    const selectBuilder = this.query.select().from(table).where({ not: [conditions] });
    const selectSql = selectBuilder.build();

    const createSql = `CREATE TABLE ${escapedTempTable} AS (${selectSql})`;
    const dropSql = `DROP TABLE ${escapedOriginalTable}`;
    const renameSql = `RENAME TABLE ${escapedTempTable} TO ${escapedOriginalTable}`;

    try {
      await this.execSimpleQuery(`DROP TABLE IF EXISTS ${escapedTempTable}`);
      await this.execSimpleQuery(createSql);
      await this.execSimpleQuery(dropSql);
      await this.execSimpleQuery(renameSql);
    } catch (error) {
      try {
        await this.execSimpleQuery(`DROP TABLE IF EXISTS ${escapedTempTable}`);
      } catch (cleanupError) {
        if (this.opts && this.opts.debug) {
          Debug.sql('questdb', `cleanup failed for ${escapedTempTable}: ${cleanupError}`);
        }
      }
      throw error;
    }

    return [];
  })();

  return resolveWithCallback(promise, cb);
};

Driver.prototype.ping = function (cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = (async () => {
    await this.execSimpleQuery('SELECT 1');
  })();

  return resolveVoidWithCallback(promise, cb);
};

export default Driver;
