# Predicates

Predicates are the filtering mechanism used across all DB pipelines. They use a tuple syntax inside a callback:

```ts
db.where(($) => [subject, operator, operand]);
```

The `$` is a lens that navigates into the item's data. `$("name")` accesses the `name` field. `$.ID` accesses meta fields injected by the DB (like the item's ID).

## Operators

### Equality (3-arity)

| Operator | Meaning                                     |
| -------- | ------------------------------------------- |
| `=`      | Equal (loose, uses Compare/Equals protocol) |
| `!=`     | Not equal                                   |
| `==`     | Strict equal (`===`)                        |
| `!==`    | Strict not equal                            |

```ts
[$("name"), "=", "Alice"][($("status"), "!=", "inactive")];
```

### Comparison (3-arity)

| Operator | Meaning                   |
| -------- | ------------------------- |
| `>`      | Greater than              |
| `>=`     | Greater than or equal     |
| `<`      | Less than                 |
| `<=`     | Less than or equal        |
| `!>`     | Not greater than          |
| `!>=`    | Not greater than or equal |
| `!<`     | Not less than             |
| `!<=`    | Not less than or equal    |

```ts
[$("age"), ">", 18][($("score"), "<=", 100)];
```

Comparison uses the `Compare` symbol protocol when available, `Intl.Collator` for natural string sorting (so `"file2"` sorts before `"file10"`), and standard numeric comparison for numbers.

### String Matching (3-arity)

| Operator | Meaning                               |
| -------- | ------------------------------------- |
| `%`      | Contains substring (case-sensitive)   |
| `%^`     | Contains substring (case-insensitive) |
| `%_`     | Starts with (case-sensitive)          |
| `%^_`    | Starts with (case-insensitive)        |
| `_%`     | Ends with (case-sensitive)            |
| `_%^`    | Ends with (case-insensitive)          |

```ts
[$("name"), "%", "Ali"][($("email"), "_%", ".com")][($("title"), "%^_", "the")]; // contains "Ali" // ends with ".com" // starts with "the" (case-insensitive)
```

Numbers are coerced to strings for matching. Booleans, arrays, null, and undefined are rejected (return false).

### Regex (3-arity)

| Operator | Meaning                               |
| -------- | ------------------------------------- |
| `~`      | Regex test (accepts string or RegExp) |

```ts
[$("email"), "~", /^[a-z]+@/][($("code"), "~", "^[A-Z]{3}")];
```

Invalid regex strings return false (no throw). Non-string subjects return false.

### Membership (3-arity)

| Operator | Meaning                                                          |
| -------- | ---------------------------------------------------------------- |
| `#`      | Has — array `includes`, Set `has`, or custom `Contains` protocol |
| `!#`     | Does not have                                                    |

```ts
[$("roles"), "#", "admin"][($("tags"), "#", "important")]; // array includes // Set has
```

### Type Check (3-arity)

| Operator | Meaning                                 |
| -------- | --------------------------------------- |
| `:`      | typeof check with hierarchical matching |

Type strings use a hierarchical system:

| Type string           | Matches                            |
| --------------------- | ---------------------------------- |
| `"string"`            | strings                            |
| `"number"`            | numbers and BigInt                 |
| `"boolean"`           | booleans                           |
| `"nullish"`           | null and undefined                 |
| `"nullish/null"`      | null only                          |
| `"nullish/undefined"` | undefined only                     |
| `"object"`            | objects, arrays, dates, maps, sets |
| `"object/array"`      | arrays only                        |
| `"object/date"`       | Date instances                     |
| `"object/set"`        | Set instances                      |
| `"object/map"`        | Map instances                      |

Prefix matching: `"number"` matches both native numbers and BigInt. `"object"` matches all object subtypes.

```ts
[$("value"), ":", "string"][($("data"), ":", "object/array")];
```

### Range (4-arity)

| Operator | Meaning                              |
| -------- | ------------------------------------ |
| `><`     | Exclusive range: `lo < value < hi`   |
| `>=<`    | Inclusive range: `lo <= value <= hi` |

```ts
[$("age"), "><", 18, 65][($("score"), ">=<", 0, 100)]; // 18 < age < 65 // 0 <= score <= 100
```

Operand order is auto-corrected: `[$("age"), "><", 65, 18]` works identically.

### Unary (2-arity)

| Operator | Meaning |
| -------- | ------- |
| `?`      | Truthy  |
| `!?`     | Falsy   |

```ts
[$("active"), "?"][($("deletedAt"), "!?")]; // is truthy // is falsy/null/undefined
```

## Operator Modifiers

Most operators support suffixes that change how the operand is evaluated:

| Suffix | Meaning                                                  |
| ------ | -------------------------------------------------------- |
| `\|`   | Any — operand is an array, passes if ANY element matches |
| `&`    | All — operand is an array, passes if ALL elements match  |

```ts
[$("role"), "=|", ["admin", "editor"]][($("tags"), "#&", ["read", "write"])][($("name"), "~|", [/^A/, /^B/])]; // role is admin OR editor // tags includes BOTH read AND write // name matches either regex
```

## Logical Combinators

Combine multiple predicates with logical operators:

```ts
// OR — matches if any condition is true
db.where(($) => $.or([$("age"), ">", 18], [$("role"), "=", "admin"]));

// AND — matches if all conditions are true
db.where(($) => $.and([$("age"), ">", 18], [$("active"), "?"]));

// NOT — negates a condition
db.where(($) => $.not([$("role"), "=", "guest"]));

// XOR — matches if exactly one condition is true (odd number for multiple)
db.where(($) => $.xor([$("premium"), "?"], [$("trial"), "?"]));

// Nesting
db.where(($) => $.and($.or([$("role"), "=", "admin"], [$("role"), "=", "editor"]), [$("active"), "?"]));
```

## Meta Fields

Meta fields are structural properties injected by the DB, accessible via `$.FIELD` (property access, not function call).

| DB              | Field          | Type             | Description               |
| --------------- | -------------- | ---------------- | ------------------------- |
| All             | `$.ID`         | `string`         | Item ID                   |
| TreeDB          | `$.PARENT`     | `string \| null` | Parent node ID            |
| TreeDB          | `$.CHILDREN`   | `string[]`       | Child node IDs            |
| TreeDB          | `$.DEPTH`      | `number`         | Depth from root (0-based) |
| GraphDB (nodes) | `$.IN_DEGREE`  | `number`         | Count of inbound links    |
| GraphDB (nodes) | `$.OUT_DEGREE` | `number`         | Count of outbound links   |
| GraphDB (nodes) | `$.DEGREE`     | `number`         | Total link count          |
| GraphDB (links) | `$.FROM`       | `string`         | Source node ID            |
| GraphDB (links) | `$.TO`         | `string`         | Target node ID            |
| GraphDB (paths) | `$.LENGTH`     | `number`         | Step count                |
| GraphDB (paths) | `$.NODES`      | `string[]`       | Node IDs along path       |
| GraphDB (paths) | `$.LINKS`      | `string[]`       | Link IDs along path       |

Meta fields use property access (`$.ID`), while data fields use function call syntax (`$("name")`). These are distinct — a data field named `ID` would be accessed with `$("ID")`, not `$.ID`.

### Callable Meta (Path Pipeline)

The path pipeline has callable meta fields that return navigable arrays:

```ts
// $.nodes() — returns array of node data, each with per-element meta (_.ID, _.DEGREE, etc.)
// $.links() — returns array of link data, each with per-element meta (_.ID, _.FROM, _.TO)

db.node(a)
    .pathTo(b)
    .where(($) => [$.links().at(-1)("cost"), "<", 10]);

db.node(a)
    .pathTo(b)
    .where(($) => [
        $.nodes()
            .where((_) => [_.ID, "=", someNodeId])
            .size(),
        ">",
        0,
    ]);
```
