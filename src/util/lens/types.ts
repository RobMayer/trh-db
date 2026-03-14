import { SubLensNav, LensNav, AllStringKeys, SafeLookup, Comparable } from "../../types";
import { LogicalOps, PredicateResult } from "../logic";
import { Predicate } from "../predicate";

export type SortDirection = "asc" | "desc" | { direction: "asc" | "desc"; nullish?: "first" | "last" };

//#region - Unified DataLens

// DataLens<Target, Eval, Chain>
//   Target = what the updater receives for mutation (never = can't be terminal)
//   Eval   = what Lens.get returns (tracks array wrapping from each())
//   Chain  = current navigation type (what properties/methods are available)

export type DataLens<Target, Eval = Target, Chain = Eval> = {
    readonly [BRAND_TARGET]: Target;
    readonly [BRAND_EVAL]: Eval;

    // Always available — read-only (Target = never)
    transform<R>(transformer: (subject: NonNullable<Chain>) => R): DataLens<never, WrapEval<Eval, Chain, R>, R>;
} & // Readonly marker: when Target = never, adds a brand that structurally conflicts with MutatorLensOf/ApplierLensOf
    ([Target] extends [never] ? { readonly [BRAND_READONLY]: true } : {}) &
    // String
    (NonNullable<Chain> extends string
        ? {
              size(): DataLens<never, WrapEval<Eval, Chain, number>, number>;
          }
        : {}) &
    // Array
    (NonNullable<Chain> extends (infer E)[] | readonly (infer E)[]
        ? {
              (index: number | SelectorLensOf<number>): DataLens<WrapTarget<Target, Chain, E>, WrapEval<Eval, Chain, E>, E>;
              at(index: number | SelectorLensOf<number>): DataLens<WrapTarget<Target, Chain, E>, WrapEval<Eval, Chain, E>, E>;
              each(): DataLens<E, E[], E>;
              each<RT, RE>(callback: ($el: DataLens<E, E, E>) => DataLens<RT, RE, any>): DataLens<WrapTarget<Target, Chain, RT>, RE[], RE>;
              where(pred: ($: DataLens<never, ElementOf<Chain>> & LogicalOps) => Predicate<any> | PredicateResult): DataLens<never, Eval, Chain>;
              filter(fn: (item: ElementOf<Chain>) => boolean): DataLens<never, Eval, Chain>;
              slice(start: number | SelectorLensOf<number>, end?: number | SelectorLensOf<number>): DataLens<never, Eval, Chain>;
              sort<R extends string | number | bigint | Comparable | null | undefined>(target: ($: DataLens<never, ElementOf<Chain>>) => SelectorLensOf<R>, dir: SortDirection): DataLens<never, Eval, Chain>;
              sort(comparator: (a: E, b: E) => number): DataLens<never, Eval, Chain>;
              size(): DataLens<never, WrapEval<Eval, Chain, number>, number>;
              length(): DataLens<never, WrapEval<Eval, Chain, number>, number>;
          }
        : {}) &
    // Any-object (string key access)
    (NonNullable<Chain> extends object
        ? {
              <Key extends AllStringKeys<Chain>>(key: Key): DataLens<KeepTarget<Target, Chain, SafeLookup<Chain, Key>>, WrapEval<Eval, Chain, SafeLookup<Chain, Key>>, SafeLookup<Chain, Key>>;
          }
        : {}) &
    // Plain-ish Object (not array)
    (NonNullable<Chain> extends Record<string, infer V>
        ? NonNullable<Chain> extends any[]
            ? never
            : {
                  keys(): DataLens<never, WrapEval<Eval, Chain, string[]>, string[]>;
                  values(): DataLens<never, WrapEval<Eval, Chain, V[]>, V[]>;
                  size(): DataLens<never, WrapEval<Eval, Chain, number>, number>;
              }
        : {}) &
    // Set
    (NonNullable<Chain> extends Set<infer SV>
        ? {
              has(value: SV | SelectorLensOf<SV>): DataLens<never, WrapEval<Eval, Chain, boolean>, boolean>;
              size(): DataLens<never, WrapEval<Eval, Chain, number>, number>;
          }
        : {}) &
    // Map
    (NonNullable<Chain> extends Map<infer MK, infer MV>
        ? {
              get(key: MK | SelectorLensOf<MK>): DataLens<KeepTarget<Target, Chain, MV>, WrapEval<Eval, Chain, MV>, MV>;
              has(key: MK | SelectorLensOf<MK>): DataLens<never, WrapEval<Eval, Chain, boolean>, boolean>;
              size(): DataLens<never, WrapEval<Eval, Chain, number>, number>;
          }
        : {}) &
    // Custom keyed (SubLensNav — navigable, carries Target)
    (NonNullable<Chain> extends { [SubLensNav]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends (key: infer KT, hint: any, value?: infer VT) => any ? (key: KT | SelectorLensOf<KT>) => DataLens<KeepTarget<Target, Chain, VT>, WrapEval<Eval, Chain, VT>, VT> : never;
          }
        : {}) &
    // Custom named (LensNav — navigable, carries Target)
    (NonNullable<Chain> extends { [LensNav]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends (hint: any, value?: infer VT) => any ? () => DataLens<KeepTarget<Target, Chain, VT>, WrapEval<Eval, Chain, VT>, VT> : never;
          }
        : {});

//#endregion

//#region - Helpers

type ElementOf<T> = NonNullable<T> extends (infer E)[] | readonly (infer E)[] ? E : never;

// Eval wrapping: if Eval ≠ Chain (after each()), wrap result in array
type WrapEval<Eval, Chain, NewChain> = [Eval] extends [Chain] ? NewChain : NewChain[];

// Target cardinality: same logic as WrapEval but applied to Target
// Note: [never] extends [T] is always true, so WrapTarget on never yields the unwrapped type.
// This is intentional: array at()/$(n) should restore Target after where/filter (which set Target = never).
type WrapTarget<Target, Chain, NewChain> = [Target] extends [Chain] ? NewChain : NewChain[];

// Target propagation for non-restoring navigation (object property access, Map.get, custom accessors):
// If Target is never (from read-only ops or where/filter/slice/sort), keep it never.
// Otherwise, apply cardinality wrapping.
type KeepTarget<Target, Chain, NewChain> = [Target] extends [never] ? never : WrapTarget<Target, Chain, NewChain>;

declare const BRAND_TARGET: unique symbol;
declare const BRAND_EVAL: unique symbol;
declare const BRAND_READONLY: unique symbol;

// Output types — what the lens callback must return
// MutatorLensOf/ApplierLensOf require BRAND_READONLY to be absent (?: never).
// DataLens with Target = never adds { [BRAND_READONLY]: true }, creating a structural mismatch.
export type SelectorLensOf<E> = { readonly [BRAND_EVAL]: E };
export type MutatorLensOf<E> = { readonly [BRAND_TARGET]: E; readonly [BRAND_READONLY]?: never };
export type ApplierLensOf<E> = { readonly [BRAND_TARGET]: E; readonly [BRAND_READONLY]?: never };

// Backward compatibility aliases — all three are now DataLens
export type SelectorLens<Eval, Chain = Eval> = DataLens<Eval, Eval, Chain>;
export type MutatorLens<Target, Chain = Target> = DataLens<Target, Target, Chain>;
export type ApplierLens<Target, Chain = Target> = DataLens<Target, Target, Chain>;

//#endregion
