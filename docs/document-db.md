# DocumentDB

`DocumentDB<D, U>` is a keyed collection of documents. Each document has an auto-generated ID and a user data payload of type `D`. The optional `U` type parameter is for user metadata.

```ts
import { DocumentDB } from "trh-db";
import { MemoryCodec } from "trh-db/codec";

type Product = { name: string; price: number; category: string };
const db = new DocumentDB<Product>(new MemoryCodec());
```

## CRUD Operations

### Insert

IDs are auto-generated. Returns the created item(s).

```ts
// Single
const item = await db.insert({ name: "Widget", price: 9.99, category: "tools" });
// item.id → "a1b2c3d4-..."
// item.data → { name: "Widget", price: 9.99, category: "tools" }

// Batch
const [a, b] = await db.insert([
    { name: "Widget", price: 9.99, category: "tools" },
    { name: "Gadget", price: 19.99, category: "electronics" },
]);
```

### Get

Synchronous direct access by ID.

```ts
const item = db.get(id); // single → item or undefined
const items = db.get([id1, id2]); // multi → item[]
const items = db.get(new Set([id1, id2])); // also accepts Set
```

### Update

Three overloads. All return the updated item(s).

```ts
// Static replacement
await db.update(id, { name: "New Name", price: 12.99, category: "tools" });

// Updater callback — receives previous data and the full item
await db.update(id, (prev, item) => ({ ...prev, price: prev.price * 1.1 }));

// Batch by ID list
await db.update([id1, id2], (prev) => ({ ...prev, category: "sale" }));

// Batch by payload object
await db.update({
    [id1]: { name: "A", price: 5, category: "tools" },
    [id2]: { name: "B", price: 10, category: "tools" },
});
```

Returns `undefined` if the target ID doesn't exist.

### Remove

Returns the removed item(s).

```ts
const removed = await db.remove(id); // single → item or undefined
const removed = await db.remove([id1, id2]); // multi → item[]
```

## Index Management

Indices accelerate `where` queries on specific fields. An index is defined by a lens path.

```ts
// Create index
db.addIndex(($) => $("price"));
db.addIndex(($) => $("address")("city")); // nested path

// Drop index
db.dropIndex(($) => $("price"));
```

When an index exists, `where` queries that use `=`, `>`, `>=`, `<`, `<=`, or `><` on the indexed field will use the index for faster lookup instead of scanning all documents.

## Pipeline

### Chain Starters

```ts
db.all(); // all documents
db.select(id); // single document by ID
db.select([id1, id2]); // multiple by ID
db.where(($) => [$("price"), ">", 10]); // filter by predicate
```

### Chaining Operations

```ts
.where($ => [$("category"), "=", "tools"])  // filter
.sort($ => $("price"), "asc")               // sort (asc or desc)
.sort($ => $.ID, "desc")                    // sort by meta field
.first()                                     // first item (multi → single)
.last()                                      // last item
.at(n)                                       // item at index
.distinct()                                  // deduplicate by ID
.slice(start, end?)                          // array slice
.paginate(page, perPage)                     // page-based slice (1-indexed)
.window(skip, take)                          // offset-based slice
```

### Read Terminals

```ts
await pipeline.get(); // → item or item[] (depends on cardinality)
await pipeline.count(); // → number
await pipeline.exists(); // → boolean
await pipeline.id(); // → string or string[]
```

### Write Terminals

```ts
// Replace entire data
await pipeline.update({ name: "New", price: 0, category: "free" });

// Updater callback
await pipeline.update((prev) => ({ ...prev, price: prev.price * 0.9 }));

// Lens-targeted update (update a specific nested field)
await pipeline.update(($) => $("price"), 0);

// Remove matched items
await pipeline.remove();
```

### Meta Fields

Available in `where` and `sort` callbacks:

| Field  | Type     | Description |
| ------ | -------- | ----------- |
| `$.ID` | `string` | Document ID |

## Set Operations

Combine pipeline results with set logic. Returns a new pipeline.

```ts
// Items in both pipelines
db.intersection(
    db.where(($) => [$("price"), ">", 10]),
    db.where(($) => [$("category"), "=", "tools"]),
);

// Items in either pipeline
db.union(
    db.where(($) => [$("price"), "<", 5]),
    db.where(($) => [$("category"), "=", "sale"]),
);

// Items in first but not in the rest
db.exclusion(
    db.all(),
    db.where(($) => [$("category"), "=", "archived"]),
);

// Nesting
db.union(
    db.where(($) => [$("featured"), "?"]),
    db.intersection(
        db.where(($) => [$("price"), "<", 20]),
        db.where(($) => [$("rating"), ">", 4]),
    ),
)
    .sort(($) => $("price"), "asc")
    .get();
```

## Examples

### Paginated product listing

```ts
const page = await db
    .where(($) => [$("category"), "=", "electronics"])
    .sort(($) => $("price"), "asc")
    .paginate(2, 20)
    .get();
```

### Bulk price update

```ts
await db.where(($) => [$("category"), "=", "clearance"]).update((prev) => ({ ...prev, price: prev.price * 0.5 }));
```

### Find by multiple criteria

```ts
const results = await db
    .where(($) => $.and([$("price"), ">=<", 10, 50], [$("category"), "=|", ["tools", "electronics"]]))
    .sort(($) => $("name"), "asc")
    .get();
```
