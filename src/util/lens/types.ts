import { LensSubAccess, LensAccess, AllStringKeys, LensSubQuery, LensQuery, SafeLookup, Comparable } from "../../types";
import { LogicalOps, PredicateResult } from "../logic";
import { Predicate } from "../predicate";

// Eval = the type this lens evaluates to (what predicates see, what get() returns)
// Chain = the type used for property/index chaining (defaults to Eval)

export type SortDirection = "asc" | "desc" | { direction: "asc" | "desc"; nullish?: "first" | "last" };

//#region - Query Lens
export type QueryLens<Eval, Chain = Eval> = {
    readonly [BRAND]: Eval;
    transform<R>(transformer: (subject: NonNullable<Chain>) => R): QueryLens<WithCardnality<Eval, Chain, R>, R>;
} & (NonNullable<Chain> extends string
    ? {
          size(): QueryLens<WithCardnality<Eval, Chain, number>, number>;
      }
    : {}) &
    // Array
    (NonNullable<Chain> extends (infer E)[] | readonly (infer E)[]
        ? {
              (index: number): QueryLens<WithCardnality<Eval, Chain, E>, E>;
              at(index: number): QueryLens<WithCardnality<Eval, Chain, E>, E>;
              each(): QueryLens<E[], E>;
              where(pred: ($: QueryLens<ElementOf<Chain>> & LogicalOps) => Predicate<any> | PredicateResult): QueryLens<Eval, Chain>;
              filter(fn: (item: ElementOf<Chain>) => boolean): QueryLens<Eval, Chain>;
              slice(start: number, end?: number): QueryLens<Eval, Chain>;
              sort<R extends string | number | bigint | Comparable | null | undefined>(target: ($: GetterLens<ElementOf<Chain>>) => GetterLensOf<R>, dir: SortDirection): QueryLens<Eval, Chain>;
              sort(comparator: (a: E, b: E) => number): QueryLens<Eval, Chain>;
              size(): QueryLens<WithCardnality<Eval, Chain, number>, number>;
              length(): QueryLens<WithCardnality<Eval, Chain, number>, number>;
          }
        : {}) &
    // Any-object
    (NonNullable<Chain> extends object
        ? {
              <Key extends AllStringKeys<Chain>>(key: Key): QueryLens<WithCardnality<Eval, Chain, SafeLookup<Chain, Key>>, SafeLookup<Chain, Key>>;
          }
        : {}) &
    // Plain-ish Object
    (NonNullable<Chain> extends Record<string, infer V>
        ? NonNullable<Chain> extends any[]
            ? never
            : {
                  keys(): QueryLens<WithCardnality<Eval, Chain, string[]>, string[]>;
                  values(): QueryLens<WithCardnality<Eval, Chain, V[]>, V[]>;
                  size(): QueryLens<WithCardnality<Eval, Chain, number>, number>;
              }
        : {}) &
    // Set
    (NonNullable<Chain> extends Set<infer SV>
        ? {
              has(value: SV): QueryLens<WithCardnality<Eval, Chain, boolean>, boolean>;
              size(): QueryLens<WithCardnality<Eval, Chain, number>, number>;
          }
        : {}) &
    // Map
    (NonNullable<Chain> extends Map<infer MK, infer MV>
        ? {
              get(key: MK): QueryLens<WithCardnality<Eval, Chain, MV>, MV>;
              has(key: MK): QueryLens<WithCardnality<Eval, Chain, boolean>, boolean>;
              size(): QueryLens<WithCardnality<Eval, Chain, number>, number>;
          }
        : {}) &
    // Custom
    (NonNullable<Chain> extends { [LensSubQuery]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends (key: infer KT) => infer VT ? (key: KT) => QueryLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {}) &
    (NonNullable<Chain> extends { [LensSubAccess]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends (key: infer KT) => infer VT ? (key: KT) => QueryLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {}) &
    // Custom (named property)
    (NonNullable<Chain> extends { [LensQuery]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends () => infer VT ? () => QueryLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {}) &
    (NonNullable<Chain> extends { [LensAccess]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends () => infer VT ? () => QueryLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {});
//#endregion

//#region - Getter Lens
export type GetterLens<Eval, Chain = Eval> = {
    readonly [BRAND]: Eval;
} & (NonNullable<Chain> extends string
    ? {
          size(): GetterLens<WithCardnality<Eval, Chain, number>, number>;
      }
    : {}) &
    // Array
    (NonNullable<Chain> extends (infer E)[] | readonly (infer E)[]
        ? {
              (index: number): GetterLens<WithCardnality<Eval, Chain, E>, E>;
              at(index: number): GetterLens<WithCardnality<Eval, Chain, E>, E>;
              size(): GetterLens<WithCardnality<Eval, Chain, number>, number>;
              length(): GetterLens<WithCardnality<Eval, Chain, number>, number>;
          }
        : {}) &
    // Any-object
    (NonNullable<Chain> extends object
        ? {
              <Key extends AllStringKeys<Chain>>(key: Key): GetterLens<WithCardnality<Eval, Chain, SafeLookup<Chain, Key>>, SafeLookup<Chain, Key>>;
          }
        : {}) &
    // Plain-ish Object
    (NonNullable<Chain> extends Record<string, infer V>
        ? NonNullable<Chain> extends any[]
            ? never
            : {
                  size(): GetterLens<WithCardnality<Eval, Chain, number>, number>;
              }
        : {}) &
    // Set
    (NonNullable<Chain> extends Set<infer SV>
        ? {
              size(): GetterLens<WithCardnality<Eval, Chain, number>, number>;
          }
        : {}) &
    // Map
    (NonNullable<Chain> extends Map<infer MK, infer MV>
        ? {
              get(key: MK): GetterLens<WithCardnality<Eval, Chain, MV>, MV>;
              size(): GetterLens<WithCardnality<Eval, Chain, number>, number>;
          }
        : {}) &
    // Custom (keyed)
    (NonNullable<Chain> extends { [LensSubAccess]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends (key: infer KT) => infer VT ? (key: KT) => GetterLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {}) &
    // Custom (named property)
    (NonNullable<Chain> extends { [LensAccess]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends () => infer VT ? () => GetterLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {});

//#endregion

// reserved for future use

export type MutatorLens<Eval, Chain = Eval> = {
    readonly [BRAND]: Eval;
} &
    // Array
    (NonNullable<Chain> extends (infer E)[] | readonly (infer E)[]
        ? {
              (index: number): MutatorLens<WithCardnality<Eval, Chain, E>, E>;
              at(index: number): MutatorLens<WithCardnality<Eval, Chain, E>, E>;
              each(): MutatorLens<E[], E>;
              where(pred: ($: QueryLens<ElementOf<Chain>> & LogicalOps) => Predicate<any> | PredicateResult): MutatorLens<Eval, Chain>;
              filter(fn: (item: ElementOf<Chain>) => boolean): MutatorLens<Eval, Chain>;
              slice(start: number, end?: number): MutatorLens<Eval, Chain>;
              // sort<R extends string | number | bigint | Comparable | null | undefined>(target: ($: GetterLens<ElementOf<Chain>>) => GetterLensOf<R>, dir: SortDirection): UpdaterLens<Eval, Chain>;
              // sort(comparator: (a: E, b: E) => number): UpdaterLens<Eval, Chain>;
              // push/pop/shift/unshift?
          }
        : {}) &
    // Any-object
    (NonNullable<Chain> extends object
        ? {
              <Key extends AllStringKeys<Chain>>(key: Key): MutatorLens<WithCardnality<Eval, Chain, SafeLookup<Chain, Key>>, SafeLookup<Chain, Key>>;
          }
        : {}) &
    // Set
    (NonNullable<Chain> extends Set<infer SV>
        ? {
              // add/remove? -- maybe as terminal calls?
          }
        : {}) &
    // Map
    (NonNullable<Chain> extends Map<infer MK, infer MV>
        ? {
              get(key: MK): MutatorLens<WithCardnality<Eval, Chain, MV>, MV>;
              // add/remove? -- maybe as terminal calls?
          }
        : {}) &
    // Custom (keyed)
    (NonNullable<Chain> extends { [LensSubAccess]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends (key: infer KT) => infer VT ? (key: KT) => MutatorLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {}) &
    // Custom (named property)
    (NonNullable<Chain> extends { [LensAccess]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends () => infer VT ? () => MutatorLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {});

export type ApplierLens<Eval, Chain = Eval> = {
    readonly [BRAND]: Eval;
} &
    // Array
    (NonNullable<Chain> extends (infer E)[] | readonly (infer E)[]
        ? {
              (index: number): ApplierLens<WithCardnality<Eval, Chain, E>, E>;
              at(index: number): ApplierLens<WithCardnality<Eval, Chain, E>, E>;
              each(): ApplierLens<E[], E>;
              where(pred: ($: QueryLens<ElementOf<Chain>> & LogicalOps) => Predicate<any> | PredicateResult): ApplierLens<Eval, Chain>;
              filter(fn: (item: ElementOf<Chain>) => boolean): ApplierLens<Eval, Chain>;
              slice(start: number, end?: number): ApplierLens<Eval, Chain>;
              // sort<R extends string | number | bigint | Comparable | null | undefined>(target: ($: GetterLens<ElementOf<Chain>>) => GetterLensOf<R>, dir: SortDirection): UpdaterLens<Eval, Chain>;
              // sort(comparator: (a: E, b: E) => number): UpdaterLens<Eval, Chain>;
              // push/pop/shift/unshift - wouldn't *actually* call push, pop, shift, unshift, but would rather do the immutable version under the hood... I guess?
          }
        : {}) &
    // Any-object
    (NonNullable<Chain> extends object
        ? {
              <Key extends AllStringKeys<Chain>>(key: Key): ApplierLens<WithCardnality<Eval, Chain, SafeLookup<Chain, Key>>, SafeLookup<Chain, Key>>;
          }
        : {}) &
    // Set
    (NonNullable<Chain> extends Set<infer SV>
        ? {
              // add/remove?
          }
        : {}) &
    // Map
    (NonNullable<Chain> extends Map<infer MK, infer MV>
        ? {
              get(key: MK): ApplierLens<WithCardnality<Eval, Chain, MV>, MV>;
              // add/remove?
          }
        : {}) &
    // Custom (keyed)
    (NonNullable<Chain> extends { [LensSubAccess]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends (key: infer KT) => infer VT ? (key: KT) => ApplierLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {}) &
    // Custom (named property)
    (NonNullable<Chain> extends { [LensAccess]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends () => infer VT ? () => ApplierLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {});

//#region - Helpers
type ElementOf<T> = NonNullable<T> extends (infer E)[] | readonly (infer E)[] ? E : never;

// --- Eval/Chain transform ---
// When Eval = Chain (normal): NewChain passes through unchanged.
// When Eval != Chain (after .each()): wraps NewChain in [].
type WithCardnality<Eval, Chain, NewChain> = [Eval] extends [Chain] ? NewChain : NewChain[];

declare const BRAND: unique symbol;

export type QueryLensOf<E> = { readonly [BRAND]: E };
export type GetterLensOf<E> = { readonly [BRAND]: E };
type MutatorLensOf<E> = { readonly [BRAND]: E };
type ApplierLensOf<E> = { readonly [BRAND]: E };

//#endregion
