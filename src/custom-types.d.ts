declare module 'path-is-absolute' {
  function pathIsAbsolute(path: string): boolean;
  export = pathIsAbsolute;
}

declare module 'hat' {
  function hat(bits?: number, base?: number): string;
  export = hat;
}

declare module 'enforce' {
  const enforce: any;
  export = enforce;
}

declare module 'sql-query' {
  interface Query {
    create(): any;
    select(): any;
    insert(): any;
    update(): any;
    remove(): any;
  }
  
  function sqlQuery(dialect?: string): Query;
  export = sqlQuery;
}

declare module 'sql-ddl-sync' {
  class Sync {
    constructor(options: any);
    defineCollection(name: string, properties: any): void;
    sync(callback: (err: Error | null) => void): void;
    drop(callback: (err: Error | null) => void): void;
  }
  
  export = Sync;
}
