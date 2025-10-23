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

