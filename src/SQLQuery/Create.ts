import type { Dialect } from './types';

export interface CreateQueryBuilder {
  table: (tableName: string) => CreateQueryBuilder;
  field: (name: string, type: string) => CreateQueryBuilder;
  fields: (fields?: Record<string, string>) => Record<string, string> | CreateQueryBuilder;
  build: () => string;
}

function tmpl(template: string, args: Record<string, string>): string {
  const { hasOwnProperty } = Object.prototype;
  let result = template;

  for (const key in args) {
    if (!hasOwnProperty.call(args, key)) {
      continue;
    }

    const token = `{{${key}}}`;
    result = result.split(token).join(args[key]);
  }

  return result;
}

function buildFieldsList(dialect: Dialect, structure: Record<string, string>): string {
  if (!structure) {
    return '';
  }

  const tpl = "'{{NAME}}' {{TYPE}}";
  const fields: string[] = [];
  const { hasOwnProperty } = Object.prototype;
  const dataTypes = dialect.DataTypes || {};

  for (const field in structure) {
    if (!hasOwnProperty.call(structure, field)) {
      continue;
    }

    const dataType = dataTypes[structure[field]];
    const resolvedType = typeof dataType === 'string' ? dataType : structure[field];
    fields.push(
      tmpl(tpl, {
        NAME: field,
        TYPE: resolvedType
      })
    );
  }

  return fields.join(',');
}

export function CreateQuery(dialect: Dialect): CreateQueryBuilder {
  let tableName: string | null = null;
  let structure: Record<string, string> = {};

  return {
    table(name: string): CreateQueryBuilder {
      tableName = name;
      return this;
    },

    field(name: string, type: string): CreateQueryBuilder {
      structure[name] = type;
      return this;
    },

    fields(fields?: Record<string, string>): Record<string, string> | CreateQueryBuilder {
      if (!fields) {
        return structure;
      }

      structure = fields;
      return this;
    },

    build(): string {
      if (!tableName) {
        return '';
      }

      const template = "CREATE TABLE '{{TABLE_NAME}}'({{FIELDS_LIST}})";
      const fieldsList = buildFieldsList(dialect, structure);

      return tmpl(template, {
        TABLE_NAME: tableName,
        FIELDS_LIST: fieldsList
      });
    }
  };
}
