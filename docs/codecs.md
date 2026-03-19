# Codecs

Codecs handle persistence for DB classes. A codec knows how to serialize, deserialize, and store data. Every DB class takes a codec in its constructor.

## MemoryCodec

No persistence. Data lives only in memory and is lost when the process ends. All codec methods are no-ops.

```ts
import { MemoryCodec } from "trh-db/codec";

const db = new DocumentDB<MyType>(new MemoryCodec());
```

No configuration needed. This is the default choice for testing and ephemeral data.

## JsonCodec

Reads and writes a JSON file. The file contains a `{ meta, data }` envelope. Every mutation rewrites the entire file.

```ts
import { JsonCodec } from "trh-db/codec";

const db = new DocumentDB<MyType>(new JsonCodec("./data/users.json"));
```

The data type must be JSON-serializable. Complex types (Date, Set, Map, BigInt, etc.) are not supported — use TrhCodec for those.

### File Format

```json
{
    "meta": { "user": null, "type": "documents", "version": 1 },
    "data": {
        "abc-123": { "id": "abc-123", "type": "document", "data": { "name": "Alice" } }
    }
}
```

## TrhCodec

An append-only ledger format with sigil-aware JSON serialization. Supports types that standard JSON cannot represent.

```ts
import { TrhCodec } from "trh-db/codec";

const db = new DocumentDB<MyType>(new TrhCodec("./data/users.trhdb"));
```

### Ledger Operations

Instead of rewriting the entire file on every change, TrhCodec appends operation entries:

| Op  | Meaning  | Data stored                                        |
| --- | -------- | -------------------------------------------------- |
| `I` | INSERT   | Full item                                          |
| `U` | UPDATE   | Data field only                                    |
| `S` | STRUCT   | Structural fields only (parent, children, in, out) |
| `D` | DELETE   | Item ID only                                       |
| `M` | METADATA | User metadata                                      |

On `load()`, the ledger is replayed from start to end (last write wins for each ID) and then compacted — the file is rewritten with only `I` and `M` entries, eliminating the history.

### Built-in Sigils

TrhCodec handles types that `JSON.stringify` cannot:

| Type                     | Sigil         |
| ------------------------ | ------------- |
| `NaN`                    | `core.nan`    |
| `Infinity` / `-Infinity` | `core.inf`    |
| `BigInt`                 | `core.bigint` |
| `Date`                   | `core.date`   |
| `RegExp`                 | `core.regexp` |
| `Set`                    | `core.set`    |
| `Map`                    | `core.map`    |
| `URL`                    | `core.url`    |

These round-trip correctly through serialization and deserialization.

### Custom Sigils

Register custom type handlers for application-specific types:

```ts
const codec = new TrhCodec<MyItem>("./data.trhdb");

codec.register<ComplexNumber, [number, number]>(
    "complex", // sigil name
    ([real, imag]) => ({ real, imag }), // parser: token → value
    (v) =>
        v && "real" in v
            ? [v.real, v.imag] // serializer: value → token (or undefined to skip)
            : undefined,
);
```

The serializer returns the compact token form or `undefined` if the value isn't the target type. The parser reconstructs the value from the token.

## Codec Interface

All codecs implement this interface:

```ts
type Codec<D, M> = {
    load: () => Promise<[data: { [id: string]: D }, meta: M | null]>;
    flush: (data: CodecData<D>, meta: M | null) => Promise<void>;
    insert: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    update: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    delete: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    struct: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    setMeta: (value: M | null, data: CodecData<D>) => Promise<void>;
};
```

The `data` parameter is a lazy accessor (`CodecData<D> = () => { [id: string]: D }`) — codecs that need the full data snapshot (like JsonCodec) call it, while codecs that don't (like TrhCodec for most operations) skip the call entirely.

## DB Metadata

Each DB class manages a combined metadata envelope:

```ts
type DBMeta<U> = { user: U; type: string; version: number };
```

- `user` — application-defined metadata (type `U`, defaults to `null`)
- `type` — DB type identifier (`"documents"`, `"tree"`, `"graph"`)
- `version` — schema version number

Access via:

```ts
const meta = db.getMeta(); // sync read
await db.setMeta({ key: "value" }); // async write (persists immediately)
await db.load(); // loads data + metadata from codec
```
