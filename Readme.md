# ORM3

A batteries-included Object-Relational Mapper for Node.js with first-class async/await support, rich associations, and solid TypeScript types.

- **Why ORM3?** Multi-database support (MySQL/MariaDB, PostgreSQL, Amazon Redshift, SQLite), composable query chains, hookable lifecycle events, and identities cached out of the box.
- **API style:** Promise-only. Every operation can be `await`ed and plays nicely with modern JavaScript.
- **Works great with TypeScript:** Ship-shape `.d.ts` files, generics for models and instances, and expressive helper utilities.

---

## Table of contents

1. [Overview](#overview)
2. [Feature highlights](#feature-highlights)
3. [Supported databases & requirements](#supported-databases--requirements)
4. [Installation](#installation)
5. [Quick start](#quick-start)
6. [Core concepts](#core-concepts)
  - [Models & properties](#models--properties)
  - [Query chains](#query-chains)
  - [Associations](#associations)
  - [Hooks & validations](#hooks--validations)
  - [Serial runners](#serial-runners)
7. [Configuration & settings](#configuration--settings)
8. [Express integration](#express-integration)
9. [TypeScript usage](#typescript-usage)
10. [Testing & quality gates](#testing--quality-gates)
11. [Development workflow & scripts](#development-workflow--scripts)
12. [Migration guide](#migration-guide)
13. [Troubleshooting & FAQ](#troubleshooting--faq)
14. [Advanced topics](#advanced-topics)
  - [Schema metadata inspection](#schema-metadata-inspection)
15. [Community & support](#community--support)
16. [Contributing](#contributing)
17. [License](#license)

---

## Overview

ORM3 lets you model relational data using plain JavaScript or TypeScript while keeping full control over SQL. Define models, compose fluent queries, hook into lifecycle events, and work with associations without giving up performance or transparency. The library embraces async/await from top to bottom—if you can `await` it, ORM3 supports it.

## Feature highlights

- **Promise-only API:** Every public method resolves a `Promise`, making async code deterministic, testable, and easy to compose—no callback shims or `Async`-suffixed helpers required.
- **Typed from the core:** Rich `.d.ts` files expose generics for models, instances, query chains, and helper utilities so your editor can follow along.
- **Cross-database drivers:** Connect to MySQL/MariaDB, PostgreSQL, Amazon Redshift, or SQLite with a consistent API and per-driver tuning hooks.
- **Powerful query builder:** Chain filters, ordering, eager-loading, aggregates, and raw SQL snippets without sacrificing readability.
- **Associations that stay out of your way:** Mix `hasOne`, `hasMany`, and `extendsTo` relationships, including polymorphic extensions and cascading rules.
- **Lifecycle hooks & validation:** Ship with `enforce` validators, before/after hooks, and lazy-loading helpers for modeling real-world workflows.
- **Identity caching & lazy load:** Opt-in identity maps keep graph consistency, and lazy fetchers let you defer expensive joins until you need them.
- **Metadata-driven model scaffolding:** Introspect existing tables and call `db.defineFromSchema()` (or `db.defineAllFromSchema()` for whole schemas) to generate typed models without hand-writing property maps.
- **Production-ready tooling:** Express middleware, Docker-backed integration suites, and ergonomic settings make it straightforward to embed in real apps.

---

## Supported databases & requirements

| Database           | Driver package        | Notes |
| ------------------ | --------------------- | ----- |
| MySQL / MariaDB    | `mysql@~2.18`         | Supports SSL and connection pools. |
| PostgreSQL         | `pg@~8`               | Requires Node.js ≥ 18 and `pg` ≥ 8.1. |
| Amazon Redshift    | `pg@~8`               | Uses the PostgreSQL driver with Redshift tweaks. |
| SQLite             | `sqlite3@~5`          | Bundled with dev dependencies for quick local runs. |

Runtime requirements:

- **Node.js:** 18.0.0 or higher (LTS recommended)
- **TypeScript:** 5.0+ for best typings (already bundled for development)
- Ensure your database server is reachable from your application / Docker network when running integration suites.

---

## Installation

Grab the package from npm (the module name is `orm3`).

```bash
npm install orm3
# or
pnpm add orm3
# or
yarn add orm3
```

The package ships precompiled JavaScript under `dist/` and type declarations under `dist/*.d.ts`.

---

## Quick start

Connect to a database, define a model, and start querying—all with async/await.

```ts
import { connect, Instance } from 'orm3';

interface Person {
  id: number;
  name: string;
  surname: string;
  age: number;
  createdAt: Date;
}

async function bootstrap() {
  const db = await connect('postgres://user:pass@localhost:5432/people');

  const PersonModel = db.define<Person>('person', {
    name: String,
    surname: String,
    age: Number,
    createdAt: { type: 'date', time: true, mapsTo: 'created_at' }
  }, {
    hooks: {
      beforeCreate: async (person) => {
        person.createdAt = new Date();
      }
    }
  });

  await db.sync();

  const john = await PersonModel.create({
    name: 'John',
    surname: 'Doe',
    age: 27
  });

  const does = await PersonModel.find({ surname: 'Doe' }).order('-age').all();
  console.log(`Found ${does.length} Doe(s)`);

  await db.close();
}

bootstrap().catch(console.error);
```

CommonJS usage works the same way:

```js
const orm = require('orm3');

(async () => {
  const db = await orm.connect('sqlite:///tmp/my.db');
  const Pet = db.define('pet', { name: String });
  await db.sync();
  await Pet.create({ name: 'Fluffy' });
})();
```

---

## Core concepts

### Models & properties

Models map to database tables (or views). Property definitions can be plain constructors (`String`, `Number`, `Boolean`, `Date`, `Buffer`) or detailed objects describing type, key behaviour, default values, validations, and custom column names.

```ts
const Product = db.define<{ id: number; sku: string; price: number }>('product', {
  id: { type: 'serial', key: true },
  sku: { type: 'text', required: true, unique: true },
  price: { type: 'number', rational: true, required: true }
}, {
  identityCache: true,
  timestamp: true // adds createdAt / updatedAt
});
```

Every model exposes methods such as `create`, `get`, `find`, `count`, `aggregate`, `remove`, and `drop`. Instances returned by these methods are strongly typed and come with `save`, `remove`, `validate`, and association helpers.

### Query chains

Query methods return a chainable cursor (`ChainInstance`) that can be awaited directly or refined step-by-step:

```ts
const recentOrders = await Order
  .find({ status: 'completed' })
  .limit(25)
  .offset(0)
  .order('-completedAt')
  .only('id', 'total', 'completedAt')
  .eager('customer')
  .all();
```

Need aggregates or raw snippets? Combine the fluent builder with helpers such as `where`, `orderRaw`, `groupBy`, and `aggregate`.

### Associations

Link your models using `hasOne`, `hasMany`, or `extendsTo`:

```ts
const Person = db.define('person', { name: String });
const Pet = db.define('pet', { name: String });

Person.hasMany('pets', Pet, { reverse: 'owner', autoFetch: true });

const owner = await Person.create({ name: 'Ada' });
await owner.addPets([{ name: 'Tobi' }]);

const withPets = await Person.find({ name: 'Ada' }).eager('pets').first();
```

Associations automatically create accessor methods such as `person.getPets()`, `pet.setOwner()`, or `person.removePets()`.

### Hooks & validations

Use hooks for lifecycle orchestration and `enforce`-powered validators to protect data integrity.

```ts
const orm = require('orm3');
const { enforce } = orm;

const Account = db.define('account', {
  email: { type: 'text', required: true },
  passwordHash: { type: 'text', mapsTo: 'password_hash' }
}, {
  hooks: {
    beforeCreate: async (account) => {
      account.passwordHash = await hash(account.passwordHash);
    }
  },
  validations: {
    email: enforce.ranges.length(5, 255)
  }
});
```

### Serial runners

Need to execute several query chains sequentially and gather their results? Use `db.serial()`:

```ts
const { get } = db.serial(
  Person.find({ active: true }),
  Order.find({ status: 'pending' })
);

const [people, pendingOrders] = await get();
```

`serial()` accepts any number of chain runners (objects exposing `run()`), executes them one-by-one, and returns a `Promise` resolving to an array of result sets. For legacy compatibility you can still provide a Node-style callback.

---

## Configuration & settings

Tune global behaviour through the shared settings container or per-model options.

```ts
// Global defaults
orm.settings.set('properties.primary_key', 'id');
orm.settings.set('instance.cache', true);

// Per-connection tweaks
const db = await connect(connectionString, {
  pool: true,
  debug: process.env.ORM_DEBUG === '1'
});

db.settings.set('autoFetchLimit', 2);
```

Useful flags:

- `identityCache` – caches retrieved instances per primary key.
- `autoFetch` / `autoFetchLimit` – automatically pull in associations.
- `cascadeRemove` – cascade deletes to child records.
- `hooks` – register `beforeCreate`, `afterSave`, etc.
- `timestamps` – automatically create `createdAt` / `updatedAt` columns.

You can also load multiple model files at once using `db.load()`—ideal for modular project layouts.

---

## Express integration

```ts
import express from 'express';
import * as orm from 'orm3';

const app = express();

app.use(orm.express('mysql://user:pass@localhost/db', {
  define: (db, models, next) => {
    models.person = db.define('person', { name: String });
    next();
  }
}));

app.get('/', async (req, res) => {
  const people = await req.models.person.find().limit(10).all();
  res.json(people);
});

app.listen(3000);
```

Mount the middleware before your routes. Every request receives a `req.db` connection and a `req.models` namespace containing all defined models.

---

## TypeScript usage

The published package exports rich typings for connections, models, and chain instances. You can extend them with your own interfaces for end-to-end safety.

```ts
import { connect, Model, Instance } from 'orm3';

interface Person {
  id: number;
  name: string;
  age: number;
}

const db = await connect('sqlite:///tmp/dev.db');
const PersonModel: Model<Person> = db.define('person', {
  id: { type: 'serial', key: true },
  name: String,
  age: Number
});

const saved: Instance<Person> = await PersonModel.create({ name: 'Ana', age: 32 });
```

Type helpers such as `ChainFind<T>`, `Instance<T>`, and `OrmDatabase<TModels>` are available from `orm3/dist/types` if you need finer control.

---

## Testing & quality gates

All scripts live in `package.json` and rely on Node 18+.

| Command | Description |
| ------- | ----------- |
| `npm run build` | Compile TypeScript to `dist/`. Automatically invoked on install/publish via `prepare`. |
| `npm run build:watch` | Incremental TypeScript rebuilds while developing. |
| `npm test` / `npm run test:sqlite` | Run the default SQLite-backed suite locally (no external DB required). |
| `npm run test:<driver>` | Target a specific driver (`mysql`, `postgres`, `redshift`) against databases you have running locally or in CI. |
| `npm run test:docker:<driver>` | Provision containers via Docker Compose, install deps, run tests, and clean up. Handy for hermetic integration runs. |
| `npm run test:full` | Execute the entire integration harness once you have all backing services available. |

Docker-based runs accept `SKIP_DOCKER_CLEANUP=1` to keep containers around for debugging.

Integration suites read configuration from `test/config.js`. Check that file if you want to point tests at non-default hosts or credentials.

Environment variables worth knowing:

- `ORM_PROTOCOL` – set to `mysql`, `postgres`, `redshift`, or `sqlite` to pick the driver for local runs (the scripts above set this automatically).
- `DEBUG=orm` – enable verbose SQL logging when troubleshooting.
- `ORM_DEBUG=1` – flip on internal logging for fine-grained diagnostics.

---

## Development workflow & scripts

1. **Install dependencies:** `npm install` bootstraps TypeScript, test harnesses, and database client libraries.
2. **Iterate with automatic builds:** run `npm run build:watch` in a background terminal while you develop. It keeps `dist/` synchronized with your TypeScript edits.
3. **Exercise targeted drivers:** during feature work, reach for `npm run test:<driver>` to validate a specific adapter before running the heavier Docker suites.
4. **Use Docker for parity:** `npm run test:docker:<driver>` mirrors CI by provisioning clean containers. Pair it with `SKIP_DOCKER_CLEANUP=1` when you need to inspect failing services.
5. **Keep containers tidy:** `docker compose -f docker-compose.test.yml down` tears everything down if you stop the run manually.
6. **Watch emitted typings:** check the generated files under `dist/*.d.ts` when you touch public APIs to ensure consumers get the right contracts.

---

## Migration guide

Upgrading from older releases (or from the original `node-orm2`) mainly involves adopting the promise-based API and modern tooling. Recommended steps:

1. **Require Node.js 18+:** the runtime, driver clients, and published artifacts assume modern Node features.
2. **Replace callbacks with `await`:** every public method now returns a promise. Drop callback arguments and wrap usages in `try/catch` blocks instead.
3. **Rename Async helpers:** accessor aliases such as `getFooAsync`, `setBarAsync`, or driver helpers like `connectAsync` have been removed. Use their base counterparts (`getFoo`, `setBar`, `connect`) which now return promises.
4. **Update custom plugins:** plugin hooks should return promises. Any `next(err)` patterns can become `throw err` or resolved values.
5. **Adjust tests:** Sinon stubs should call `.resolves()` / `.rejects()` instead of invoking callback arguments manually (see `test/integration/db.js` for examples).
6. **Rebuild typings:** regenerate or import the new `Instance<T>`, `Model<T>`, and `ChainFind<T>` helpers to capture type safety end-to-end.

Still running legacy code? Wrap the new promise APIs with small adapters while you migrate, or hold the previous major version under an npm alias until you can refactor.

---

## Troubleshooting & FAQ

- **`TypeError: cb is not a function` in tests** – make sure your stubs or plugins return promises rather than invoking callbacks. The core now expects async/await semantics everywhere.
- **Docker-based suites cannot reach the database** – confirm the `orm3-test-net` network exists (`docker network ls`) or set it to `external: true` if you manage it yourself. You can also export `DB_HOST=host.docker.internal` for local services.
- **`ECONNREFUSED` during local runs** – double-check `test/config.js`, ensure the server is running, and verify firewall rules. For Postgres, `pg_hba.conf` often needs host-based entries.
- **Strange timezone behaviour** – set `db.settings.set('timezone', 'utc')` (or your preferred zone) and ensure your driver client is compiled with timezone support (especially for MySQL).
- **Need verbose logging** – run with `DEBUG=orm npm run test:<driver>` to inspect generated SQL and driver-level chatter.

Have something else? Open an issue with reproduction details or hop into discussions—links below.

---

## Advanced topics

- **Identity maps:** Keep instance caches scoped per-connection or per-model for consistent object graphs.
- **Lazy loading:** Use `Model.one().eager()` or `instance.fetch()` to retrieve associations on demand.
- **Custom drivers/adapters:** Implement the DDL and DML interfaces under `src/Drivers` and register them via `orm.addAdapter()`.
- **Plugins:** Reuse community plugins (pagination, timestamping, FTS) or craft your own by hooking into `db.use()`.
- **Raw SQL:** Drop down to `db.driver.execQuery()` when you need handcrafted statements without leaving the ORM ecosystem.
- **Embedded DDL synchronizer:** The legacy `sql-ddl-sync` package now lives alongside the drivers at `src/Drivers/DDL/sync` (TypeScript), making it easier to tweak dialect rules or add datastore-specific DDL helpers without vendoring external code.
- **Typed SQL query builder:** The venerable `sql-query` library is now embedded and typed under `dist/SQLQuery`. Import it with `import Query from 'orm3/dist/SQLQuery'` (or `const { Query } = require('orm3/dist/SQLQuery')`) to craft standalone statements, use the comparator helpers, or plug the builders (`select()`, `insert()`, etc.) into custom tooling without pulling extra dependencies.
- **Schema metadata inspection:** Use `db.getMetadata()` to enumerate tables, columns, indexes, and constraints through the existing driver without spinning up parallel connections.

### Schema metadata inspection

Need to peek at live schema details? The new metadata inspector wraps each SQL dialect's system catalogs and ships alongside the drivers.

```ts
const db = await orm.connect('postgres://user:pass@localhost:5432/app');
const metadata = db.getMetadata({ schema: 'public' });

const tables = await metadata.getTables();
const users = await metadata.getColumns('users');
const indexes = await metadata.getIndexes('users');

console.log(`Running on ${await metadata.getVersion()}`);
```

Inspectors reuse the current connection pool, respect driver-specific configuration (database/catalog or schema), and expose consistent `Table`, `Column`, and `DatabaseIndex` models across MySQL, PostgreSQL, and SQLite.

#### Bootstrap models from live schema

Need an ORM model for an existing table? Let metadata do the heavy lifting:

```ts
const Inventory = await db.defineFromSchema('inventory_items', {
  name: 'Inventory',              // optional model name override
  namingStrategy: 'camelCase',    // auto-convert column names to camelCase properties
  propertyOverrides: {
    is_active: { defaultValue: false }, // override by column name
    sku: { unique: true },              // or by generated property name (same here)
  },
  modelOptions: {
    autoFetch: true,
  }
});

const active = await Inventory.find({ isActive: true }).count();
```

`defineFromSchema()` inspects the table, maps column metadata to ORM properties, and automatically sets primary keys (including composites). Column names are preserved by default; switch to `camelCase` conversion or provide explicit property overrides to tweak types, defaults, or required flags. If your table lacks key metadata, pass `modelOptions.id` to identify the primary key columns manually.

Behind the scenes the helper uses the same metadata inspector exposed above, so there are no extra connections to manage. You can still call `metadata.close()` when you're done, and you retain full control over associations or additional properties by editing the returned model definition.

Looking to sweep an entire schema? Reach for `defineAllFromSchema()` and share defaults across every table:

```ts
const models = await db.defineAllFromSchema({
  tables: (name) => name.startsWith('sales_'),
  modelNamingStrategy: 'pascalCase',
  defineOptions: {
    namingStrategy: 'camelCase'
  },
  tableOptions: {
    sales_orders: {
      propertyOverrides: { total_cents: { type: 'number', rational: false } }
    },
    sales_legacy: { skip: true }
  }
});

const Orders = models.SalesOrders;
const count = await Orders.count({ status: 'pending' });
```

The bulk helper filters tables (by name, regex, or predicate), applies shared naming rules, and accepts per-table overrides—handy when seeding repositories or documenting large databases.

---

## Community & support

- **Issues & feature requests:** [github.com/dresende/node-orm3/issues](https://github.com/dresende/node-orm3/issues)
- **Discussions & Q&A:** Start a thread on GitHub Discussions or check the historical [Gitter room](https://gitter.im/dresende/node-orm2) for tips from long-time users.
- **Security reports:** Please email the maintainers (see `package.json` author) instead of opening a public issue.
- **Release notes:** Tagged releases on GitHub capture changelog highlights and breaking migrations.

If you build something neat—plugins, adapters, example apps—let us know so we can share it with the community.

---

## Contributing

Pull requests are welcome! Please read [`Contributing.md`](./Contributing.md) for environment setup, coding standards, and release guidelines. The short version:

1. `npm install`
2. `npm run build`
3. Run the relevant `npm run test:*` suites (Docker helpers are available)
4. Open a PR with a clear description and test evidence

Bug reports and feature ideas are tracked in [GitHub issues](https://github.com/dresende/node-orm3/issues).

---

## License

MIT © 2025 the ORM3 maintainers.

