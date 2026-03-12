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
              subObject: {
                  someNumber: number;
                  someString: string;
              };
          }[];
      }
    | {
          name: string;
          type: "bravo";
          value: number;
      };

declare const treeSel: TreeSelect<TestPayload>;
declare const treeUpd: TreeUpdate<TestPayload>;
declare const treeRem: TreePluck<TestPayload>;

const t0a = treeSel(($) => $.roots.where($.ID, "=", "abc123").deepDescendants.where("age", ">", 4));

const t1b = treeSel(($) => $.roots.where($.ID, "=", "abc123")); // new: symbol meta token

const t2b = treeSel(($) => $.roots.where("type", "=", "alpha")); // new: bare key

const t3b = treeSel(($) => $.roots.where($.CHILDREN, "#>", 3)); // new: symbol + numerify

const i1b = treeSel(($) => $.roots.where("type", "=", "alpha"));

const i2a = treeSel(($) => $.allDeep.where($.ID, "=|", ["abc123", "123abc"]));

// select all roots that are among of any item's related array
const i3a = treeSel(($) => $.roots.where($.ID, "=|", $.allDeep("related")("*"))); // Wildcard needed in order to flatten the array

// select all nodes who'se related references a root item
const i4a = treeSel(($) => $.allDeep.where("related", "?|", $.roots.ID)); // projection terminal .ID on item chain

// select all nodes that has a related who'se size is greater it's age...
const i5a = treeSel(($) => $.allDeep.where("related", "#>", (_) => _("age")));

// select items whose name matches one of their own related values (self-ref sublens operand)
const i6a = treeSel(($) => $.allDeep.where("name", "=|", (_) => _("related")));

const i8a = treeSel((Q) => Q.allDeep.where(($) => $("address")("city"), "%", "new"));

const i9a = treeSel((Q) => Q.allDeep.where(($) => $.or($("age", ">=", 4), $("type", "=", "bravo"))));

const i9b = treeSel((Q) =>
    Q.allDeep.where(($) =>
        $.or(
            $.and($("name", "#>", 3)),
            $((_) => _("address")("city"), "%", "new"),
            $("name", "=", "Alice"),
        ),
    ),
);

const r1a = treeRem((Q) => {
    return Q.allDeep.where(Q.CHILDREN, "#=", 0);
});

const r1b = treeRem((Q) => {
    return Q.allDeep.where(Q.CHILDREN, "#=", 0).ancestors.where(Q.ID, "=", "abc123");
});

const u1a = treeUpd(
    (Q) => {
        return Q.allDeep.where(Q.CHILDREN, "#=", 0)("roles");
    },
    (prev, ctx) => prev,
);

const u1b = treeUpd(
    (Q) => {
        return Q.allDeep.where(Q.CHILDREN, "#=", 0);
    },
    (prev, ctx) => prev,
);

//oddly, this works... though, we might need to think about ctx some more....
const u1c = treeUpd(
    (Q) => {
        return Q.allDeep.where(Q.CHILDREN, "#=", 0)("roles")("*");
    },
    (prev, ctx) => prev, // interesting...
);

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
// Lens/Selector System — Type Sketch v2 (Tree-first)
// ═══════════════════════════════════════════════════════════════
//
// Design principles:
//   1. Every chain step is a valid query endpoint (no mandatory terminal call)
//   2. $("prop") auto-unwraps into item.data.prop
//   3. $.roots, .children, .parent etc. for structural navigation
//   4. $.ID, $.PARENT, $.CHILDREN, $.DEPTH as symbol meta tokens for structural fields
//   5. Mode tracking: "single" | "multi" flows through the chain
//   6. Kind tracking: "items" | "data" — three-tier hierarchy:
//      Targetter = "which items?" — used by pluck, splice, prune, trim, move
//      Pather = Targetter + pure field navigation — used by update
//      Lens = full query + data chains with where/sort/slice — used by select
//      TreeTargetRoot / TreeUpdateRoot / TreeLensRoot
//   7. Array-typed data gets its own chain (TreeDataArrayChain) with element-level ops

import type { TreeItemOf, Updater } from "./types";

// #region ─── Core ─────────────────────────────────────────────

type Mode = "single" | "multi";
type Kind = "items" | "data";
type ChainContext = "lens" | "target" | "pather";

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

/** Routes to TreePatherArrayChain when V is an array, TreePatherChain otherwise */
type PatherChainFor<D, V, M extends Mode> = V extends readonly unknown[] ? TreePatherArrayChain<D, V, M> : TreePatherChain<D, V, M>;

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

/**
 * Acceptable operand forms for where() value position.
 * - Literal: direct value (existing behavior)
 * - Single queryable: Queryable<V, "single", "data"> — computed value from another chain
 * - Multi queryable: Queryable<E, "multi", "data"> — only for set operators (where V = E[])
 * - Self-ref sublens: callback returning Queryable<V, "single", "data"> — compare against own fields
 */
// prettier-ignore
type WhereOperand<V, D> =
    | V                                                                    // literal value
    | Queryable<V, "single", "data">                                       // single-mode queryable
    | (V extends readonly (infer E)[]                                      // multi-mode queryable (set ops only)
        ? (number extends V["length"] ? Queryable<E, "multi", "data"> : never)
        : never)
    | ((sub: TreeDataChain<D, D, "single">) => Queryable<V, "single", "data">); // self-ref sublens

// ─── Helpers ──────────────────────────────────────────────────

/** Sort configuration */
interface SortConfig {
    direction?: "asc" | "desc";
    nullish?: "first" | "last";
}

/** Logic expression — opaque token returned by LogicBuilder */
interface LogicExpr {
    readonly [QueryBrand]: "logic";
}

/** Builder for combining predicates with AND/OR/XOR — also callable as predicate factory */
interface LogicBuilder<D> {
    /** Predicate factory — bare data key */
    <F extends AllStringKeys<D>, Op extends CompOp>(field: F, op: Op, value: WhereOperand<OperandFor<D, F, Op>, D>): LogicExpr;
    /** Predicate factory — meta token */
    <F extends MetaToken, Op extends CompOp>(field: F, op: Op, value: WhereOperand<ValueOperandFor<MetaTokenMap[F], Op>, D>): LogicExpr;
    /** Predicate factory — sublens for deep property access */
    <V, Op extends CompOp>(field: (sub: TreeDataChain<D, D, "single">) => Queryable<V, any, "data">, op: Op, value: WhereOperand<ValueOperandFor<V, Op>, D>): LogicExpr;

    /** Combinators */
    and(...predicates: LogicExpr[]): LogicExpr;
    or(...predicates: LogicExpr[]): LogicExpr;
    xor(...predicates: LogicExpr[]): LogicExpr;
    not: {
        and(...predicates: LogicExpr[]): LogicExpr;
        or(...predicates: LogicExpr[]): LogicExpr;
        xor(...predicates: LogicExpr[]): LogicExpr;
    };
}

// #endregion
// #region ─── Tree Selector (Item Chain) ───────────────────────

/** Resolves to lens, pather, or target item chain based on context */
type ItemChainFor<D, M extends Mode, C extends ChainContext> = C extends "lens" ? TreeItemChain<D, M> : C extends "pather" ? TreePatherItemChain<D, M> : TreeTargetItemChain<D, M>;

/**
 * Root base — shared structural entry points, parameterized by ChainContext.
 * Target roots return TreeTargetItemChain (no data projection).
 * Lens roots return TreeItemChain (callable for data projection).
 */
interface TreeRootBase<D, C extends ChainContext> extends Queryable<TreeItemOf<D>, "multi", "items"> {
    /** Direct ID lookup — single ID narrows to single, multiple IDs stay multi */
    of(id: string): ItemChainFor<D, "single", C>;
    of(...ids: string[]): ItemChainFor<D, "multi", C>;

    /** Structural entry points */
    readonly roots: ItemChainFor<D, "multi", C>;
    readonly leaves: ItemChainFor<D, "multi", C>;
    readonly allWide: ItemChainFor<D, "multi", C>;
    readonly allDeep: ItemChainFor<D, "multi", C>;

    /** Set operations */
    union(...selectors: Queryable<TreeItemOf<D>, any, "items">[]): ItemChainFor<D, "multi", C>;
    intersect(...selectors: Queryable<TreeItemOf<D>, any, "items">[]): ItemChainFor<D, "multi", C>;
    exclude(...selectors: Queryable<TreeItemOf<D>, any, "items">[]): ItemChainFor<D, "multi", C>;

    /** Structural meta tokens (symbol-typed, collision-free with data keys) */
    readonly ID: typeof META_ID;
    readonly PARENT: typeof META_PARENT;
    readonly CHILDREN: typeof META_CHILDREN;
    readonly DEPTH: typeof META_DEPTH;
}

/**
 * Targetter root — no data projection ($("field")).
 * Used by pluck, splice, prune, trim, move.
 */
interface TreeTargetRoot<D> extends TreeRootBase<D, "target"> {}

/**
 * Lens root — adds data projection ($("name") → data chain).
 * Used by select (full query + projection capabilities).
 */
interface TreeLensRoot<D> extends TreeRootBase<D, "lens"> {
    /** Data projection: $("name") → all items' data.name */
    <K extends AllStringKeys<D>>(key: K): DataChainFor<D, SafeLookup<D, K>, "multi">;
}

/**
 * Update root — adds data path navigation ($("name") → pather chain).
 * Like lens root but ("key") returns pather chains (pure navigation, no where/sort/slice).
 * Used by update.
 */
interface TreeUpdateRoot<D> extends TreeRootBase<D, "pather"> {
    /** Data path: $("name") → navigates into data.name (write-back safe) */
    <K extends AllStringKeys<D>>(key: K): PatherChainFor<D, SafeLookup<D, K>, "multi">;
}

/**
 * Base item chain — shared by lens and target contexts.
 * Parameterized by ChainContext C: all methods return ItemChainFor<D, ?, C>.
 * Call signature NOT included — added by TreeItemChain (lens) only.
 */
interface TreeItemChainBase<D, M extends Mode, C extends ChainContext> extends Queryable<TreeItemOf<D>, M, "items"> {
    /** Filter — ID equality auto-narrows to single (IDs are unique) */
    where(field: typeof META_ID, op: "=", value: WhereOperand<string, D>): ItemChainFor<D, "single", C>;
    /** Filter — meta token predicate (structural fields) */
    where<F extends MetaToken, Op extends CompOp>(field: F, op: Op, value: WhereOperand<ValueOperandFor<MetaTokenMap[F], Op>, D>): ItemChainFor<D, M, C>;
    /** Filter — sublens predicate for deep property access in where() */
    where<V, Op extends CompOp>(field: (sub: TreeDataChain<D, D, "single">) => Queryable<V, any, "data">, op: Op, value: WhereOperand<ValueOperandFor<V, Op>, D>): ItemChainFor<D, M, C>;
    /** Filter — logic combinator (OR, AND, XOR) */
    where(logic: (l: LogicBuilder<D>) => LogicExpr): ItemChainFor<D, M, C>;
    /** Filter — general data field predicate (chained .where().where() = implicit AND) */
    where<F extends AllStringKeys<D>, Op extends CompOp>(field: F, op: Op, value: WhereOperand<OperandFor<D, F, Op>, D>): ItemChainFor<D, M, C>;

    /** Narrow to single by ID, or multi with multiple IDs */
    of(id: string): ItemChainFor<D, "single", C>;
    of(...ids: string[]): ItemChainFor<D, "multi", C>;

    /** Narrow to single (multi-mode only) */
    first(): M extends "multi" ? ItemChainFor<D, "single", C> : never;
    last(): M extends "multi" ? ItemChainFor<D, "single", C> : never;
    at(index: number): M extends "multi" ? ItemChainFor<D, "single", C> : never;

    /** Collection operations (multi-mode only) */
    sort(field: AllStringKeys<D> | MetaToken, config?: SortConfig): M extends "multi" ? ItemChainFor<D, "multi", C> : never;
    sort(field: (sub: TreeDataChain<D, D, "single">) => Queryable<any, any, "data">, config?: SortConfig): M extends "multi" ? ItemChainFor<D, "multi", C> : never;
    distinct(field?: AllStringKeys<D> | MetaToken): M extends "multi" ? ItemChainFor<D, "multi", C> : never;
    distinct(field: (sub: TreeDataChain<D, D, "single">) => Queryable<any, any, "data">): M extends "multi" ? ItemChainFor<D, "multi", C> : never;
    slice(start: number, end?: number): M extends "multi" ? ItemChainFor<D, "multi", C> : never;

    /** Structural traversal */
    readonly children: ItemChainFor<D, "multi", C>;
    readonly parent: ItemChainFor<D, M, C>;
    readonly ancestors: ItemChainFor<D, "multi", C>;
    readonly wideDescendants: ItemChainFor<D, "multi", C>;
    readonly deepDescendants: ItemChainFor<D, "multi", C>;
    readonly siblings: ItemChainFor<D, "multi", C>;

    /** Projection terminals — project structural metadata as data values */
    readonly ID: Queryable<string, M, "data">;
    readonly PARENT: Queryable<string | null, M, "data">;
    readonly CHILDREN: Queryable<string[], M, "data">;
    readonly DEPTH: Queryable<number, M, "data">;

    /** Terminals */
    count(): M extends "multi" ? Queryable<number, "single", "data"> : never;
    exists(): Queryable<boolean, "single", "data">;
}

/** Target item chain — structural navigation only, no data projection call signature */
interface TreeTargetItemChain<D, M extends Mode> extends TreeItemChainBase<D, M, "target"> {}

/**
 * Lens item chain — extends base with data projection call signature.
 * Structural navigation + filtering + narrowing + data projection.
 */
interface TreeItemChain<D, M extends Mode> extends TreeItemChainBase<D, M, "lens"> {
    /** Project to data property — routes to array or scalar chain based on D[K] */
    <K extends AllStringKeys<D>>(key: K): DataChainFor<D, SafeLookup<D, K>, M>;
}

/** Pather item chain — extends base with data path call signature returning pather chains */
interface TreePatherItemChain<D, M extends Mode> extends TreeItemChainBase<D, M, "pather"> {
    /** Navigate to data property — returns pather chain (pure navigation, no where/sort/slice) */
    <K extends AllStringKeys<D>>(key: K): PatherChainFor<D, SafeLookup<D, K>, M>;
}

// #endregion
// #region ─── Tree Pather (Navigation-Only Chains) ─────────────

/**
 * Pather chain for scalar values — pure navigation, no filtering.
 * After $("address")("city") in update context.
 * Only (key) drilling — no where, sort, slice, distinct, count, size.
 */
interface TreePatherChain<D, V, M extends Mode> extends Queryable<V, M, "data"> {
    /** Drill into nested properties */
    <K extends AllStringKeys<V>>(key: K): PatherChainFor<D, SafeLookup<V, K>, M>;
}

/**
 * Pather chain for array values — index and wildcard only.
 * After $("roles") in update context.
 * No element filtering, sorting, slicing — just positional access.
 */
interface TreePatherArrayChain<D, V extends readonly unknown[], M extends Mode> extends Queryable<V, M, "data"> {
    /** Index access: ("roles")(0) → targets element at index */
    (index: number): PatherChainFor<D, V[number], M>;
    /** Wildcard: ("roles")("*") → targets all elements */
    <W extends "*">(wildcard: W): PatherChainFor<D, V[number], "multi">;
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
    where(field: typeof META_ID, op: "=", value: WhereOperand<string, D>): TreeDataChain<D, V, "single">;
    /** Filter — meta token predicate */
    where<F extends MetaToken, Op extends CompOp>(field: F, op: Op, value: WhereOperand<ValueOperandFor<MetaTokenMap[F], Op>, D>): TreeDataChain<D, V, M>;
    /** Filter — sublens predicate */
    where<SV, Op extends CompOp>(field: (sub: TreeDataChain<D, D, "single">) => Queryable<SV, any, "data">, op: Op, value: WhereOperand<ValueOperandFor<SV, Op>, D>): TreeDataChain<D, V, M>;
    /** Filter — logic combinator */
    where(logic: (l: LogicBuilder<D>) => LogicExpr): TreeDataChain<D, V, M>;
    /** Filter — general data field predicate */
    where<F extends AllStringKeys<D>, Op extends CompOp>(field: F, op: Op, value: WhereOperand<OperandFor<D, F, Op>, D>): TreeDataChain<D, V, M>;

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
    where<F extends ElementPredField<V[number]>, Op extends CompOp>(field: F, op: Op, value: WhereOperand<OperandFor<V[number], F, Op>, V[number]>): TreeDataArrayChain<D, V, M>;
    /** Element filtering — sublens predicate for deep element property access */
    where<SV, Op extends CompOp>(
        field: (sub: TreeDataChain<V[number], V[number], "single">) => Queryable<SV, any, "data">,
        op: Op,
        value: WhereOperand<ValueOperandFor<SV, Op>, V[number]>,
    ): TreeDataArrayChain<D, V, M>;
    /** Element filtering — logic combinator */
    where(logic: (l: LogicBuilder<V[number]>) => LogicExpr): TreeDataArrayChain<D, V, M>;

    /** Element collection ops */
    sort(field: ElementPredField<V[number]>, config?: SortConfig): TreeDataArrayChain<D, V, M>;
    sort(field: (sub: TreeDataChain<V[number], V[number], "single">) => Queryable<any, any, "data">, config?: SortConfig): TreeDataArrayChain<D, V, M>;
    slice(start: number, end?: number): TreeDataArrayChain<D, V, M>;
    distinct(field?: ElementPredField<V[number]>): TreeDataArrayChain<D, V, M>;
    distinct(field: (sub: TreeDataChain<V[number], V[number], "single">) => Queryable<any, any, "data">): TreeDataArrayChain<D, V, M>;

    /** Measure array: element count per item */
    size(): Queryable<number, M, "data">;
}

// #endregion
// #region ─── DB Integration ───────────────────────────────────

type SelectResult<T, M extends Mode> = M extends "single" ? T : T[];

/** select() — accepts both selectors (items) and lenses (data) */
type TreeSelect<D> = <T, M extends Mode, K extends Kind>(builder: ($: TreeLensRoot<D>) => Queryable<T, M, K>) => SelectResult<T, M>;

/** update() — uses TreeUpdateRoot: item targeting + pather navigation (no where/sort/slice on data) */
type TreeUpdate<D> = <V, M extends Mode, K extends Kind>(query: ($: TreeUpdateRoot<D>) => Queryable<V, M, K>, updater: Updater<K extends "items" ? D : V, TreeItemOf<D>>) => void;

/** pluck/splice/prune/trim — targetter only (Kind must be "items") */
type TreePluck<D> = <M extends Mode>(query: ($: TreeTargetRoot<D>) => Queryable<TreeItemOf<D>, M, "items">) => void;

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
const d5 = treeSelect(($) => $.roots.where((l) => l.or(l("age", ">", 18), l("status", "=", "admin"))));

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
const e9 = treeSelect(($) => $.roots.where((l) => l.or(l("age", ">", 18), l("name", "=", "Bob"))));
// @ts-expect-error — ✗ string not assignable to number (age requires number for >)
const f4 = treeSelect(($) => $.roots.where((l) => l.and(l("age", ">", "old"))));

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

// ── Cross-reference queryable operands (pattern 2) ──
const q1 = treeSelect(($) => $.roots.where($.ID, "=|", $.allDeep("roles")("*"))); // ID in any item's roles
const q2 = treeSelect(($) => $.allDeep.where("roles", "?|", $.roots("roles")("*"))); // roles overlap with root roles
const q3 = treeSelect(($) => $.roots.where("age", "=", $.allDeep.first().DEPTH)); // age equals first item's depth

// ── Self-referencing sublens operands (pattern 3) ──
const q4 = treeSelect(($) => $.allDeep.where("roles", "#>", (_) => _("age"))); // more roles than age
const q5 = treeSelect(($) => $.allDeep.where("name", "=|", (_) => _("roles"))); // name in own roles

// ── .of() narrowing ──
const q6 = treeSelect(($) => $.allDeep.of("abc123")); // TreeItemOf<Sample> (single)
const q7 = treeSelect(($) => $.allDeep.of("abc123")("name")); // string (single)
const q8 = treeSelect(($) => $.roots.of("xyz").DEPTH); // number (single)

// ── Projection terminals ──
const q9 = treeSelect(($) => $.roots.ID); // string[]
const q10 = treeSelect(($) => $.roots.CHILDREN); // string[][]
const q11 = treeSelect(($) => $.roots.first().DEPTH); // number
const q12 = treeSelect(($) => $.roots.first().PARENT); // string | null

// @ts-expect-error — ✗ multi queryable with scalar operator (> needs single-mode operand)
const qe1 = treeSelect(($) => $.roots.where("age", ">", $.allDeep.DEPTH));

// ── Array element where() — logic combinator (RQ2) ──
const r1 = treeSelect(($) => $("tags").where((l) => l.or(l("priority", ">", 5), l("label", "=", "urgent"))));

// ── Array element where() — cross-reference queryable operand (RQ6) ──
const r2 = treeSelect(($) => $("tags").where("priority", ">", $.roots.first().DEPTH));

// ── Array element where() — self-ref sublens references the element ──
const r3 = treeSelect(($) => $("tags").where((sub) => sub("label").size(), ">", 3)); // tags whose label length > 3

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

// ── .siblings ──
const sib1 = treeSelect(($) => $.roots.first().siblings); // TreeItemOf<Sample>[]
const sib2 = treeSelect(($) => $.allDeep.where("name", "=", "Alice").siblings.where("age", ">", 10)); // siblings of Alice, filtered

// ── .exists() ──
const ex1 = treeSelect(($) => $.roots.where("name", "=", "Alice").exists()); // boolean
const ex2 = treeSelect(($) => $.allDeep.where("roles", "?", "admin").exists()); // boolean
const ex3 = treeSelect(($) => $.of("abc123").exists()); // boolean — does this ID exist?

// ── .at() ──
const at1 = treeSelect(($) => $.roots.at(2)); // TreeItemOf<Sample> — third root
const at2 = treeSelect(($) => $.roots.at(2)("name")); // string — third root's name
const at3 = treeSelect(($) => $.allDeep.where("age", ">", 18).at(0)); // same as .first()

// ── .sort() with sublens ──
const so1 = treeSelect(($) => $.roots.sort((sub) => sub("address")("city"))); // sort by nested address.city
const so2 = treeSelect(($) => $.roots.sort((sub) => sub("address")("city"), { direction: "desc" })); // desc
const so3 = treeSelect(($) => $("tags").sort((sub) => sub("label"))); // sort tag elements by label

// ── .distinct() with sublens ──
const di1 = treeSelect(($) => $.allDeep.distinct((sub) => sub("address")("city"))); // dedup by nested city
const di2 = treeSelect(($) => $("tags").distinct((sub) => sub("label"))); // dedup tag elements by label

// ── .of() with multiple IDs ──
const of1 = treeSelect(($) => $.of("a")); // TreeItemOf<Sample> — single
const of2 = treeSelect(($) => $.of("a", "b", "c")); // TreeItemOf<Sample>[] — multi
const of3 = treeSelect(($) => $.of("a", "b")("name")); // string[] — multi → data projection
const of4 = treeSelect(($) => $.roots.of("a", "b").where("age", ">", 18)); // chain continues as multi

// #endregion
// #region ─── Design Decisions ─────────────────────────────────

// D1: Three-tier query hierarchy: Targetter ⊂ Pather ⊂ Lens.
//     Targetter = "which items?" — no data projection. Used by pluck/splice/prune/trim/move.
//     Pather = Targetter + pure field navigation ($("key") chaining). Used by update.
//       ("key") returns TreePatherChain (navigation only, no where/sort/slice/distinct).
//       Ensures the path is always a valid write-back target.
//     Lens = full query + data chains with where/sort/slice. Used by select.
//       ("key") returns TreeDataChain (full filtering and reshaping capabilities).
//     TreeTargetRoot / TreeUpdateRoot / TreeLensRoot.

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
//     LogicBuilder is callable as a predicate factory: l("age", ">", 18) → LogicExpr.
//     Supports bare keys, meta tokens, and sublens callbacks in the field position.
//     Combinators (and/or/xor) take LogicExpr, not tuples — each predicate is independently type-checked.

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

// D17: Where operand forms — three value patterns in where():
//      1. Literal value (existing) — direct value matching field + operator type
//      2. Cross-reference queryable — Queryable as computed operand from another chain
//         Single-mode queryable: any operator. Multi-mode: set operators only (=|, ?|, ?&, etc.)
//      3. Self-referencing sublens — callback (sub => sub("field")) comparing against own fields
//      WhereOperand<V, D> unifies all three forms. Tuple guard prevents multi queryable for range ops.

// D18: Projection terminals — .ID, .PARENT, .CHILDREN, .DEPTH on TreeItemChain.
//      Project structural metadata as Queryable<T, M, "data">.
//      $.ID (on root) = meta token symbol for where() field position.
//      $.roots.ID (on item chain) = projection terminal for operand/output use.

// D19: .of() — ID-based item narrowing. Sugar for where($.ID, "=", id).
//      Single arg: of(id) → "single" mode. Rest param: of(...ids) → "multi" mode.
//      Available on both TreeRootBase and TreeItemChainBase. Works on any incoming mode.

// D20: TreeDataArrayChain.where() — full where() capability for array elements.
//      Logic combinator: where(l => l.or(...)). Sublens field: where(sub => sub("label").size(), ...).
//      WhereOperand: accepts queryable/sublens operands. Self-ref sublens references the ELEMENT, not the parent item.
//      If parent-item filtering is needed, do it before projecting into the array.

// D21: ChainContext parameterization — "lens" | "target" | "pather" flows through TreeItemChainBase and TreeRootBase.
//      TreeTargetItemChain: no call signature — data projection not available in pluck/splice contexts.
//      TreePatherItemChain: (key: K) returns PatherChainFor (pure navigation, write-back safe).
//      TreeItemChain: (key: K) returns DataChainFor (full lens capabilities).
//      ItemChainFor<D, M, C> conditional type routes: lens → TreeItemChain, pather → TreePatherItemChain, target → TreeTargetItemChain.
//      Zero duplication: all shared methods (where, of, first, children, etc.) defined once in TreeItemChainBase.

// D22: TreeUpdate uses TreeUpdateRoot — single-signature with K extends "items" ? D : V conditional.
//      TreeUpdateRoot extends TreeRootBase<D, "pather">: item targeting with full where/structural nav,
//      but ("key") enters pather mode (TreePatherChain) — no where/sort/slice on the data path.
//      Ensures all update paths are unambiguous write-back targets.
//      When query returns items (K="items"), updater gets Updater<D, ...> (prev = payload).
//      When query returns data (K="data"), updater gets Updater<V, ...> (prev = projected value).

// D23: Pather chains — TreePatherChain (scalar) and TreePatherArrayChain (array).
//      PatherChainFor<D, V, M> routes to array or scalar pather, mirroring DataChainFor.
//      Scalar pather: only (key: K) drilling into nested properties.
//      Array pather: only (index: number) and ("*") wildcard — no where/sort/slice/distinct/first/last.
//      Array surgery (filtering, reordering) belongs in the updater callback, not the path.

// D24: Sublens overloads for .sort() and .distinct() — callback (sub => sub("key")("nested")) form.
//      TreeItemChainBase: sublens operates on TreeDataChain<D, D, "single"> — drills into item payload.
//      TreeDataArrayChain: sublens operates on TreeDataChain<V[number], V[number], "single"> — drills into element.
//      Mirrors the sublens pattern already used in .where() (D9, D20).

// #endregion
// #region ─── Remaining Questions ──────────────────────────────

// RQ1: RESOLVED → D11. ? for contains, # for numerify. ~86 enumerated operators.

// RQ2: RESOLVED → D20. TreeDataArrayChain.where() now supports sublens and logic builder overloads.

// RQ3: RESOLVED. Nested arrays work naturally — each ("*") peels one layer.
//      $("matrix")("*")("*") flattens number[][] → number. Index access chains similarly.

// RQ4: RESOLVED → D13. .count() = query cardinality. .size() = value measurement.
//      # numerify operators subsume sublens .size() for where() predicates.

// RQ5: Set operations — should $.union/intersect/exclude accept lenses too?
//      Deferred. Currently typed for items only.

// RQ6: RESOLVED → D20. TreeDataArrayChain.where() now accepts WhereOperand.

// #endregion
