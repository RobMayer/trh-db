import { LensSubAccess, LensAccess, AllStringKeys, LensSubSelect, LensSelect, SafeLookup, Comparable } from "../../types";
import { LogicalOps, PredicateResult } from "../logic";
import { Predicate } from "../predicate";

// Eval = the type this lens evaluates to (what predicates see, what get() returns)
// Chain = the type used for property/index chaining (defaults to Eval)

export type SortDirection = "asc" | "desc" | { direction: "asc" | "desc"; nullish?: "first" | "last" };

//#region - Selector Lens
export type SelectorLens<Eval, Chain = Eval> = {
    readonly [BRAND]: Eval;
    transform<R>(transformer: (subject: NonNullable<Chain>) => R): SelectorLens<WithCardnality<Eval, Chain, R>, R>;
} & (NonNullable<Chain> extends string
    ? {
          size(): SelectorLens<WithCardnality<Eval, Chain, number>, number>;
      }
    : {}) &
    // Array
    (NonNullable<Chain> extends (infer E)[] | readonly (infer E)[]
        ? {
              (index: number): SelectorLens<WithCardnality<Eval, Chain, E>, E>;
              at(index: number): SelectorLens<WithCardnality<Eval, Chain, E>, E>;
              each(): SelectorLens<E[], E>;
              where(pred: ($: SelectorLens<ElementOf<Chain>> & LogicalOps) => Predicate<any> | PredicateResult): SelectorLens<Eval, Chain>;
              filter(fn: (item: ElementOf<Chain>) => boolean): SelectorLens<Eval, Chain>;
              slice(start: number, end?: number): SelectorLens<Eval, Chain>;
              sort<R extends string | number | bigint | Comparable | null | undefined>(target: ($: SelectorLens<ElementOf<Chain>>) => SelectorLensOf<R>, dir: SortDirection): SelectorLens<Eval, Chain>;
              sort(comparator: (a: E, b: E) => number): SelectorLens<Eval, Chain>;
              size(): SelectorLens<WithCardnality<Eval, Chain, number>, number>;
              length(): SelectorLens<WithCardnality<Eval, Chain, number>, number>;
          }
        : {}) &
    // Any-object
    (NonNullable<Chain> extends object
        ? {
              <Key extends AllStringKeys<Chain>>(key: Key): SelectorLens<WithCardnality<Eval, Chain, SafeLookup<Chain, Key>>, SafeLookup<Chain, Key>>;
          }
        : {}) &
    // Plain-ish Object
    (NonNullable<Chain> extends Record<string, infer V>
        ? NonNullable<Chain> extends any[]
            ? never
            : {
                  keys(): SelectorLens<WithCardnality<Eval, Chain, string[]>, string[]>;
                  values(): SelectorLens<WithCardnality<Eval, Chain, V[]>, V[]>;
                  size(): SelectorLens<WithCardnality<Eval, Chain, number>, number>;
              }
        : {}) &
    // Set
    (NonNullable<Chain> extends Set<infer SV>
        ? {
              has(value: SV): SelectorLens<WithCardnality<Eval, Chain, boolean>, boolean>;
              size(): SelectorLens<WithCardnality<Eval, Chain, number>, number>;
          }
        : {}) &
    // Map
    (NonNullable<Chain> extends Map<infer MK, infer MV>
        ? {
              get(key: MK): SelectorLens<WithCardnality<Eval, Chain, MV>, MV>;
              has(key: MK): SelectorLens<WithCardnality<Eval, Chain, boolean>, boolean>;
              size(): SelectorLens<WithCardnality<Eval, Chain, number>, number>;
          }
        : {}) &
    // Custom
    (NonNullable<Chain> extends { [LensSubSelect]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends (key: infer KT) => infer VT ? (key: KT) => SelectorLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {}) &
    (NonNullable<Chain> extends { [LensSubAccess]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends (key: infer KT) => infer VT ? (key: KT) => SelectorLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {}) &
    // Custom (named property)
    (NonNullable<Chain> extends { [LensSelect]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends () => infer VT ? () => SelectorLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {}) &
    (NonNullable<Chain> extends { [LensAccess]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends () => infer VT ? () => SelectorLens<WithCardnality<Eval, Chain, VT>, VT> : never;
          }
        : {});
//#endregion

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
              where(pred: ($: SelectorLens<ElementOf<Chain>> & LogicalOps) => Predicate<any> | PredicateResult): MutatorLens<Eval, Chain>;
              filter(fn: (item: ElementOf<Chain>) => boolean): MutatorLens<Eval, Chain>;
              slice(start: number, end?: number): MutatorLens<Eval, Chain>;
              // sort<R extends string | number | bigint | Comparable | null | undefined>(target: ($: SelectorLens<ElementOf<Chain>>) => SelectorLensOf<R>, dir: SortDirection): MutatorLens<Eval, Chain>;
              // sort(comparator: (a: E, b: E) => number): MutatorLens<Eval, Chain>;
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
              where(pred: ($: SelectorLens<ElementOf<Chain>> & LogicalOps) => Predicate<any> | PredicateResult): ApplierLens<Eval, Chain>;
              filter(fn: (item: ElementOf<Chain>) => boolean): ApplierLens<Eval, Chain>;
              slice(start: number, end?: number): ApplierLens<Eval, Chain>;
              // sort<R extends string | number | bigint | Comparable | null | undefined>(target: ($: SelectorLens<ElementOf<Chain>>) => SelectorLensOf<R>, dir: SortDirection): ApplierLens<Eval, Chain>;
              // sort(comparator: (a: E, b: E) => number): ApplierLens<Eval, Chain>;
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

export type SelectorLensOf<E> = { readonly [BRAND]: E };
type MutatorLensOf<E> = { readonly [BRAND]: E };
type ApplierLensOf<E> = { readonly [BRAND]: E };

//#endregion
