import { Access, AllStringKeys, SafeLookup } from "../types";

export type GetterLens<T> = Accessor<T, "getter"> & {
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
};

// more strict path access.
export type PathLens<T> = Accessor<T, "path"> & {
    // .size() — for arrays, sets, maps, or strings → number
    size(): T extends { length: number } | { size: number } ? PathLens<number> : never;

    // .length() — alias for .size() on array/string
    length(): T extends { length: number } ? PathLens<number> : never;

    // .at(n) — for arrays → element type
    at(index: number): T extends (infer E)[] ? PathLens<E> : never;
};

export type AccessLens<T> = Accessor<T, "access"> & MapAccessor<T, "access">;

// reserved for future use
// V = Value
type SetterLens<V> = any;

type SetAccessor<T, K extends LensKind> = NonNullable<T> extends Set<infer SV> ? { has(value: SV): LensKinds<boolean>[K] } : {};
type MapAccessor<T, K extends LensKind> =
    NonNullable<T> extends Map<infer MK, infer MV>
        ? {
              get(key: MK): LensKinds<MV>[K];
              has(key: MK): LensKinds<boolean>[K];
          }
        : {};
type PropertyAccessor<T, K extends LensKind> = NonNullable<T> extends object ? { <Key extends AllStringKeys<T>>(key: Key): LensKinds<SafeLookup<T, Key>>[K] } : {};
type IndexAccessor<T, K extends LensKind> = NonNullable<T> extends (infer E)[] ? { (index: number): LensKinds<E>[K] } : {};

type AccessibleAccessor<T, K extends LensKind> =
    NonNullable<T> extends { [Access]: infer Methods }
        ? {
              [M in keyof Methods]: Methods[M] extends (key: infer KT) => infer VT ? (key: KT) => LensKinds<VT>[K] : never;
          }
        : {};

type Accessor<T, K extends LensKind> = { readonly [BRAND]: T } & IndexAccessor<T, K> & PropertyAccessor<T, K> & MapAccessor<T, K> & SetAccessor<T, K> & AccessibleAccessor<T, K>;

declare const BRAND: unique symbol;

interface LensKinds<T> {
    getter: GetterLens<T>;
    path: PathLens<T>;
    access: AccessLens<T>;
}
type LensKind = keyof LensKinds<any>;
