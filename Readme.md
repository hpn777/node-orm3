# ORM3 - Node.js Object-Relational Mapping

A powerful and flexible Object-Relational Mapping (ORM) library for Node.js that provides seamless integration with multiple database systems.

## Features

- **Multi-Database Support**: MySQL, MariaDB, PostgreSQL, Amazon Redshift, SQLite, and MongoDB
- **Model Definition**: Define models with validation, hooks, and custom methods
- **Associations**: Support for hasOne, hasMany, and extendsTo relationships
- **Advanced Querying**: Chainable query interface with filtering, sorting, and aggregation
- **Identity Caching**: Optional instance caching for improved performance
- **Promise Support**: Full async/await support with `.Async` postfix methods
- **Middleware Integration**: Express middleware for easy integration
- **Type Safety**: TypeScript definitions included

## Quick Start

### Installation

```sh
npm install orm
```

### Basic Example

```js
const orm = require("orm");

orm.connect("mysql://username:password@host/database", function (err, db) {
  if (err) throw err;

  const Person = db.define("person", {
    name      : String,
    surname   : String,
    age       : Number,
    male      : Boolean,
    continent : [ "Europe", "America", "Asia", "Africa", "Australia", "Antarctica" ],
    photo     : Buffer,
    data      : Object
  }, {
    methods: {
      fullName: function () {
        return this.name + ' ' + this.surname;
      }
    },
    validations: {
      age: orm.enforce.ranges.number(18, undefined, "under-age")
    }
  });

  db.sync(function(err) {
    if (err) throw err;

    Person.create({ id: 1, name: "John", surname: "Doe", age: 27 }, function(err) {
      if (err) throw err;

      Person.find({ surname: "Doe" }, function (err, people) {
        if (err) throw err;

        console.log("People found: %d", people.length);
        console.log("First person: %s, age %d", people[0].fullName(), people[0].age);
      });
    });
  });
});
```

## Requirements

- **Node.js**: 18.0.0 or higher
- **PostgreSQL**: 8.1+ (when using `pg` driver with Node.js >= 14)

> **Note:** If using Node.js >= 14 with PostgreSQL, ensure you use `pg` driver >= 8.1. Version 7 has known issues with timeouts.

## Test Script Reference

The following npm scripts are available for running tests:

| Script                  | Description                                 |
|-------------------------|---------------------------------------------|
| npm test                | Run all tests locally (SQLite)              |
| npm run test:sqlite     | Run tests with SQLite                       |
| npm run test:mysql      | Run tests with MySQL/MariaDB                |
| npm run test:postgres  | Run tests with PostgreSQL                   |
| npm run test:redshift  | Run tests with Amazon Redshift              |
| npm run test:mongodb   | Run tests with MongoDB                      |
| npm run test:docker:mysql     | Run MySQL/MariaDB tests in Docker      |
| npm run test:docker:postgres | Run PostgreSQL tests in Docker          |
| npm run test:docker:redshift | Run Redshift tests in Docker            |
| npm run test:docker:mongodb  | Run MongoDB tests in Docker             |

See `package.json` for the full list and details.

> **Note:** The legacy Makefile-based test orchestration has been removed. All test commands are now managed via npm scripts in `package.json`.

The following npm scripts are available for running tests:

| Script                  | Description                                 |
|-------------------------|---------------------------------------------|
| npm test                | Run all tests locally (SQLite)              |
| npm run test:sqlite     | Run tests with SQLite                       |
| npm run test:mysql      | Run tests with MySQL/MariaDB                |
| npm run test:postgres  | Run tests with PostgreSQL                   |
| npm run test:redshift  | Run tests with Amazon Redshift              |
| npm run test:mongodb   | Run tests with MongoDB                      |
| npm run test:docker:mysql     | Run MySQL/MariaDB tests in Docker      |
| npm run test:docker:postgres | Run PostgreSQL tests in Docker          |
| npm run test:docker:redshift | Run Redshift tests in Docker            |
| npm run test:docker:mongodb  | Run MongoDB tests in Docker             |

See `package.json` for the full list and details.

## Install

```sh
npm install orm
```

## Node.js Version Support

Supported: 4.0 +

If using Nodejs >= 14 & Postgres, you must use `pg` driver >= 8.1. v7 doesn't work correctly (tests time out).


## Running Tests

### Local Tests (SQLite)

To run the test suite locally using SQLite:

```sh
npm test
```

Or explicitly:

```sh
npm run test:sqlite
```

### DBMS-Specific Local Tests

You can run tests for a specific database locally (requires the DB running and accessible):

```sh
npm run test:docker:mysql      # MySQL/MariaDB (Docker)
npm run test:docker:postgres   # PostgreSQL (Docker)
npm run test:docker:redshift   # Amazon Redshift (Docker)
npm run test:docker:mongodb    # MongoDB (Docker)
```

### Full Integration Test Matrix with Docker

The integration suite expects MySQL, PostgreSQL/Redshift, SQLite, and MongoDB instances. To avoid installing them locally, you can launch disposable containers and execute tests inside an ephemeral Node runner:

```sh
npm run test:docker:mysql      # MySQL/MariaDB (Docker)
npm run test:docker:postgres   # PostgreSQL (Docker)
npm run test:docker:redshift   # Amazon Redshift (Docker)
npm run test:docker:mongodb    # MongoDB (Docker)
```

Each command will build dependencies, run the tests, and tear down containers when finished. If you want to inspect the databases after a run, keep them alive by setting `SKIP_DOCKER_CLEANUP=1`:

```sh
SKIP_DOCKER_CLEANUP=1 npm run test:docker:mysql
```

The Compose stack exposes the services on the default ports (`3306`, `5432`, `27017`) so you can connect with local tooling while the tests run.

## Database Support

ORM3 supports a wide range of databases:

- **MySQL** & MariaDB
- **PostgreSQL**
- **Amazon Redshift**
- **SQLite**
- **MongoDB** (beta)

## Core Capabilities

- **Model Management**: Create, sync, drop, bulk create models with validation
- **CRUD Operations**: Get, find, remove, count records with advanced filtering
- **Associations**: hasOne, hasMany, and extendsTo relationship support
- **Aggregation**: min, max, avg, sum, count functions with grouping
- **Validation**: Built-in and custom validations using [enforce](http://github.com/dresende/node-enforce)
- **Caching**: Identity pattern support for optimized data retrieval
- **Plugins**: Extend functionality with [MySQL FTS](http://dresende.github.io/node-orm-mysql-fts), [Pagination](http://dresende.github.io/node-orm-paging), [Transaction](http://dresende.github.io/node-orm-transaction), [Timestamps](http://github.com/SPARTAN563/node-orm-timestamps)

## Complete Example



-------

## Express Integration

If you're using Express, use the simple middleware to integrate ORM3 seamlessly:

```js
const express = require('express');
const orm = require('orm');
const app = express();

app.use(orm.express("mysql://username:password@host/database", {
	define: function (db, models, next) {
		models.person = db.define("person", { 
			name: String,
			surname: String 
		});
		next();
	}
}));

app.listen(80);

app.get("/", function (req, res) {
	// req.models is a reference to models defined above
	req.models.person.find(...);
});
```

You can call `orm.express` multiple times for multiple database connections. Models defined across connections will be joined together in `req.models`. **Use it before `app.use(app.router)`, preferably right after your assets public folder(s).**

### Example Application

See `examples/anontxt` for a complete Express-based application example.

## Models

A Model represents a table or collection in your database. Models support associations and behaviors for manipulating data.

### Defining Models

Models are defined with properties and optional configuration:

```js
const Person = db.define('person', {
	name    : String,
	age     : Number,
	email   : String
}, {
	// Configuration options
});
```

### Instance Methods

Instance methods are available on model records:

```js
const Person = db.define('person', {
	name    : String,
	surname : String
}, {
	methods: {
		fullName: function () {
			return this.name + ' ' + this.surname;
		}
	}
});

Person.get(4, function(err, person) {
	console.log(person.fullName());
});
```

### Model Methods

Define custom methods directly on the model:


```js
const Person = db.define('person', {
	name   : String,
	height : { type: 'integer' }
});

Person.tallerThan = function(height, callback) {
	this.find({ height: orm.gt(height) }, callback);
};

Person.tallerThan(192, function(err, tallPeople) { 
	console.log("Found", tallPeople.length, "people taller than 192cm");
});
```

## Advanced Configuration

ORM3 allows advanced configuration via model settings.

### Custom Primary Keys

By default, each Model gets an auto-incrementing `id` column. Define your own with `key: true`:

```js
const Person = db.define("person", {
	personId : { type: 'serial', key: true },
	name     : String
});

// Or globally:
db.settings.set("properties.primary_key", "UID");

const Pet = db.define("pet", {
	name : String
	// Will have UID as primary key
});
```

### Composite Keys

Define multiple columns as keys:

```js
const Person = db.define("person", {
	firstname : { type: 'text', key: true },
	lastname  : { type: 'text', key: true }
});
```

### Configuration Options

- **`identityCache`**: Enable caching with optional timeout (in seconds)
- **`autoSave`**: Automatically save instances after property changes
- **`autoFetch`**: Automatically fetch associations when loading instances
- **`autoFetchLimit`**: How many association levels to automatically fetch

Example:

```js
const Person = db.define("person", {
	name: String
}, {
	identityCache: true,  // Enable caching
	autoFetch: true,
	autoFetchLimit: 2
});
```

### Loading Models from Modules

Organize models in separate files:

```js
// main.js
db.load("./models", function (err) {
	const Person = db.models.person;
	const Pet    = db.models.pet;
});

// models/index.js
module.exports = function (db, cb) {
	db.define('person', { name: String });
	db.define('pet', { name: String });
	cb();
};
```

## Querying Data

### Get a Single Record

Use `Model.get()` to fetch a specific record by ID:

```js
Person.get(123, function (err, person) {
	// person with id = 123
});
```

### Find Records

Use `Model.find()` to query with conditions:

```js
Person.find({ name: "John", surname: "Doe" }, 3, function (err, people) {
	// First 3 people named John Doe
});
```

**Sorting:**

```js
Person.find({ surname: "Doe" }, "name", function (err, people) {
	// Sorted by name ascending
});

Person.find({ surname: "Doe" }, [ "name", "Z" ], function (err, people) {
	// Sorted by name descending ('Z' = DESC, 'A' = ASC)
});
```

**Pagination:**

```js
Person.find({ surname: "Doe" }, { offset: 2 }, function (err, people) {
	// Skip first 2, return the rest
});
```

### Count Records

```js
Person.count({ surname: "Doe" }, function (err, count) {
	console.log("Found %d Does", count);
});
```

### Check Existence

```js
Person.exists({ surname: "Doe" }, function (err, exists) {
	console.log(exists ? "Does exist" : "No Does found");
});
```

### Aggregation

Perform calculations on your data:

```js
Person.aggregate({ surname: "Doe" })
	.min("age")
	.max("age")
	.get(function (err, min, max) {
		console.log("Age range: %d - %d", min, max);
	});

// Group by age
Person.aggregate(["age"], { country: "USA" })
	.avg("salary")
	.groupBy("age")
	.get(function (err, stats) {
		// stats[i].age and stats[i].avg_salary
	});
```

**Aggregate functions:** `min`, `max`, `avg`, `sum`, `count`

### Comparison Operators

Use helper functions for advanced conditions:

```js
{ col1: orm.eq(123) }           // = 123 (default)
{ col1: orm.ne(123) }           // <> 123
{ col1: orm.gt(123) }           // > 123
{ col1: orm.gte(123) }          // >= 123
{ col1: orm.lt(123) }           // < 123
{ col1: orm.lte(123) }          // <= 123
{ col1: orm.between(100, 200) } // BETWEEN 100 AND 200
{ col1: orm.like("john%") }     // LIKE 'john%'
{ col1: orm.not_in([1, 4, 8]) } // NOT IN (1, 4, 8)
```

### Chaining Queries

Build complex queries with method chaining:

```js
Person.find({ surname: "Doe" })
	.limit(3)
	.offset(2)
	.only("name", "surname")
	.run(function (err, people) {
		// 3 people, skip first 2, return only name and surname
	});
```

**Select/Omit fields:**

```js
Person.find({ age: 18 })
	.omit("password", "ssn")  // Exclude fields
	.run(callback);

Person.find({ age: 18 })
	.only("name", "email")    // Include only these
	.run(callback);
```

**Advanced filtering:**

```js
Person.find({ age: 18 })
	.where("LOWER(surname) LIKE ?", ['dea%'])
	.all(callback);

// Multiple where clauses
Person.find()
	.where("age > ?", [18])
	.where("salary < ?", [50000])
	.run(callback);
```

**Ordering:**

```js
Person.find()
	.order('-name')           // Descending
	.run(callback);

Person.find()
	.orderRaw("?? DESC", ['age'])  // Raw SQL order
	.run(callback);
```

**Remove matching records:**

```js
Person.find({ surname: "Doe" })
	.remove(function (err) {
		// All Does deleted
	});
```

**Batch operations:**

```js
Person.find({ surname: "Doe" })
	.each(function (person) {
		person.surname = "Dean";
	})
	.save(function (err) {
		// All updated
	});
```

### Raw SQL Queries

```js
db.driver.execQuery("SELECT id, email FROM user", function (err, data) { 
	// Execute raw query
});

// With parameter substitution
db.driver.execQuery(
	"SELECT user.??, user.?? FROM user WHERE user.?? LIKE ? AND user.?? > ?",
	['id', 'name', 'name', 'john', 'id', 55],
	function (err, data) { ... }
);
```

## Creating and Updating Data

### Create Records

```js
Person.create([
	{
		name: "John",
		surname: "Doe",
		age: 25,
		male: true
	},
	{
		name: "Liza",
		surname: "Kollan",
		age: 19,
		male: false
	}
], function (err, items) {
	// items - array of inserted instances
});
```

### Update Records

```js
Person.get(1, function (err, person) {
	person.name = "Joe";
	person.save(function (err) {
		console.log("Updated!");
	});
});
```

**Update and save in one call:**

```js
Person.get(1, function (err, person) {
	person.save({ name: "Joe", surname: "Doe" }, function (err) {
		console.log("Updated!");
	});
});
```

### Delete Records

```js
Person.get(1, function (err, person) {
	person.remove(function (err) {
		console.log("Deleted!");
	});
});

// Or via chaining (without hooks)
Person.find({ surname: "Doe" }).remove(function (err) {
	// All Does deleted
});
```

## Identity Caching

Enable the identity pattern to ensure multiple queries return the same object instance (changes propagate across all references):

```js
const Person = db.define('person', {
	name: String
}, {
	identityCache: true  // or a timeout in seconds
});

// Globally:
db.settings.set('instance.identityCache', true);
```

**Note:** This feature won't cache unsaved instances and may cause issues with complex autofetch relationships.

## Associations

Associations define relationships between models.

### hasOne (Many-to-One)

A **many to one** relationship. An animal has one owner, but a person can own many animals.

```js
Animal.hasOne('owner', Person);
// Creates 'owner_id' in Animal table

animal.getOwner(callback);       // Get owner
animal.setOwner(person, callback); // Set owner
animal.hasOwner(callback);       // Check if owner exists
animal.removeOwner();            // Remove owner
```

**Reverse access:**

```js
Animal.hasOne('owner', Person, { reverse: 'pets' });

person.getPets(callback);        // Get all pets
person.setPets([pet1, pet2], callback);
```

**Chain find:**

```js
Animal.findByOwner({ /* options */ });
```

**Required association:**

```js
Animal.hasOne("owner", Person, { required: true });
```

### hasMany (Many-to-Many)

A many-to-many relationship with a join table.

```js
Patient.hasMany('doctors', Doctor, 
	{ why: String },              // Extra columns in join table
	{ key: true, reverse: 'patients' }
);

patient.getDoctors(callback);
patient.addDoctors([doc1, doc2], callback);
patient.setDoctors([doc1], callback);     // Replace
patient.removeDoctors([doc1], callback);
patient.hasDoctors([doc1], callback);
```

**Add with extra data:**

```js
patient.addDoctor(surgeon, { why: "appendix removal" }, callback);
```

**Chain find:**

```js
patient.getDoctors()
	.order("name")
	.offset(1)
	.run(callback);  // Returns ChainFind object
```

### extendsTo (Table Extension)

Split optional properties into separate tables:

```js
const Person = db.define("person", { name: String });
const PersonAddress = Person.extendsTo("address", {
	street: String,
	number: Number
});

person.getAddress(callback);
person.setAddress(address, callback);
```

A new table `person_address` is created with columns: `person_id`, `street`, `number`.

## Validation

### Built-in Validations

Use the [enforce](http://github.com/dresende/node-enforce) library:

```js
const Person = db.define('person', {
	name: String,
	age: Number,
	email: String
}, {
	validations: {
		age: orm.enforce.ranges.number(18, 65, "invalid-age"),
		email: orm.enforce.patterns.email("invalid-email")
	}
});

person.age = 16;
person.save(function (err) {
	// err.msg == "invalid-age"
});
```

### Custom Validations

```js
const Person = db.define('person', {
	email: String
}, {
	validations: {
		email: function (v) {
			if (!v.includes('@')) return "must have @";
		}
	}
});
```

## Hooks

Add custom logic during model lifecycle events:

```js
const Person = db.define('person', {
	name: String
}, {
	hooks: {
		beforeCreate: function () {
			console.log("Creating person");
		},
		afterCreate: function () {
			console.log("Person created");
		},
		beforeSave: function () {
			console.log("Saving");
		},
		afterSave: function () {
			console.log("Saved");
		}
	}
});
```

**Async hooks with Promises:**

```js
hooks: {
	beforeSave: function () {
		return new Promise(function(resolve, reject) {
			doAsyncStuff().then(resolve);
		});
	}
}
```

## Promise Support

All callback-based methods have an `.Async` postfix version that returns a Promise:

```js
orm.connectAsync("mysql://...")
	.then(db => Person.getAsync(1))
	.then(person => console.log(person.name))
	.catch(err => console.error(err));

// Chain find also supports async
Person.find({ age: 18 })
	.where("salary > ?", [50000])
	.allAsync()
	.then(people => console.log(people))
	.catch(err => console.error(err));

// Aggregation
Person.aggregate({ surname: "Doe" })
	.min("age")
	.max("age")
	.getAsync()
	.then(([min, max]) => console.log(`Age: ${min} - ${max}`));
```

## Custom Adapters

Add custom database adapters to ORM3:

```js
require('orm').addAdapter('cassandra', CassandraAdapter);
```

For creating adapters, see [the adapter documentation](./Adapters.md).

## Plugins & Extensions

Enhance ORM3 with official plugins:

- **[MySQL FTS](http://dresende.github.io/node-orm-mysql-fts)** - Full-text search for MySQL
- **[Pagination](http://dresende.github.io/node-orm-paging)** - Paginate results easily
- **[Transactions](http://dresende.github.io/node-orm-transaction)** - Transaction support
- **[Timestamps](http://github.com/SPARTAN563/node-orm-timestamps)** - Auto-manage created/updated fields

## Contributing

Contributions are welcome! Please see [Contributing.md](Contributing.md) for guidelines.

## License

MIT - See [License](License) file for details.

## Resources

- **GitHub**: [node-orm3](https://github.com/dresende/node-orm3)
- **Issues**: [Report bugs or request features](https://github.com/dresende/node-orm3/issues)
- **Examples**: Check `examples/` directory for sample applications
```

