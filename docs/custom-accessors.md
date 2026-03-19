# Custom Accessors (LensNav Protocol)

Classes can expose their internal state to the lens system via the `LensNav` symbol from `@trh/symbols`. This allows custom types to participate in lens navigation, mutation, and application without exposing their internals directly.

## Basic Structure

A class implements `[LensNav]` as an object where each key is an accessor name:

```ts
import { TrhSymbols } from "@trh/symbols";

class Vector2 {
    #x: number;
    #y: number;

    constructor(x: number, y: number) {
        this.#x = x;
        this.#y = y;
    }

    [TrhSymbols.LensNav] = {
        x: {
            access: () => this.#x,
            mutate: (value: number) => {
                this.#x = value;
            },
            apply: (value: number) => new Vector2(value, this.#y),
        },
        y: {
            access: () => this.#y,
            mutate: (value: number) => {
                this.#y = value;
            },
            apply: (value: number) => new Vector2(this.#x, value),
        },
        magnitude: {
            compute: () => Math.sqrt(this.#x ** 2 + this.#y ** 2),
        },
    };
}
```

Usage with the lens:

```ts
const data = { pos: new Vector2(3, 4) };

Lens.get(data, ($) => $("pos").x()); // 3
Lens.get(data, ($) => $("pos").magnitude()); // 5

Lens.mutate(data, ($) => $("pos").x(), 10); // mutates in place
Lens.apply(data, ($) => $("pos").x(), 10); // returns new copy
```

## Accessor Types

Each accessor is an object with one of two primary functions, plus optional write handlers:

### `access` — Navigable Accessor

Used for deterministic navigation into a value. The result can be further navigated with the lens.

```ts
{
    access: (...args) => value,       // read the value
    mutate?: (newValue, ...args) => void,   // write in place (optional)
    apply?: (newValue, ...args) => newOwner, // return new copy (optional)
}
```

- If `mutate` and `apply` are present, the accessor is writable — it can be a target for `Lens.mutate` and `Lens.apply`.
- If they're omitted, the accessor is read-only. Attempting to use it as a write target produces a type error.

### `compute` — Derived Value

Used for computed/derived values that don't correspond to a stored location. Always read-only.

```ts
{
    compute: (...args) => derivedValue,
}
```

- Cannot have `mutate` or `apply` — there's nothing to write back to.
- The result is a terminal value, not further navigable for writes.

## Value-First Convention for Writes

For `mutate` and `apply`, the new value is always the **first** argument, followed by the same arguments that `access` receives:

```ts
class Matrix {
    #data: number[][];

    [TrhSymbols.LensNav] = {
        cell: {
            access: (row: number, col: number) => this.#data[row][col],
            mutate: (value: number, row: number, col: number) => {
                this.#data[row][col] = value;
            },
            apply: (value: number, row: number, col: number) => {
                const copy = this.#data.map((r) => [...r]);
                copy[row][col] = value;
                return new Matrix(copy);
            },
        },
    };
}

// access takes (row, col)
Lens.get(data, ($) => $("m").cell(1, 2));

// mutate takes (value, row, col)
Lens.mutate(data, ($) => $("m").cell(1, 2), 99);
```

## Zero-Arg Accessors

Accessors with no arguments work the same way — they're called with empty parens:

```ts
class Counter {
    #count: number;

    [TrhSymbols.LensNav] = {
        value: { access: () => this.#count },
    };
}

Lens.get(data, ($) => $("counter").value()); // reads the count
```

## Multi-Arg Accessors

Accessors can take any number of arguments:

```ts
class Grid {
    #cells: Map<string, number>;

    [TrhSymbols.LensNav] = {
        cell: {
            access: (x: number, y: number) => this.#cells.get(`${x},${y}`) ?? 0,
            mutate: (value: number, x: number, y: number) => {
                this.#cells.set(`${x},${y}`, value);
            },
        },
    };
}

Lens.get(data, ($) => $("grid").cell(3, 7));
Lens.mutate(data, ($) => $("grid").cell(3, 7), 42);
```

## Dynamic Lens References as Arguments

Accessor arguments can be lens references — values resolved from elsewhere in the data structure:

```ts
const data = {
    row: 1,
    col: 0,
    m: new Matrix([
        [1, 2],
        [3, 4],
    ]),
};

// $("row") and $("col") resolve to 1 and 0 before being passed to cell()
Lens.get(data, ($) => $("m").cell($("row"), $("col"))); // 3
```

This works with `each()` callbacks too:

```ts
const data = [
    { key: "x", store: new KeyValueStore({ x: 100, y: 200 }) },
    { key: "y", store: new KeyValueStore({ x: 300, y: 400 }) },
];

Lens.get(data, ($) => $.each((el) => el("store").lookup(el("key"))));
// [100, 400]
```

## Using with `each()`

When an array contains objects with `LensNav`, the accessor dispatches per-element:

```ts
class Box {
    #val: number;
    constructor(val: number) {
        this.#val = val;
    }
    [TrhSymbols.LensNav] = {
        value: { access: () => this.#val },
    };
}

const data = { boxes: [new Box(10), new Box(20), new Box(30)] };
Lens.get(data, ($) => $("boxes").each().value());
// [10, 20, 30]
```

## Read-Only Enforcement

Read-only is structural. If an accessor uses `compute` instead of `access`, or omits `mutate`/`apply`, the lens type system sets `Target = never`, which prevents it from being used with `Lens.mutate` or `Lens.apply`:

```ts
class Stats {
    #values: number[];

    [TrhSymbols.LensNav] = {
        item: { access: (idx: number) => this.#values[idx] }, // navigable, read+write
        sum: { compute: () => this.#values.reduce((a, b) => a + b, 0) }, // read-only
        avg: { compute: () => this.#values.reduce((a, b) => a + b, 0) / this.#values.length },
    };
}

Lens.get(data, ($) => $("s").sum()); // works
Lens.mutate(data, ($) => $("s").sum(), 0); // type error — compute is read-only
Lens.mutate(data, ($) => $("s").item(0), 99); // works — access with mutate
```

## Other Protocols

### Compare

The `Compare` symbol allows custom types to participate in comparison operators (`>`, `<`, `>=`, `<=`, sorting):

```ts
class Temperature {
    #celsius: number;
    [TrhSymbols.Compare] = (other: Temperature) => this.#celsius - other.#celsius; // negative = less, 0 = equal, positive = greater
}
```

### Equals

The `Equals` symbol allows custom equality checks for the `=` operator:

```ts
class CaseInsensitiveString {
    #value: string;
    [TrhSymbols.Equals] = (other: unknown) => typeof other === "string" && this.#value.toLowerCase() === other.toLowerCase();
}
```

### Contains

The `Contains` symbol allows custom types to work with the `#` (has) operator:

```ts
class TagBag {
    #tags: string[];
    [TrhSymbols.Contains] = (tag: string) => this.#tags.includes(tag);
}

// Now works in predicates:
db.where(($) => [$("tags"), "#", "important"]);
```

### TypeOf

The `TypeOf` symbol allows custom type strings for the `:` operator:

```ts
class Money {
    [TrhSymbols.TypeOf] = "money";
}

// Matches: [$("payment"), ":", "money"]
```
