import { AllStringKeys, SafeLookup } from "../types";

declare const BRAND: unique symbol;
export type GetterLens<T> = {
    readonly [BRAND]: T;

    // .size() — for arrays, sets, maps, or strings → number
    size(): T extends { length: number } | { size: number } ? GetterLens<number> : never;

    // .length() — alias for .size() on array/string
    length(): T extends { length: number } ? GetterLens<number> : never;

    // .keys() — for objects/maps → string[]
    keys(): T extends Record<string, any> ? GetterLens<string[]> : never;

    // .values() — for objects/maps → array of values
    values(): T extends Record<string, infer V> ? GetterLens<V[]> : never;

    // .at(n) — for arrays → element type
    at(index: number): T extends (infer E)[] ? GetterLens<E> : never;
} & (NonNullable<T> extends object
    ? {
          <K extends AllStringKeys<T>>(key: K): GetterLens<SafeLookup<T, K>>;
      }
    : {});

// reserved for future use
// V = Value
type SetterLens<V> = any;
