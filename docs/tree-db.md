# TreeDB

`TreeDB<D, U>` is a parent/child hierarchy. Each node has an auto-generated ID, a parent reference, a children array, and a user data payload of type `D`.

```ts
import { TreeDB } from "trh-db";
import { MemoryCodec } from "trh-db/codec";

type Task = { title: string; status: string; priority: number };
const db = new TreeDB<Task>(new MemoryCodec());
```

## Item Structure

Each tree item has the shape:

```ts
{
    id: string;
    type: "treeitem";
    parent: string | null;    // null for root nodes
    children: string[];       // ordered child IDs
    data: D;                  // user payload
}
```

## CRUD Operations

### Add

Creates nodes in the tree. Pass `null` as parent for root nodes. Returns the created item(s).

```ts
// Single node
const root = await db.add({ title: "Project", status: "active", priority: 1 }, null);
const task = await db.add({ title: "Design", status: "todo", priority: 2 }, root.id);

// Bulk — each item specifies its own parent
const children = await db.add([
    { data: { title: "Frontend", status: "todo", priority: 3 }, parent: task.id },
    { data: { title: "Backend", status: "todo", priority: 3 }, parent: task.id },
    { data: { title: "Archive", status: "done", priority: 5 }, parent: null }, // new root
]);
```

### Get

```ts
const item = db.get(id);
const items = db.get([id1, id2]);
```

### Update

Same three overloads as DocumentDB. Returns updated item(s). Does not affect tree structure (parent/children).

```ts
await db.update(id, { title: "Updated", status: "done", priority: 1 });
await db.update(id, (prev, item) => ({ ...prev, status: "done" }));
await db.update([id1, id2], (prev) => ({ ...prev, priority: prev.priority + 1 }));
```

### Move

Changes a node's parent. Updates the old parent's children array, the new parent's children array, and the node's parent reference. Returns the moved item.

```ts
await db.move(nodeId, newParentId); // move under a new parent
await db.move(nodeId, null); // move to root
```

## Removal Operations

Four distinct removal semantics:

### pluck

Removes the node. Its children become root nodes (parent set to null).

```ts
//   A
//  / \
// B   C

await db.pluck(a.id);
// B and C are now roots
```

### splice

Removes the node. Its children are reparented to the removed node's parent.

```ts
//     R
//     |
//     A
//    / \
//   B   C

await db.splice(a.id);
//     R
//    / \
//   B   C
```

### prune

Removes the node and all its descendants recursively.

```ts
//   A
//  / \
// B   C
//     |
//     D

await db.prune(a.id);
// A, B, C, D all removed
```

### trim

Removes the node only if it is a leaf (has no children). Non-leaves are skipped.

```ts
await db.trim(leafId); // removed
await db.trim(parentId); // no-op, has children
await db.trim([id1, id2]); // removes only the leaves in the list
```

All removal operations return the removed item(s) and accept both single IDs and arrays/Sets.

## Pipeline

### Chain Starters

```ts
db.roots(); // root nodes only
db.deep(); // all nodes in depth-first order
db.wide(); // all nodes in breadth-first order
db.select(id); // single node
db.select([id1, id2]); // multiple nodes
db.where(($) => [$("status"), "=", "todo"]);

// Structural starters
db.ancestorsOf(id); // ancestors from node to root
db.childrenOf(id); // direct children
db.parentOf(id); // parent node
db.deepDescendantsOf(id); // all descendants (DFS)
db.wideDescendantsOf(id); // all descendants (BFS)
db.siblingsOf(id); // siblings (same parent, excluding self)
```

### Chaining Operations

Standard operations (same as DocumentDB):

```ts
.where($ => [...])
.sort($ => $("priority"), "asc")
.first() / .last() / .at(n)
.distinct()
.slice(start, end?) / .paginate(page, perPage) / .window(skip, take)
```

Traversal chaining (can be applied mid-pipeline):

```ts
.ancestors()           // from current nodes, get their ancestors
.parent()              // from current nodes, get their parents
.children()            // from current nodes, get their children
.siblings()            // from current nodes, get their siblings
.deepDescendants()     // from current nodes, DFS descendants
.wideDescendants()     // from current nodes, BFS descendants
.roots()               // get root nodes
```

Traversals always produce multi cardinality.

### Read Terminals

```ts
await pipeline.get();
await pipeline.count();
await pipeline.exists();
await pipeline.id();
```

### Write Terminals

```ts
await pipeline.update((prev) => ({ ...prev, status: "done" }));
await pipeline.update(($) => $("priority"), 1); // lens-targeted
await pipeline.pluck();
await pipeline.splice();
await pipeline.prune();
await pipeline.trim();
await pipeline.move(newParentId);
await pipeline.move((item) => (item.parent === oldId ? newId : null)); // callback
```

### Meta Fields

| Field        | Type             | Description                |
| ------------ | ---------------- | -------------------------- |
| `$.ID`       | `string`         | Node ID                    |
| `$.PARENT`   | `string \| null` | Parent ID (null for roots) |
| `$.CHILDREN` | `string[]`       | Child IDs                  |
| `$.DEPTH`    | `number`         | Depth from root (root = 0) |

```ts
db.where(($) => [$.DEPTH, ">", 2]);
db.where(($) => [$.PARENT, "=", someId]);
db.where(($) => [$.CHILDREN, "#", childId]); // has specific child
```

## Set Operations

Same interface as DocumentDB:

```ts
db.intersection(pipeline1, pipeline2);
db.union(pipeline1, pipeline2);
db.exclusion(from, subtract1, subtract2);
```

## Examples

### Find all leaf nodes

```ts
const leaves = await db
    .deep()
    .where(($) => [$.CHILDREN.size(), "=", 0])
    .get();
```

### Collapse a branch

Remove an intermediate node and move its children up:

```ts
await db.splice(middleNodeId);
```

### Get a node's full path from root

```ts
const path = await db.ancestorsOf(nodeId).get();
// Returns ancestors from immediate parent to root
```

### Update all nodes at a specific depth

```ts
await db.where(($) => [$.DEPTH, "=", 2]).update((prev) => ({ ...prev, status: "reviewed" }));
```

### Pipeline traversal chaining

```ts
// Find grandchildren of root
const grandchildren = await db.roots().children().children().get();

// Find ancestors of all "urgent" tasks, deduplicated
const containers = await db
    .where(($) => [$("priority"), "=", 1])
    .ancestors()
    .distinct()
    .get();
```
