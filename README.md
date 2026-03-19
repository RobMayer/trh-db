# trh-db

A pure TypeScript in-memory data structure library with typed, lens-based query pipelines. Provides three database classes — `DocumentDB`, `TreeDB`, and `GraphDB` — each with CRUD operations, chainable query pipelines, index acceleration, and set operations.

No runtime dependencies. No external database engine. All data lives in memory with optional persistence via codecs.

## Installation

```
pnpm add trh-db
```

## Quick Start

### DocumentDB

A keyed collection of documents.

```ts
import { DocumentDB } from "trh-db";
import { MemoryCodec } from "trh-db/codec";

type User = { name: string; age: number; role: string };
const db = new DocumentDB<User>(new MemoryCodec());

// Insert — IDs are auto-generated
const alice = await db.insert({ name: "Alice", age: 30, role: "admin" });
const [bob, charlie] = await db.insert([
    { name: "Bob", age: 25, role: "editor" },
    { name: "Charlie", age: 35, role: "admin" },
]);

// Query
const admins = await db.where($ => [$("role"), "=", "admin"]).get();
const youngest = await db.all().sort($ => $("age"), "asc").first().get();

// Update
await db.update(alice.id, prev => ({ ...prev, age: prev.age + 1 }));

// Pipeline update
await db.where($ => [$("role"), "=", "editor"]).update(prev => ({ ...prev, role: "viewer" }));
```

### TreeDB

A parent/child hierarchy.

```ts
import { TreeDB } from "trh-db";
import { MemoryCodec } from "trh-db/codec";

type Department = { name: string; budget: number };
const db = new TreeDB<Department>(new MemoryCodec());

// Build a tree
const company = await db.add({ name: "Acme Corp", budget: 1000000 }, null);
const engineering = await db.add({ name: "Engineering", budget: 500000 }, company.id);
const design = await db.add({ name: "Design", budget: 200000 }, company.id);
const frontend = await db.add({ name: "Frontend", budget: 150000 }, engineering.id);

// Traverse
const allDFS = await db.deep().get();                          // all nodes, depth-first
const children = await db.children(company.id).get();          // engineering, design
const ancestors = await db.ancestors(frontend.id).get();       // engineering, company

// Filter with tree metadata
const deepNodes = await db.where($ => [$.DEPTH, ">", 1]).get();

// Structural mutations
await db.move(frontend.id, design.id);       // reparent
await db.prune(engineering.id);              // remove subtree
await db.splice(design.id);                  // remove node, reparent children up
```

### GraphDB

A directed graph with nodes and links.

```ts
import { GraphDB } from "trh-db";
import { MemoryCodec } from "trh-db/codec";

type Person = { name: string; age: number };
type Relationship = { type: string; since: number };
const db = new GraphDB<Person, Relationship>(new MemoryCodec());

// Build a graph
const [alice, bob, charlie] = await db.insert([
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
    { name: "Charlie", age: 35 },
]);
await db.connect(alice.id, bob.id, { type: "friend", since: 2020 });
await db.connect(bob.id, charlie.id, { type: "colleague", since: 2022 });
await db.connect(alice.id, charlie.id, { type: "friend", since: 2019 });

// Single-hop traversal
const aliceFriends = await db.node(alice.id).via($ => [$("type"), "=", "friend"]).get();

// Mode switching: nodes -> links -> nodes
const targets = await db.node(alice.id).out().where($ => [$("type"), "=", "friend"]).to().get();

// Path finding
const paths = await db.node(alice.id).pathTo(charlie.id).get();
const shortest = await db.node(alice.id).pathTo(charlie.id).shortest().get();

// Path filtering
const friendPaths = await db.node(alice.id).pathTo(charlie.id)
    .where($ => [$.links().where(_ => [_("type"), "=", "friend"]).size(), "=", $.LENGTH])
    .get();
```

## Core Concepts

### Items and IDs

Every item in every DB has a structure like `{ id: string; type: string; data: D }`. IDs are auto-generated UUIDs. User data lives in the `.data` field. Structural metadata (parent, children, in, out, from, to) sits alongside.

All mutation operations (insert, update, remove) return the affected items.

### Pipelines

All three DBs use chainable query pipelines. A pipeline starts with a **chain starter**, passes through **chaining operations**, and terminates with a **terminal**.

```ts
db.where($ => [$("age"), ">", 18])    // chain starter
    .sort($ => $("name"), "asc")       // chaining op
    .slice(0, 10)                      // chaining op
    .get();                            // terminal
```

Pipelines are lazy — nothing executes until a terminal is called.

### Predicates

Predicates use tuple syntax: `[subject, operator, operand]`.

```ts
[$("age"), ">", 18]              // comparison
[$("name"), "%", "Ali"]          // string contains
[$("roles"), "#", "admin"]       // array/Set has
[$("age"), "><", 18, 65]         // range (exclusive)
[$("active"), "?"]               // truthiness
[$.ID, "=", someId]              // meta field access
```

See [docs/predicates.md](docs/predicates.md) for the full operator reference.

### Set Operations

All DBs support `intersection`, `union`, and `exclusion` across pipelines. These can be nested.

```ts
const result = await db.union(
    db.where($ => [$("age"), "<", 18]),
    db.intersection(
        db.where($ => [$("role"), "=", "admin"]),
        db.where($ => [$("active"), "?"]),
    ),
).get();
```

### Codecs

Codecs handle persistence. Three built-in:

- **`MemoryCodec`** — no persistence, pure in-memory
- **`JsonCodec`** — reads/writes a JSON file
- **`TrhCodec`** — append-only ledger format with sigil-aware serialization (NaN, BigInt, Date, RegExp, Set, Map, URL)

## Documentation

- [DocumentDB](docs/document-db.md) — keyed document collection
- [TreeDB](docs/tree-db.md) — parent/child hierarchy
- [GraphDB](docs/graph-db.md) — directed graph with path finding
- [Predicates](docs/predicates.md) — operator reference
- [Custom Accessors](docs/custom-accessors.md) — LensNav protocol and symbol protocols
- [Codecs](docs/codecs.md) — persistence layer
