# GraphDB

`GraphDB<N, L, U>` is a directed graph with typed nodes and links. `N` is the node data type, `L` is the link data type, `U` is optional user metadata.

```ts
import { GraphDB } from "trh-db";
import { MemoryCodec } from "trh-db/codec";

type Server = { hostname: string; cpu: number; memory: number };
type Connection = { protocol: string; port: number; latency: number };
const db = new GraphDB<Server, Connection>(new MemoryCodec());
```

## Item Structure

Nodes:

```ts
{ id: string; type: "node"; in: string[]; out: string[]; data: N }
```

Links:

```ts
{
    id: string;
    type: "link";
    from: string;
    to: string;
    data: L;
}
```

## Node CRUD

### Insert

```ts
const server = await db.insert({ hostname: "web-1", cpu: 4, memory: 16 });
const [db1, db2] = await db.insert([
    { hostname: "db-primary", cpu: 8, memory: 64 },
    { hostname: "db-replica", cpu: 8, memory: 64 },
]);
```

### Get

```ts
const node = db.get(id);
const nodes = db.get([id1, id2]);
```

### Update

```ts
await db.updateNode(id, { hostname: "web-1", cpu: 8, memory: 32 });
await db.updateNode(id, (prev, item) => ({ ...prev, cpu: prev.cpu * 2 }));
await db.updateNode([id1, id2], (prev) => ({ ...prev, memory: 128 }));
```

### Remove

Removes the node and cascade-deletes all connected links. Returns both removed nodes and removed links.

```ts
const { nodes, links } = await db.remove(id);
const { nodes, links } = await db.remove([id1, id2]);
```

## Link CRUD

### Connect

Creates a directed link between two nodes.

```ts
const link = await db.connect(fromId, toId, { protocol: "tcp", port: 5432, latency: 2 });
```

### Get Link

```ts
const link = db.getLink(linkId);
const links = db.getLink([id1, id2]);
```

### Update Link

The updater callback receives the link, plus the from and to node objects.

```ts
await db.updateLink(linkId, { protocol: "tls", port: 5432, latency: 1 });
await db.updateLink(linkId, (prev, link, fromNode, toNode) => ({
    ...prev,
    latency: fromNode.data.memory > 32 ? 1 : prev.latency,
}));
```

### Sever

Removes a link by ID and updates the connected nodes' `in`/`out` arrays.

```ts
const removed = await db.sever(linkId);
const removed = await db.sever([id1, id2]);
```

### Disconnect

Removes all links between two nodes in both directions.

```ts
const removed = await db.disconnect(nodeA, nodeB);
```

### Isolate

Strips links from a node without removing the node itself.

```ts
await db.isolate(id); // remove all connected links
await db.isolateIn(id); // remove inbound links only
await db.isolateOut(id); // remove outbound links only
```

All three accept single IDs or arrays/Sets and return the removed links.

## Index Management

Separate indices for nodes and links.

```ts
db.addNodeIndex(($) => $("hostname"));
db.addLinkIndex(($) => $("protocol"));
db.dropNodeIndex(($) => $("hostname"));
db.dropLinkIndex(($) => $("protocol"));
```

## Three Pipeline Modes

GraphDB has three distinct pipeline types that you can switch between: **node**, **link**, and **path**.

### Node Pipeline

#### Chain Starters

```ts
db.nodes(); // all nodes
db.nodesWhere(($) => [$("cpu"), ">", 4]); // filtered nodes
db.node(id); // single node
db.node([id1, id2]); // multiple nodes
```

#### Standard Operations

```ts
.where($ => [$("memory"), ">", 32])
.sort($ => $("hostname"), "asc")
.first() / .last() / .at(n)
.distinct()
.slice(start, end?) / .paginate(page, perPage) / .window(skip, take)
```

#### Via — Single-Hop Traversal

Hops to adjacent nodes across links, staying in node mode. Optionally filters which links to traverse.

```ts
// All neighbors (any direction)
db.node(id).via();

// Outbound neighbors only
db.node(id).viaOut();

// Inbound neighbors only
db.node(id).viaIn();

// Filter by link data
db.node(id).via(($) => [$("protocol"), "=", "tcp"]);

// Chain multiple hops
db.node(id).viaOut().viaOut(); // two hops downstream
```

#### Deep/Wide Traversal

Traverses the graph collecting all reachable nodes. Cycle-safe (uses visited set).

```ts
// DFS
db.node(id).deepDownstreamNodes(); // follow outbound links
db.node(id).deepUpstreamNodes(); // follow inbound links
db.node(id).deepNodes(); // follow any direction

// BFS
db.node(id).wideDownstreamNodes();
db.node(id).wideUpstreamNodes();
db.node(id).wideNodes();
```

#### Node Meta Fields

| Field          | Type     | Description                 |
| -------------- | -------- | --------------------------- |
| `$.ID`         | `string` | Node ID                     |
| `$.IN_DEGREE`  | `number` | Count of inbound links      |
| `$.OUT_DEGREE` | `number` | Count of outbound links     |
| `$.DEGREE`     | `number` | Total link count (in + out) |

```ts
db.nodesWhere(($) => [$.DEGREE, ">", 5]);
db.nodesWhere(($) => [$.OUT_DEGREE, "=", 0]); // sink nodes
```

#### Node Write Terminals

```ts
await pipeline.update((prev) => ({ ...prev, cpu: 16 }));
await pipeline.update(($) => $("memory"), 128); // lens-targeted
await pipeline.remove(); // cascade-deletes links
await pipeline.isolate();
await pipeline.isolateIn();
await pipeline.isolateOut();
```

### Link Pipeline

#### Chain Starters

```ts
db.links(); // all links
db.linksWhere(($) => [$("latency"), "<", 5]); // filtered links
db.link(id); // single link
db.link([id1, id2]); // multiple links
```

#### Link Meta Fields

| Field    | Type     | Description    |
| -------- | -------- | -------------- |
| `$.ID`   | `string` | Link ID        |
| `$.FROM` | `string` | Source node ID |
| `$.TO`   | `string` | Target node ID |

```ts
db.linksWhere(($) => [$.FROM, "=", nodeId]);
```

#### Link Write Terminals

```ts
await pipeline.update((prev) => ({ ...prev, latency: 1 }));
await pipeline.update(($) => $("port"), 443); // lens-targeted
await pipeline.sever(); // remove matched links
```

### Mode Switching

#### Node to Link

```ts
db.node(id).out(); // outbound links → link pipeline
db.node(id).in(); // inbound links → link pipeline
db.node(id).links(); // all connected links → link pipeline
```

Deep/wide traversals can also switch to link mode:

```ts
db.node(id).deepDownstreamLinks();
db.node(id).wideUpstreamLinks();
db.node(id).deepLinks();
db.node(id).wideLinks();
```

#### Link to Node

```ts
db.link(id).from(); // source nodes → node pipeline
db.link(id).to(); // target nodes → node pipeline
db.link(id).nodes(); // both endpoints → node pipeline
```

#### Chaining Across Modes

```ts
// From a node, get outbound links, filter, then get target nodes
const targets = await db
    .node(id)
    .out()
    .where(($) => [$("protocol"), "=", "tcp"])
    .to()
    .get();
```

### Path Pipeline

#### Entering Path Mode

From a node pipeline:

```ts
db.node(id).pathTo(targetId); // downstream paths (follow outbound links)
db.node(id).pathFrom(targetId); // upstream paths (follow inbound links)
db.node(id).pathBetween(targetId); // any-direction paths
```

Paths are found using BFS with cycle detection. All paths are returned (not just the shortest).

#### Path Structure

A path is an array of steps. Each step is a 3-tuple: `[sourceNode, link, targetNode]`.

```ts
type GraphStep<N, L> = [GraphNodeOf<N>, GraphLinkOf<L>, GraphNodeOf<N>];
type GraphPath<N, L> = GraphStep<N, L>[];
```

#### Two-Axis Cardinality

The path pipeline tracks cardinality on two axes:

- **PC (path cardinality)**: which paths — `first()`, `last()`, `at(n)` narrow to single
- **SC (step cardinality)**: which steps — `step(n)` narrows to single

| PC     | SC     | `get()` returns                   |
| ------ | ------ | --------------------------------- |
| multi  | multi  | `GraphPath[]` (array of paths)    |
| multi  | single | `GraphStep[]` (one step per path) |
| single | multi  | `GraphPath` (one path)            |
| single | single | `GraphStep` (one step)            |

#### Path Filtering

```ts
// By path length
.where($ => [$.LENGTH, "=", 3])

// By node/link IDs along the path
.where($ => [$.NODES, "#", someNodeId])   // path passes through node
.where($ => [$.LINKS, "#", someLinkId])   // path uses link

// By link data (callable meta)
.where($ => [$.links().at(-1)("latency"), "<", 5])          // last link has low latency
.where($ => [$.links().where($2 => [$2("protocol"), "=", "tcp"]).size(), ">", 0])  // has a TCP link

// By node data (callable meta)
.where($ => [$.nodes().where($2 => [$2("cpu"), ">", 8]).size(), "=", $.LENGTH])    // all nodes have high CPU

// Per-element meta in nested where
.where($ => [$.links().where($2 => [$2.FROM, "=", someId]).size(), ">", 0])
.where($ => [$.nodes().where($2 => [$2.DEGREE, ">", 3]).size(), ">", 0])
```

#### Path Cardinality Operations

PC axis (which paths):

```ts
.first()                // first path → single
.last()                 // last path → single
.at(n)                  // nth path → single
.shortest()             // keep all paths of minimum length (stays multi)
.longest()              // keep all paths of maximum length (stays multi)
.sort($ => $.LENGTH, "asc")
.slice(start, end?)
.paginate(page, perPage)
.window(skip, take)
```

SC axis (which steps):

```ts
.step(n)                // nth step of each path → single step
.segment(a, b?)         // slice steps within each path (stays multi)
```

#### Path Accessors (Mode Switches)

```ts
.nodeAt(n)              // nth node → node pipeline
.linkAt(n)              // nth link → link pipeline
.origin()               // first node (alias for nodeAt(0))
.destination()          // last node (alias for nodeAt(-1))
.ends()                 // first + last nodes → node pipeline
.nodes()                // all nodes across all paths → node pipeline
.links()                // all links across all paths → link pipeline
```

#### Path Chaining

`pathTo`, `pathFrom`, and `pathBetween` can be called on a path pipeline to extend each current path from its terminal (last) node. The result is a new set of paths where each original path is concatenated with a discovered extension. Cardinality resets to multi after chaining.

```ts
// Find paths from a to b, then extend each to c
db.node(a).pathTo(b).pathTo(c);

// Filter the first segment before extending
db.node(a)
    .pathTo(b)
    .where(($) => [
        $.links()
            .where(($2) => [$2("latency"), ">=", 10])
            .size(),
        "=",
        0,
    ])
    .pathTo(c);
```

If any current path has no onward route to the new target, it is dropped from the result.

## Join

Creates links between the results of two node pipelines.

```ts
// Static data
const links = await db.join(
    db.nodesWhere(($) => [$("role"), "=", "client"]),
    db.nodesWhere(($) => [$("role"), "=", "server"]),
    { protocol: "tcp", port: 80, latency: 0 },
);

// Callback — return undefined to skip a pair
const links = await db.join(
    db.nodesWhere(($) => [$("region"), "=", "us-east"]),
    db.nodesWhere(($) => [$("region"), "=", "us-west"]),
    (from, to) => {
        if (from.data.cpu < 4) return undefined; // skip weak servers
        return { protocol: "tcp", port: 443, latency: 50 };
    },
);
```

## Set Operations

Work on node pipelines and link pipelines (same entity type only).

```ts
db.intersection(
    db.nodesWhere(($) => [$("cpu"), ">", 4]),
    db.nodesWhere(($) => [$("memory"), ">", 32]),
);

db.union(
    db.nodesWhere(($) => [$.IN_DEGREE, "=", 0]), // source nodes
    db.nodesWhere(($) => [$.OUT_DEGREE, "=", 0]), // sink nodes
);

db.exclusion(
    db.nodes(),
    db.nodesWhere(($) => [$("hostname"), "%", "test"]),
);
```

## Examples

### Find all servers reachable from a gateway

```ts
const reachable = await db.node(gatewayId).deepDownstreamNodes().get();
```

### Find the shortest path between two servers

```ts
const path = await db.node(sourceId).pathTo(targetId).shortest().first().get();
```

### Find paths that only use low-latency connections

```ts
const paths = await db
    .node(sourceId)
    .pathTo(targetId)
    .where(($) => [
        $.links()
            .where(($2) => [$2("latency"), ">=", 10])
            .size(),
        "=",
        0,
    ])
    .get();
```

### Get all TCP connections from a specific server

```ts
const tcpTargets = await db
    .node(serverId)
    .out()
    .where(($) => [$("protocol"), "=", "tcp"])
    .to()
    .get();
```

### Disconnect a server from everything

```ts
const removedLinks = await db.isolate(serverId);
```

### Find hub nodes (high degree)

```ts
const hubs = await db
    .nodesWhere(($) => [$.DEGREE, ">", 10])
    .sort(($) => $.DEGREE, "desc")
    .get();
```

### Create a mesh between all nodes in a region

```ts
const regionNodes = db.nodesWhere(($) => [$("region"), "=", "eu-west"]);
await db.join(regionNodes, regionNodes, (from, to) => {
    if (from.id === to.id) return undefined; // no self-links
    return { protocol: "tcp", port: 443, latency: 5 };
});
```
