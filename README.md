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

type User = { name: string; age: number; role: string; active: boolean };
const db = new DocumentDB<User>(new MemoryCodec());

// Insert — IDs are auto-generated
const alice = await db.insert({ name: "Alice", age: 30, role: "admin", active: true });
const [bob, charlie] = await db.insert([
    { name: "Bob", age: 25, role: "editor", active: true },
    { name: "Charlie", age: 35, role: "admin", active: false },
]);

// Chain starters are just the entry point — the pipeline is where queries live
const page = await db
    .where(($) => [$("role"), "=", "admin"])
    .where(($) => [$("active"), "?"])
    .sort(($) => $("age"), "asc")
    .paginate(1, 10)
    .get();

// Write terminals work on any pipeline result
await db.where(($) => [$("active"), "?"]).update((prev) => ({ ...prev, age: prev.age + 1 }));
```

### TreeDB

A parent/child hierarchy.

```ts
import { TreeDB } from "trh-db";
import { MemoryCodec } from "trh-db/codec";

type Task = { name: string; status: string; priority: number };
const db = new TreeDB<Task>(new MemoryCodec());

// Build a tree
const project = await db.add({ name: "Project", status: "active", priority: 1 }, null);
const phase1 = await db.add({ name: "Phase 1", status: "active", priority: 1 }, project.id);
const phase2 = await db.add({ name: "Phase 2", status: "pending", priority: 2 }, project.id);
const task = await db.add({ name: "Design", status: "active", priority: 1 }, phase1.id);

// Chain starters are entry points — traversal and filtering chain from them
const urgent = await db
    .select(phase1.id)
    .children()
    .where(($) => [$("status"), "=", "active"])
    .sort(($) => $("priority"), "asc")
    .get();

// Traversal chaining — hop across the tree mid-pipeline
const blockedDescendants = await db
    .childrenOf(project.id)
    .where(($) => [$("status"), "=", "active"])
    .deepDescendants()
    .where(($) => [$("status"), "=", "pending"])
    .get();

// Structural mutations
await db.move(task.id, phase2.id); // reparent
await db.prune(phase1.id); // remove subtree
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

// Mode switching chains: nodes → links → nodes
const friendsOfFriends = await db
    .node(alice.id)
    .out()
    .where(($) => [$("type"), "=", "friend"])
    .to()
    .where(($) => [$.DEGREE, ">", 1])
    .get();

// Path finding with filtering
const friendOnlyPaths = await db
    .node(alice.id)
    .pathTo(charlie.id)
    .where(($) => [
        $.links()
            .where(($2) => [$2("type"), "!=", "friend"])
            .size(),
        "=",
        0,
    ])
    .shortest()
    .get();
```

## Core Concepts

### Items and IDs

Every item in every DB has a structure like `{ id: string; type: string; data: D }`. IDs are auto-generated UUIDs. User data lives in the `.data` field. Structural metadata (parent, children, in, out, from, to) sits alongside.

All mutation operations (insert, update, remove) return the affected items.

### Pipelines

All three DBs use chainable query pipelines. A pipeline starts with a **chain starter**, passes through **chaining operations**, and terminates with a **terminal**.

```ts
db.where(($) => [$("age"), ">", 18]) // chain starter
    .sort(($) => $("name"), "asc") // chaining op
    .slice(0, 10) // chaining op
    .get(); // terminal
```

Pipelines are lazy — nothing executes until a terminal is called.

### Predicates

Predicates use tuple syntax: `[subject, operator, operand]`.

```ts
.where(($) => [$("age"), ">", 18])           // comparison
.where(($) => [$("name"), "%", "Ali"])        // string contains
.where(($) => [$("roles"), "#", "admin"])     // array/Set has
.where(($) => [$("age"), "><", 18, 65])       // range (exclusive)
.where(($) => [$("active"), "?"])             // truthiness
.where(($) => [$.ID, "=", someId])            // meta field access
```

See [docs/predicates.md](docs/predicates.md) for the full operator reference.

### Set Operations

All DBs support `intersection`, `union`, and `exclusion` across pipelines. These can be nested.

```ts
const result = await db
    .union(
        db.where(($) => [$("age"), "<", 18]),
        db.intersection(
            db.where(($) => [$("role"), "=", "admin"]),
            db.where(($) => [$("active"), "?"]),
        ),
    )
    .get();
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
