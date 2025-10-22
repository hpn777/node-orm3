# ORM3

A batteries-included Object-Relational Mapper for Node.js with first-class async/await support, rich associations, and solid TypeScript types.

- **Why ORM3?** Multi-database support (MySQL/MariaDB, PostgreSQL, Amazon Redshift, SQLite), composable query chains, hookable lifecycle events, and identities cached out of the box.
- **API style:** Promise-only. Every operation can be `await`ed and plays nicely with modern JavaScript.
- **Works great with TypeScript:** Ship-shape `.d.ts` files, generics for models and instances, and expressive helper utilities.

---

## Table of contents

1. [Overview](#overview)
2. [Supported databases & requirements](#supported-databases--requirements)
3. [Installation](#installation)
4. [Quick start](#quick-start)
5. [Core concepts](#core-concepts)
   - [Models & properties](#models--properties)
   - [Query chains](#query-chains)
   - [Associations](#associations)
   - [Hooks & validations](#hooks--validations)
   - [Serial runners](#serial-runners)
6. [Configuration & settings](#configuration--settings)
7. [Express integration](#express-integration)
8. [TypeScript usage](#typescript-usage)
9. [Testing & quality gates](#testing--quality-gates)
10. [Advanced topics](#advanced-topics)
11. [Contributing](#contributing)
12. [License](#license)

---

## Overview

ORM3 lets you model relational data using plain JavaScript/TypeScript classes while keeping full control over SQL. Define models, compose queries with fluent builders, hook into lifecycle events, and work with associations without sacrificing performance or transparency.

Key capabilities:

- **Multiple drivers:** MySQL/MariaDB, PostgreSQL, Amazon Redshift, and SQLite.
- **Composable queries:** Chain filters, projections, eager-loading, aggregates, and raw SQL fragments.
- **Associations:** `hasOne`, `hasMany`, `extendsTo`, and polymorphic extensions.
- **Validation & hooks:** Built in `enforce` validators plus per-model `beforeCreate`, `afterSave`, etc.
- **Identity caching:** Opt-in caching ensures repeated queries resolve to the same in-memory object graph.
- **Promise everywhere:** No callbacks. Everything returns a `Promise`, making async flows deterministic.

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
| `npm run build` | Compile TypeScript to `dist/`. Automatically executed on install/publish. |
| `npm test` | Run the SQLite-backed test suite locally. |
| `npm run test:<driver>` | Run the suite against `sqlite`, `mysql`, `postgres`, or `redshift` (database must be reachable). |
| `npm run test:docker:<driver>` | Spin up Docker containers, install dependencies, run the tests, and tear everything down. |
| `npm run test:async-only` | Lightweight async API smoke test. |

Docker-based runs accept `SKIP_DOCKER_CLEANUP=1` to keep containers around for debugging.

Integration suites read configuration from `test/config.js`. Check that file if you want to point tests at non-default hosts or credentials.

---

## Advanced topics

- **Identity maps:** Keep instance caches scoped per-connection or per-model for consistent object graphs.
- **Lazy loading:** Use `Model.one().eager()` or `instance.fetch()` to retrieve associations on demand.
- **Custom drivers/adapters:** Implement the DDL and DML interfaces under `src/Drivers` and register them via `orm.addAdapter()`.
- **Plugins:** Reuse community plugins (pagination, timestamping, FTS) or craft your own by hooking into `db.use()`.
- **Raw SQL:** Drop down to `db.driver.execQuery()` when you need handcrafted statements without leaving the ORM ecosystem.

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

