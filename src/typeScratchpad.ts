import { CollectionDB } from "./db/collectionDB";

type GraphNodeSelector<N, L> = any; // lens-like interface for selecting nodes in a graph
type GraphNodeLens<N, L> = any; // lens-like interface for selecting node(s) properties in a graph
type GraphLinkSelector<N, L> = any; // lens-like interface for selecting links in a graph
type GraphLinkLens<N, L> = any; // lens-like interface for link(s) properties in a graph

type TreeSelector<D> = any; // lens-like interface for selecting members(s) in a tree
type TreeLens<D> = any; // lens-like interface for selecting members or properties thereof in a tree

//#region Collection

type CollectionSelector<D> = any; // lens-like interface for selecting a document in a collection
type CollectionLens<D> = any; // lens-like interface for selecting a document or some property therein

type TestPayload =
    | {
          name: string;
          type: "alpha";
          age: number;
          roles: string[];
          address: { city: string; zip: string };
          related: string[];
          references: {
              name: string;
              age: number;
          }[];
      }
    | {
          name: string;
          type: "bravo";
          value: number;
      };

declare const treeSel: TreeSelect<TestPayload>;

const t0a = treeSel(($) => $.roots.where($.ID, "=", "abc123").deepDescendants.where("age", ">", 4));

const t1b = treeSel(($) => $.roots.where($.ID, "=", "abc123")); // new: symbol meta token

const t2b = treeSel(($) => $.roots.where("type", "=", "alpha")); // new: bare key

const t3b = treeSel(($) => $.roots.where($.CHILDREN, "#>", 3)); // new: symbol + numerify

const i1b = treeSel(($) => $.roots.where("type", "=", "alpha"));

const i2a = treeSel(($) => $.allDeep.where($.ID, "=|", ["abc123", "123abc"]));

// select all roots that are among of any item's related array
const i3a = treeSel(($) => $.roots.where($.ID, "=|", $.allDeep("related")("*"))); // Wildcard needed in order to flatten the array

// select all nodes who'se related references a root item
const i4a = treeSel(($) => $.allDeep.where("related", "?|", $.roots.ID)); // ?? how do I get IDs out from a selector/lens?

// select all nodes that has a related who'se size is greater it's age...
const i5a = treeSel(($) => $.allDeep.where("related", "#>", (_) => _("age")));

//#endregion

// ═══════════════════════════════════════════════════════════════
// Predicate Operator Catalog
// ═══════════════════════════════════════════════════════════════

/*

## Base Operators

| Op    | Meaning                       | Operand              | ! (negate) | \| (any of) | !\| (not in) | & (all of)  | !& (not all of) |
| ----- | ----------------------------- | -------------------- | ---------- | ----------- | ------------ | ----------- | --------------- |
| `=`   | equals                        | T                    | y `!=`     | y `=\|`     | y `!=\|`     | n           | n               |
| `==`  | strict equals                 | T                    | y `!==`    | n           | n            | n           | n               |
| `>`   | greater than                  | T (number \| string) | y `!>`     | y `>\|`     | y `!>\|`     | n           | n               |
| `>=`  | greater than or equal         | T (number \| string) | y `!>=`    | y `>=\|`    | y `!>=\|`    | n           | n               |
| `<`   | less than                     | T (number \| string) | y `!<`     | y `<\|`     | y `!<\|`     | n           | n               |
| `<=`  | less than or equal            | T (number \| string) | y `!<=`    | y `<=\|`    | y `!<=\|`    | n           | n               |
| `?`   | array contains element        | element of T         | y `!?`     | y `?\|`     | y `!?\|`     | y `?&`      | y `!?&`         |
| `%`   | string includes (insensitive) | string               | y `!%`     | y `%\|`     | y `!%\|`     | y `%&`      | y `!%&`         |
| `%^`  | string includes (sensitive)   | string               | y `!%^`    | y `%^\|`    | y `!%^\|`    | y `%^&`     | y `!%^&`        |
| `%_`  | starts with (insensitive)     | string               | y `!%_`    | y `%_\|`    | y `!%_\|`    | n           | n               |
| `%^_` | starts with (sensitive)       | string               | y `!%^_`   | y `%^_\|`   | y `!%^_\|`   | n           | n               |
| `_%`  | ends with (insensitive)       | string               | y `!_%`    | y `_%\|`    | y `!_%\|`    | n           | n               |
| `_%^` | ends with (sensitive)         | string               | y `!_%^`   | y `_%^\|`   | y `!_%^\|`   | n           | n               |
| `~`   | regex match                   | RegExp               | y `!~`     | y `~\|`     | y `!~\|`     | y `~&`      | y `!~&`         |
| `:`   | typeof check                  | TypeDescriptor       | y `!:`     | y `:\|`     | y `!:\|`     | n           | n               |
| `>=<` | in range inclusive [a,b]       | [T, T]               | y `!>=<`   | n           | n            | n           | n               |
| `><`  | in range exclusive (a,b)       | [T, T]               | y `!><`    | n           | n            | n           | n               |

## Numerify Operators (`#` prefix — size comparison)

Operand is always `number` (or `[number, number]` for ranges).
Gated to sizable types: string (length), array (element count), object (key count).
Non-sizable types resolve to `never`, blocking usage at compile time.

| Op      | Meaning             | Operand          |
| ------- | ------------------- | ---------------- |
| `#=`    | size equals         | number           |
| `!#=`   | size not equals     | number           |
| `#>`    | size greater than   | number           |
| `!#>`   | size not greater    | number           |
| `#>=`   | size >=             | number           |
| `!#>=`  | size not >=         | number           |
| `#<`    | size less than      | number           |
| `!#<`   | size not less       | number           |
| `#<=`   | size <=             | number           |
| `!#<=`  | size not <=         | number           |
| `#>=<`  | size in range [a,b] | [number, number] |
| `!#>=<` | size not in range   | [number, number] |
| `#><`   | size in range (a,b) | [number, number] |
| `!#><`  | size not in range   | [number, number] |

*/

// ═══════════════════════════════════════════════════════════════
// Areas of improvement
// ═══════════════════════════════════════════════════════════════

/*

I'm not convinced that top level $.intersect, $.union, and $.exclude should always take in selectors. I think if you're in a situation where you need a selector, sure, but if you're in a situation where you can have a lens, then why can't you union two lenses?
This might be a thing we defer

*/

// ═══════════════════════════════════════════════════════════════
// Lens/Selector System — Type Sketch v2 (Tree-first)
// ═══════════════════════════════════════════════════════════════
//
// Design principles:
//   1. Every chain step is a valid query endpoint (no mandatory terminal call)
//   2. $("prop") auto-unwraps into item.data.prop
//   3. $.roots, .children, .parent etc. for structural navigation
//   4. $.ID, $.PARENT, $.CHILDREN, $.DEPTH as symbol meta tokens for structural fields
//   5. Mode tracking: "single" | "multi" flows through the chain
//   6. Kind tracking: "items" | "data" — Selector targets items, Lens targets data
//      Selector = "which items?" — used by pluck, splice, prune, trim, move
//      Lens = "what property?" — used by select (projection), update (targeted mutation)
//      A selector's .where() CAN use a lens as a predicate target
//   7. Array-typed data gets its own chain (TreeDataArrayChain) with element-level ops

import type { TreeItemOf, Updater } from "./types";

// #region ─── Core ─────────────────────────────────────────────

type Mode = "single" | "multi";
type Kind = "items" | "data";

/** Single symbol key hides brand from intellisense */
declare const QueryBrand: unique symbol;

/**
 * Every chain step extends this, making it a valid query endpoint.
 * select()/update()/pluck() accept things matching this shape.
 * Brand is a single symbol-keyed property to minimize intellisense noise.
 */
interface Queryable<T, M extends Mode, K extends Kind = "items"> {
    readonly [QueryBrand]: { type: T; mode: M; kind: K };
}

/** Routes to TreeDataArrayChain when V is an array, TreeDataChain otherwise */
type DataChainFor<D, V, M extends Mode> = V extends readonly unknown[] ? TreeDataArrayChain<D, V, M> : TreeDataChain<D, V, M>;

// #endregion
// #region ─── Predicates ───────────────────────────────────────

/** All string keys across all union members (not just common keys) */
type AllStringKeys<T> = T extends unknown ? Extract<keyof T, string> : never;

/** Safe property lookup — distributes over union, resolves from variants that have K */
type SafeLookup<T, K extends string> = T extends unknown ? (K extends keyof T ? T[K] : never) : never;

// ─── Structural Meta Tokens ─────────────────────────────────

/** Unique symbol tokens for structural metadata — collision-free with data keys */
declare const META_ID: unique symbol;
declare const META_PARENT: unique symbol;
declare const META_CHILDREN: unique symbol;
declare const META_DEPTH: unique symbol;

/** Maps each meta token symbol to its resolved value type */
type MetaTokenMap = {
    [META_ID]: string;
    [META_PARENT]: string | null;
    [META_CHILDREN]: string[];
    [META_DEPTH]: number;
};

/** Union of all meta token symbols */
type MetaToken = keyof MetaTokenMap;

// ─── Field Types ────────────────────────────────────────────

/** Element-level predicate field: "@" for element itself, bare keys for object element properties */
type ElementPredField<E> = "@" | (E extends readonly unknown[] ? never : E extends Record<string, unknown> ? AllStringKeys<E> : never);

/** Hierarchical type descriptor for the `:` operator */
// prettier-ignore
type TypeDescriptor =
    | "string"
    | "number" | "number/nan" | "number/infinity"
    | "boolean"
    | "bigint"
    | "symbol"
    | "function"
    | "nullish" | "nullish/null" | "nullish/undefined"
    | "object" | "object/array" | "object/date" | "object/regexp" | "object/set" | "object/map";

// ─── Operator Union ─────────────────────────────────────────
// ~86 concrete operators. See Predicate Operator Catalog for full table.

/** All valid predicate operators */
// prettier-ignore
type CompOp =
    // ── Equality ──
    | "=" | "!="                                    // loose equality
    | "=|" | "!=|"                                  // loose equality, any-of
    | "==" | "!=="                                  // strict equality
    // ── Ordered comparison ──
    | ">" | "!>" | ">=" | "!>="                     // greater than (or equal)
    | "<" | "!<" | "<=" | "!<="                     // less than (or equal)
    | ">|" | "!>|" | ">=|" | "!>=|"                 // greater than, any-of
    | "<|" | "!<|" | "<=|" | "!<=|"                 // less than, any-of
    // ── Range ──
    | ">=<" | "!>=<"                                // inclusive range [a, b]
    | "><" | "!><"                                  // exclusive range (a, b)
    // ── Contains (array element) ──
    | "?" | "!?"                                    // contains element
    | "?|" | "!?|"                                  // contains any-of
    | "?&" | "!?&"                                  // contains all-of
    // ── Numerify (size comparison) ──
    | "#=" | "!#="                                  // size equals
    | "#>" | "!#>" | "#>=" | "!#>="                 // size greater than (or equal)
    | "#<" | "!#<" | "#<=" | "!#<="                 // size less than (or equal)
    | "#>=<" | "!#>=<"                              // size in range inclusive
    | "#><" | "!#><"                                // size in range exclusive
    // ── String includes (case-insensitive) ──
    | "%" | "!%"                                    // includes substring
    | "%|" | "!%|"                                  // includes any-of
    | "%&" | "!%&"                                  // includes all-of
    // ── String includes (case-sensitive) ──
    | "%^" | "!%^"                                  // includes substring (sensitive)
    | "%^|" | "!%^|"                                // includes any-of (sensitive)
    | "%^&" | "!%^&"                                // includes all-of (sensitive)
    // ── Starts with ──
    | "%_" | "!%_"                                  // starts with (insensitive)
    | "%_|" | "!%_|"                                // starts with any-of (insensitive)
    | "%^_" | "!%^_"                                // starts with (sensitive)
    | "%^_|" | "!%^_|"                              // starts with any-of (sensitive)
    // ── Ends with ──
    | "_%" | "!_%"                                  // ends with (insensitive)
    | "_%|" | "!_%|"                                // ends with any-of (insensitive)
    | "_%^" | "!_%^"                                // ends with (sensitive)
    | "_%^|" | "!_%^|"                              // ends with any-of (sensitive)
    // ── Regex ──
    | "~" | "!~"                                    // regex match
    | "~|" | "!~|"                                  // matches any-of
    | "~&" | "!~&"                                  // matches all-of
    // ── Typeof ──
    | ":" | "!:"                                    // typeof check
    | ":|" | "!:|"; // typeof any-of

// ─── Field Resolution & Operand Typing ────────────────────────

/** Resolve a predicate field string to its value type (distributes over union T) */
type ResolveField<T, F extends string> = F extends "@"
    ? T // element self-reference (array chains)
    : SafeLookup<T, F>; // bare data key

/** For "?" operator: if field is array → element type */
type ContainsOperand<T> = T extends readonly (infer E)[] ? E : never;

/** Orderable types for comparison operators */
type Orderable<T> = T extends string | number ? T : never;

/** Gate: resolves to R if V is sizable (string, array, object), never otherwise */
type IfSizable<V, R> = V extends string | readonly unknown[] | Record<string, unknown> ? R : never;

/**
 * Core operand dispatch: given a resolved value type V and an operator Op,
 * compute the required operand type. Used by both field-based and sublens-based where().
 */
// prettier-ignore
type ValueOperandFor<V, Op extends string> =
    // ── Equality ──
    Op extends "=" | "!=" | "==" | "!=="                                                ? V :
    Op extends "=|" | "!=|"                                                              ? V[] :
    // ── Ordered comparison ──
    Op extends ">" | "!>" | ">=" | "!>=" | "<" | "!<" | "<=" | "!<="                    ? Orderable<V> :
    Op extends ">|" | "!>|" | ">=|" | "!>=|" | "<|" | "!<|" | "<=|" | "!<=|"            ? Orderable<V>[] :
    // ── Range ──
    Op extends ">=<" | "!>=<" | "><" | "!><"                                             ? [Orderable<V>, Orderable<V>] :
    // ── Contains (array element) ──
    Op extends "?" | "!?"                                                                ? ContainsOperand<V> :
    Op extends "?|" | "!?|" | "?&" | "!?&"                                              ? ContainsOperand<V>[] :
    // ── Numerify (size comparison) ──
    Op extends "#=" | "!#=" | "#>" | "!#>" | "#>=" | "!#>=" | "#<" | "!#<" | "#<=" | "!#<="
                                                                                         ? IfSizable<V, number> :
    Op extends "#>=<" | "!#>=<" | "#><" | "!#><"                                         ? IfSizable<V, [number, number]> :
    // ── String includes ──
    Op extends "%" | "!%" | "%^" | "!%^"                                                 ? string :
    Op extends "%|" | "!%|" | "%^|" | "!%^|" | "%&" | "!%&" | "%^&" | "!%^&"            ? string[] :
    // ── Starts with ──
    Op extends "%_" | "!%_" | "%^_" | "!%^_"                                            ? string :
    Op extends "%_|" | "!%_|" | "%^_|" | "!%^_|"                                        ? string[] :
    // ── Ends with ──
    Op extends "_%" | "!_%" | "_%^" | "!_%^"                                            ? string :
    Op extends "_%|" | "!_%|" | "_%^|" | "!_%^|"                                        ? string[] :
    // ── Regex ──
    Op extends "~" | "!~"                                                                ? RegExp :
    Op extends "~|" | "!~|" | "~&" | "!~&"                                              ? RegExp[] :
    // ── Typeof ──
    Op extends ":" | "!:"                                                                ? TypeDescriptor :
    Op extends ":|" | "!:|"                                                              ? TypeDescriptor[] :
    never;

/** Operand type for field-based predicates: resolves field first, then dispatches */
type OperandFor<T, F extends string, Op extends string> = ValueOperandFor<ResolveField<T, F>, Op>;

// ─── Helpers ──────────────────────────────────────────────────

/** Sort configuration */
interface SortConfig {
    direction?: "asc" | "desc";
    nullish?: "first" | "last";
}

/** Data field predicate tuple — distributes over data keys × operators */
type DataPredTuple<D> = {
    [F in AllStringKeys<D>]: {
        [Op in CompOp]: [field: F, op: Op, value: OperandFor<D, F, Op>];
    }[CompOp];
}[AllStringKeys<D>];

/** Meta token predicate tuple — distributes over meta tokens × operators */
type MetaPredTuple = {
    [F in MetaToken]: {
        [Op in CompOp]: [field: F, op: Op, value: ValueOperandFor<MetaTokenMap[F], Op>];
    }[CompOp];
}[MetaToken];

/** Combined predicate tuple for logic combinators */
type PredicateTuple<D> = DataPredTuple<D> | MetaPredTuple;

/** Logic expression — opaque token returned by LogicBuilder */
interface LogicExpr {
    readonly [QueryBrand]: "logic";
}

/** Builder for combining predicates with AND/OR/XOR */
interface LogicBuilder<D> {
    and(...predicates: (PredicateTuple<D> | LogicExpr)[]): LogicExpr;
    or(...predicates: (PredicateTuple<D> | LogicExpr)[]): LogicExpr;
    xor(...predicates: (PredicateTuple<D> | LogicExpr)[]): LogicExpr;
    not: {
        and(...predicates: (PredicateTuple<D> | LogicExpr)[]): LogicExpr;
        or(...predicates: (PredicateTuple<D> | LogicExpr)[]): LogicExpr;
        xor(...predicates: (PredicateTuple<D> | LogicExpr)[]): LogicExpr;
    };
}

// #endregion
// #region ─── Tree Selector (Item Chain) ───────────────────────

/**
 * Root $ builder for TreeDB.select($ => ...)
 * $ itself represents "all items" — select($ => $) returns everything.
 */
interface TreeLensRoot<D> extends Queryable<TreeItemOf<D>, "multi", "items"> {
    /** Data projection: $("name") → all items' data.name */
    <K extends AllStringKeys<D>>(key: K): DataChainFor<D, SafeLookup<D, K>, "multi">;

    /** Structural entry points */
    readonly roots: TreeItemChain<D, "multi">;
    readonly leaves: TreeItemChain<D, "multi">;
    readonly allWide: TreeItemChain<D, "multi">;
    readonly allDeep: TreeItemChain<D, "multi">;

    /** Set operations — combine selectors */
    union(...selectors: Queryable<TreeItemOf<D>, any, "items">[]): TreeItemChain<D, "multi">;
    intersect(...selectors: Queryable<TreeItemOf<D>, any, "items">[]): TreeItemChain<D, "multi">;
    exclude(...selectors: Queryable<TreeItemOf<D>, any, "items">[]): TreeItemChain<D, "multi">;

    /** Structural meta tokens (symbol-typed, collision-free with data keys) */
    readonly ID: typeof META_ID;
    readonly PARENT: typeof META_PARENT;
    readonly CHILDREN: typeof META_CHILDREN;
    readonly DEPTH: typeof META_DEPTH;
}

/**
 * Selector chain — operates on tree items.
 * Structural navigation, filtering, narrowing, and data projection.
 *
 * Multi-mode only methods return `never` in single mode.
 */
interface TreeItemChain<D, M extends Mode> extends Queryable<TreeItemOf<D>, M, "items"> {
    /** Project to data property — routes to array or scalar chain based on D[K] */
    <K extends AllStringKeys<D>>(key: K): DataChainFor<D, SafeLookup<D, K>, M>;

    /** Filter — ID equality auto-narrows to single (IDs are unique) */
    where(field: typeof META_ID, op: "=", value: string): TreeItemChain<D, "single">;
    /** Filter — meta token predicate (structural fields) */
    where<F extends MetaToken, Op extends CompOp>(field: F, op: Op, value: ValueOperandFor<MetaTokenMap[F], Op>): TreeItemChain<D, M>;
    /** Filter — sublens predicate for deep property access in where() */
    where<V, Op extends CompOp>(field: (sub: TreeDataChain<D, D, "single">) => Queryable<V, any, "data">, op: Op, value: ValueOperandFor<V, Op>): TreeItemChain<D, M>;
    /** Filter — logic combinator (OR, AND, XOR) */
    where(logic: (l: LogicBuilder<D>) => LogicExpr): TreeItemChain<D, M>;
    /** Filter — general data field predicate (chained .where().where() = implicit AND) */
    where<F extends AllStringKeys<D>, Op extends CompOp>(field: F, op: Op, value: OperandFor<D, F, Op>): TreeItemChain<D, M>;

    /** Narrow to single (multi-mode only) */
    first(): M extends "multi" ? TreeItemChain<D, "single"> : never;
    last(): M extends "multi" ? TreeItemChain<D, "single"> : never;
    at(index: number): M extends "multi" ? TreeItemChain<D, "single"> : never;

    /** Collection operations (multi-mode only) */
    sort(field: AllStringKeys<D> | MetaToken, config?: SortConfig): M extends "multi" ? TreeItemChain<D, "multi"> : never;
    distinct(field?: AllStringKeys<D> | MetaToken): M extends "multi" ? TreeItemChain<D, "multi"> : never;
    slice(start: number, end?: number): M extends "multi" ? TreeItemChain<D, "multi"> : never;

    /** Structural traversal */
    readonly children: TreeItemChain<D, "multi">;
    readonly parent: TreeItemChain<D, M>;
    readonly ancestors: TreeItemChain<D, "multi">;
    readonly wideDescendants: TreeItemChain<D, "multi">;
    readonly deepDescendants: TreeItemChain<D, "multi">;
    readonly siblings: TreeItemChain<D, "multi">;

    /** Terminals */
    count(): M extends "multi" ? Queryable<number, "single", "data"> : never;
    exists(): Queryable<boolean, "single", "data">;
}

// #endregion
// #region ─── Tree Lens (Data Chains) ──────────────────────────

/**
 * Lens chain for scalar (non-array) projected values.
 * After $("name") or $("address")("city").
 *
 * .where() here filters ITEMS (which items contribute values).
 * Item-level narrowing (first/last/at) should be done before projecting,
 * not here — these methods are not available on scalar data chains.
 */
interface TreeDataChain<D, V, M extends Mode> extends Queryable<V, M, "data"> {
    /** Drill into nested properties — routes to array chain if V[K] is an array */
    <K extends AllStringKeys<V>>(key: K): DataChainFor<D, SafeLookup<V, K>, M>;

    /** Filter — ID equality auto-narrows to single */
    where(field: typeof META_ID, op: "=", value: string): TreeDataChain<D, V, "single">;
    /** Filter — meta token predicate */
    where<F extends MetaToken, Op extends CompOp>(field: F, op: Op, value: ValueOperandFor<MetaTokenMap[F], Op>): TreeDataChain<D, V, M>;
    /** Filter — sublens predicate */
    where<SV, Op extends CompOp>(field: (sub: TreeDataChain<D, D, "single">) => Queryable<SV, any, "data">, op: Op, value: ValueOperandFor<SV, Op>): TreeDataChain<D, V, M>;
    /** Filter — logic combinator */
    where(logic: (l: LogicBuilder<D>) => LogicExpr): TreeDataChain<D, V, M>;
    /** Filter — general data field predicate */
    where<F extends AllStringKeys<D>, Op extends CompOp>(field: F, op: Op, value: OperandFor<D, F, Op>): TreeDataChain<D, V, M>;

    /** Count items contributing values (multi-mode only) */
    count(): M extends "multi" ? Queryable<number, "single", "data"> : never;

    /** Measure value: string length, object key count (gated to sizable types) */
    size(): V extends string | Record<string, unknown> ? Queryable<number, M, "data"> : never;
}

/**
 * Lens chain for array-typed projected values.
 * After $("roles") where roles: string[], or $("tags") where tags: {name:string}[].
 *
 * All operations target array ELEMENTS, not tree items.
 * Item-level filtering should be done before projecting into the array.
 * M (item-level mode) is preserved through element operations.
 */
interface TreeDataArrayChain<D, V extends readonly unknown[], M extends Mode> extends Queryable<V, M, "data"> {
    /** Index access: ("roles")(0) → first role per item */
    (index: number): DataChainFor<D, V[number], M>;

    /** Wildcard: ("roles")("*") → all elements, forces multi */
    <W extends "*">(wildcard: W): DataChainFor<D, V[number], "multi">;

    /** Element narrowing — picks one element per item, preserves item-level mode */
    first(): DataChainFor<D, V[number], M>;
    last(): DataChainFor<D, V[number], M>;
    at(index: number): DataChainFor<D, V[number], M>;

    /** Element filtering — predicate targets array elements, not tree items */
    where<F extends ElementPredField<V[number]>, Op extends CompOp>(field: F, op: Op, value: OperandFor<V[number], F, Op>): TreeDataArrayChain<D, V, M>;

    /** Element collection ops */
    sort(field: ElementPredField<V[number]>, config?: SortConfig): TreeDataArrayChain<D, V, M>;
    slice(start: number, end?: number): TreeDataArrayChain<D, V, M>;
    distinct(field?: ElementPredField<V[number]>): TreeDataArrayChain<D, V, M>;

    /** Measure array: element count per item */
    size(): Queryable<number, M, "data">;
}

// #endregion
// #region ─── DB Integration ───────────────────────────────────

type SelectResult<T, M extends Mode> = M extends "single" ? T : T[];

/** select() — accepts both selectors (items) and lenses (data) */
type TreeSelect<D> = <T, M extends Mode, K extends Kind>(builder: ($: TreeLensRoot<D>) => Queryable<T, M, K>) => SelectResult<T, M>;

/** update() — Kind determines updater type */
type TreeUpdate<D> = {
    /** Lens update: updater targets the projected property type V */
    <V, M extends Mode>(query: ($: TreeLensRoot<D>) => Queryable<V, M, "data">, updater: Updater<V, TreeItemOf<D>>): void;
    /** Selector update: updater targets the whole data D */
    <M extends Mode>(query: ($: TreeLensRoot<D>) => Queryable<TreeItemOf<D>, M, "items">, updater: Updater<D, TreeItemOf<D>>): void;
};

/** pluck/splice/prune/trim — selectors only (Kind must be "items") */
type TreePluck<D> = <M extends Mode>(query: ($: TreeLensRoot<D>) => Queryable<TreeItemOf<D>, M, "items">) => void;

// #endregion
// #region ─── Usage Tests ──────────────────────────────────────

type Sample = {
    age: number;
    name: string;
    status: string;
    roles: string[];
    address: { city: string; zip: string };
    tags: { label: string; priority: number }[];
};

declare const treeSelect: TreeSelect<Sample>;

// ── Structural (selectors — return items) ──
const a1 = treeSelect(($) => $); // TreeItemOf<Sample>[]
const a2 = treeSelect(($) => $.roots); // TreeItemOf<Sample>[]
const a3 = treeSelect(($) => $.roots.where("age", ">", 18)); // TreeItemOf<Sample>[]
const a4 = treeSelect(($) => $.roots.children); // TreeItemOf<Sample>[]
const a5 = treeSelect(($) => $.roots.first()); // TreeItemOf<Sample>
const a6 = treeSelect(($) => $.allWide); // TreeItemOf<Sample>[] (BFS)
const a7 = treeSelect(($) => $.allDeep); // TreeItemOf<Sample>[] (DFS)

// ── Set operations ──
const a8 = treeSelect(($) => $.union($.roots.where("roles", "?", "admin"), $.roots.where("age", ">", 20)));
const a9 = treeSelect(($) => $.intersect($.roots.where("roles", "?", "admin"), $.roots.where("age", ">", 20)));
const a10 = treeSelect(($) => $.exclude($.allWide, $.leaves));

// ── BFS/DFS descendants ──
const a11 = treeSelect(($) => $.roots.wideDescendants);
const a12 = treeSelect(($) => $.roots.deepDescendants);

// ── Scalar data projection (lenses — return values) ──
const b1 = treeSelect(($) => $("name")); // string[]
const b2 = treeSelect(($) => $("address")("city")); // string[]
const b3 = treeSelect(($) => $("age").where("name", "=", "Alice")); // number[]
const b4 = treeSelect(($) => $.roots.first()("name")); // string

// ── Mixed: structural nav → data projection ──
const c1 = treeSelect(($) => $.roots("name")); // string[]
const c2 = treeSelect(($) => $.roots.where("age", ">", 18)("name")); // string[]
const c3 = treeSelect(($) => $.roots.children.first()("status")); // string

// ── Array data projection (array lens) ──
const h1 = treeSelect(($) => $("roles")); // string[][]
const h2 = treeSelect(($) => $("roles")(0)); // string[]
const h3 = treeSelect(($) => $("roles")("*")); // string[]
const h4 = treeSelect(($) => $("roles").first()); // string[]
const h5 = treeSelect(($) => $("roles").where("@", "=", "admin")); // string[][] (filtered)
const h6 = treeSelect(($) => $("roles").sort("@")); // string[][] (sorted)

// ── Object array projection ──
const h7 = treeSelect(($) => $("tags").where("priority", ">", 5)); // filtered
const h8 = treeSelect(($) => $("tags").first()("label")); // string[]
const h9 = treeSelect(($) => $("tags")("*")("label")); // string[]

// ── Array after single-item narrowing ──
const h10 = treeSelect(($) => $.roots.first()("roles")); // string[]
const h11 = treeSelect(($) => $.roots.first()("roles")(0)); // string
const h12 = treeSelect(($) => $.roots.first()("roles")("*")); // string[]

// ── ID equality auto-narrows (symbol meta token) ──
const d1 = treeSelect(($) => $("age").where($.ID, "=", "xyz")); // number (single!)
const d2 = treeSelect(($) => $.roots.where($.ID, "=", "abc")); // TreeItemOf<Sample> (single!)

// ── The original test case ──
const d3 = treeSelect(
    ($) => $.roots.where("roles", "?", "admin").children.where($.ID, "=", "abc123")("roles")(0), // string
);

// ── Sublens predicates ──
const d4 = treeSelect(($) => $.roots.where((sub) => sub("address")("city"), "=", "NYC"));

// ── Logic combinators ──
const d5 = treeSelect(($) => $.roots.where((l) => l.or(["age", ">", 18], ["status", "=", "admin"])));

// ── Collection operations ──
const g1 = treeSelect(($) => $.roots.sort("age", { direction: "desc" }));
const g2 = treeSelect(($) => $.leaves.parent.distinct());
const g3 = treeSelect(($) => $.roots.children.slice(0, 5));

// ── Typed operand enforcement ──
const e1 = treeSelect(($) => $.roots.where("age", ">", 18)); // ✓ number > number
const e2 = treeSelect(($) => $.roots.where("name", "=", "Alice")); // ✓ string = string
const e3 = treeSelect(($) => $.roots.where("roles", "?", "admin")); // ✓ string[] contains string
const e4 = treeSelect(($) => $.roots.where("name", "~", /^A/)); // ✓ regex match
const e5 = treeSelect(($) => $.roots.where("name", "%^_", "Al")); // ✓ starts with (sensitive)
const e6 = treeSelect(($) => $("name").where("age", "<=", 30)); // ✓ number <= number on data chain
const e7 = treeSelect(($) => $("tags").where("priority", ">", 5)); // ✓ element field
const e8 = treeSelect(($) => $("tags").where("label", "=", "urgent")); // ✓ element field

// @ts-expect-error — ✗ number is not string (name is string, can't compare with number)
const f1 = treeSelect(($) => $.roots.where("name", ">", 42));
// @ts-expect-error — ✗ string[] is not orderable (roles is string[], can't use >)
const f2 = treeSelect(($) => $.roots.where("roles", ">", "admin"));
// @ts-expect-error — ✗ contains on number (age is number, ? needs array)
const f3 = treeSelect(($) => $.roots.where("age", "?", 5));

// ── New operator categories ──
const e10 = treeSelect(($) => $.roots.where("name", "=|", ["Alice", "Bob"])); // ✓ equality any-of
const e11 = treeSelect(($) => $.roots.where("age", ">=<", [18, 65])); // ✓ inclusive range
const e12 = treeSelect(($) => $.roots.where("name", "%", "ali")); // ✓ string includes
const e13 = treeSelect(($) => $.roots.where("name", "%|", ["ali", "bob"])); // ✓ includes any-of
const e14 = treeSelect(($) => $.roots.where("name", "%&", ["hello", "world"])); // ✓ includes all-of
const e15 = treeSelect(($) => $.roots.where("name", "_%", "son")); // ✓ ends with
const e16 = treeSelect(($) => $.roots.where("roles", "?|", ["admin", "mod"])); // ✓ contains any-of
const e17 = treeSelect(($) => $.roots.where("roles", "?&", ["admin", "mod"])); // ✓ contains all-of
const e18 = treeSelect(($) => $.roots.where("age", ":", "number")); // ✓ typeof check
const e19 = treeSelect(($) => $.roots.where("name", ":|", ["string", "nullish"])); // ✓ typeof any-of
const e20 = treeSelect(($) => $.roots.where("name", "~|", [/^A/, /^B/])); // ✓ regex any-of
const e21 = treeSelect(($) => $.roots.where("name", "==", "Alice")); // ✓ strict equality
const e22 = treeSelect(($) => $.roots.where("name", "!=|", ["Alice", "Bob"])); // ✓ not-in

// @ts-expect-error — ✗ range needs [number, number], not single number
const f5 = treeSelect(($) => $.roots.where("age", ">=<", 18));
// @ts-expect-error — ✗ typeof operand must be TypeDescriptor, not arbitrary string
const f6 = treeSelect(($) => $.roots.where("age", ":", "banana"));
// @ts-expect-error — ✗ any-of needs array, not single value
const f7 = treeSelect(($) => $.roots.where("name", "=|", "Alice"));
// @ts-expect-error — ✗ contains on number field (age is number, ? needs array)
const f8 = treeSelect(($) => $.roots.where("age", "?|", [1, 2]));

// ── Typed logic combinator predicates ──
const e9 = treeSelect(($) => $.roots.where((l) => l.or(["age", ">", 18], ["name", "=", "Bob"])));
// @ts-expect-error — ✗ string not assignable to number (age requires number for >)
const f4 = treeSelect(($) => $.roots.where((l) => l.and(["age", ">", "old"])));

// ── Meta token predicates ──
const m1 = treeSelect(($) => $.roots.where($.DEPTH, ">", 3)); // ✓ depth > 3
const m2 = treeSelect(($) => $.roots.where($.PARENT, "=", null)); // ✓ is root (parent is null)
const m3 = treeSelect(($) => $.roots.where($.CHILDREN, "#>", 3)); // ✓ more than 3 children
const m4 = treeSelect(($) => $.roots.where($.CHILDREN, "#=", 0)); // ✓ is leaf (0 children)
const m5 = treeSelect(($) => $.roots.where($.CHILDREN, "?", "abc123")); // ✓ children contains ID
const m6 = treeSelect(($) => $.roots.where($.CHILDREN, "#>=<", [2, 5])); // ✓ 2-5 children

// ── Numerify operators on data fields ──
const n1 = treeSelect(($) => $.roots.where("roles", "#>", 3)); // ✓ more than 3 roles
const n2 = treeSelect(($) => $.roots.where("name", "#>=<", [3, 20])); // ✓ name 3-20 chars
const n3 = treeSelect(($) => $.roots.where("address", "#>", 1)); // ✓ address with >1 key

// @ts-expect-error — ✗ number is not sizable (age is number, #> needs string/array/object)
const n4 = treeSelect(($) => $.roots.where("age", "#>", 5));

// ── .size() — value measurement (projection terminal, still useful) ──
const s1 = treeSelect(($) => $("roles").size()); // ✓ number[] — array element count per item
const s2 = treeSelect(($) => $("name").size()); // ✓ number[] — string length per item
const s3 = treeSelect(($) => $("address").size()); // ✓ number[] — object key count per item
const s4 = treeSelect(($) => $.roots.first()("roles").size()); // ✓ number — single item's array size
const s5 = treeSelect(($) => $.roots.first()("name").size()); // ✓ number — single item's name length

// ── .size() in sublens predicates (still works, but #> is simpler for where()) ──
const s6 = treeSelect(($) => $.roots.where((sub) => sub("roles").size(), ">", 3));
const s7 = treeSelect(($) => $.roots.where((sub) => sub("name").size(), ">=<", [3, 20]));

// .size() on non-sizable type returns never — blocks downstream but call itself is valid.
const s9 = treeSelect(($) => $("age").size()); // never[]

// #endregion
// #region ─── Design Decisions ─────────────────────────────────

// D1: Selector = "which items?" — Lens = "what property?"
//     A selector's .where() can use a lens as a predicate (sublens predicates).

// D2: Two data chain types: TreeDataChain (scalar V) and TreeDataArrayChain (array V)
//     DataChainFor<D,V,M> routes automatically based on whether V is an array.

// D3: BFS/DFS explicit — wideDescendants (BFS), deepDescendants (DFS).

// D4: Set operations — $.union(), $.intersect(), $.exclude() combine selectors.

// D5: Brand hidden via symbol key — single [QueryBrand] property.

// D6: Item-level narrowing (first/last/at) in TreeItemChain, NOT in scalar TreeDataChain.
//     "Narrow items first, then project."

// D7: .parent skips roots. No dedup — use .parent.distinct().

// D8: $.ID equality auto-narrows to single mode via where overload.

// D9: Logic combinators via .where(l => l.or(...)). Chained .where().where() = implicit AND.

// D10: Typed operand enforcement via ResolveField + OperandFor.
//      Invalid combos resolve to never, preventing misuse at compile time.

// D11: Operator catalog — ~86 explicit operators.
//      Contains: ? (was #). Numerify: # prefix on comparison ops.
//      Modifiers: ! (negate), | (any-of), & (all-of) — all enumerated explicitly.

// D12: ValueOperandFor<V, Op> — two-layer operand dispatch.
//      Core dispatch takes resolved value V + operator Op directly.
//      OperandFor<T, F, Op> wraps it: resolves field F on T, then delegates.

// D13: .size() = value measurement (projection terminal), .count() = query cardinality.
//      # numerify operators = inline size comparison in where() predicates.
//      .size() still useful for projecting sizes as data values.

// D14: Bare data keys — where("age", ">", 18) not where("@.age", ">", 18).
//      No @. prefix needed. "@" reserved only for element self-reference in array chains.

// D15: Symbol meta tokens — $.ID, $.PARENT, $.CHILDREN, $.DEPTH.
//      Unique symbol types, collision-free with any data key.
//      Resolved via MetaTokenMap in dedicated where() overload.
//      isRoot/isLeaf dropped — derivable: $.PARENT ":" "nullish", $.CHILDREN "#=" 0.

// D16: Discriminated union support — AllStringKeys<D> + SafeLookup<D, K> distribute over union members.
//      All variant keys are accessible; resolution yields the union of types from variants that have the key.

// #endregion
// #region ─── Remaining Questions ──────────────────────────────

// RQ1: RESOLVED → D11. ? for contains, # for numerify. ~86 enumerated operators.

// RQ2: Should TreeDataArrayChain.where() support sublens and logic builder overloads?
//      Currently only has element-level field predicates.

// RQ3: How should nested arrays work? e.g., D = { matrix: number[][] }
//      $("matrix")(0) → number[] → TreeDataArrayChain again. Seems to work naturally.

// RQ4: RESOLVED → D13. .count() = query cardinality. .size() = value measurement.
//      # numerify operators subsume sublens .size() for where() predicates.

// RQ5: Set operations — should $.union/intersect/exclude accept lenses too?
//      Deferred. Currently typed for items only.

// #endregion
