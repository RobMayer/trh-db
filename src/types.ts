export type Codec = {
    serialize: (value: unknown) => unknown;
    parse: (token: unknown) => unknown;
};

// --- Union-safe key distribution ---

// Distributes keyof over union members: AllStringKeys<A | B> = keyof A | keyof B
export type AllStringKeys<T> = T extends any ? keyof T & string : never;

// Safe lookup across union members: yields the value type where the key exists, undefined elsewhere
export type SafeLookup<T, K extends string> = T extends any ? (K extends keyof T ? T[K] : undefined) : never;

export type ListOf<D> = Set<D> | D[];
export type ListOr<D> = D | Set<D> | D[];
export type Updater<T, C> = T | ((prev: T, context: C) => T);

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
export type DeepReadonly<T> = T extends Primitive
    ? T
    : T extends Function
      ? T
      : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepReadonly<U>>
        : T extends ReadonlyMap<infer K, infer V>
          ? ReadonlyMap<K, DeepReadonly<V>>
          : T extends ReadonlySet<infer U>
            ? ReadonlySet<DeepReadonly<U>>
            : { readonly [K in keyof T]: DeepReadonly<T[K]> };

export type TreeId = string;
export type TreeOf<D> = { [id: TreeId]: TreeItemOf<D> };
export type TreeItemOf<D> = { id: TreeId; parent: TreeId | null; children: TreeId[]; data: D };

export type TreeSelector<D> = any; // lens-like interface for selecting members(s) in a tree
export type TreeLens<D> = any; // lens-like interface for selecting members or properties thereof in a tree

export type CollectionId = string;
export type CollectionOf<D> = { [id: CollectionId]: CollectionMemberOf<D> };
export type CollectionMemberOf<D> = { id: CollectionId; data: D };

export type CollectionSelector<D> = any; // lens-like interface for selecting a document in a collection
export type CollectionLens<D> = any; // lens-like interface for selecting a document or some property therein

export type GraphNodeId = string;
export type GraphLinkId = string;
export type GraphSocketId = string;

export type GraphNodeSelector<N, L> = any; // lens-like interface for selecting nodes in a graph
export type GraphNodeLens<N, L> = any; // lens-like interface for selecting node(s) properties in a graph
export type GraphLinkSelector<N, L> = any; // lens-like interface for selecting links in a graph
export type GraphLinkLens<N, L> = any; // lens-like interface for link(s) properties in a graph

export type GraphOf<N, L> = { nodes: { [id: GraphNodeId]: GraphNodeOf<N> }; links: { [id: GraphLinkId]: GraphLinkOf<L> } };
export type GraphNodeOf<N> = { id: GraphNodeId; in: GraphLinkId[]; out: GraphLinkId[]; data: N };
export type GraphLinkOf<L> = { id: GraphLinkId; from: GraphNodeId; to: GraphNodeId; data: L };

export type SocketedGraphOf<N, L> = { nodes: { [id: GraphNodeId]: SocketedGraphNodeOf<N> }; links: { [id: GraphLinkId]: SocketedGraphLinkOf<L> } };
export type SocketedGraphNodeOf<N> = { id: GraphNodeId; in: { [key: GraphSocketId]: GraphLinkId[] }; out: { [key: GraphSocketId]: GraphLinkId[] }; data: N };
export type SocketedGraphLinkOf<L> = { id: GraphLinkId; fromNode: GraphNodeId; toNode: GraphNodeId; fromSocket: GraphSocketId; toSocket: GraphSocketId; data: L };

export const Compare = Symbol();
export const Equals = Symbol();
export const TypeOf = Symbol();

export const LensAccess = Symbol();
export const LensSubAccess = Symbol();

export const LensSelect = Symbol();
export const LensSubSelect = Symbol();

export const LensMutate = Symbol();
export const LensSubMutate = Symbol();

export const LensApply = Symbol();
export const LensSubApply = Symbol();

export const Setter = Symbol();

export interface Comparable {
    [Compare]: (other: unknown) => number; // -1, 0, 1
}

export interface Equatable {
    [Equals]: (other: unknown) => boolean;
}

export interface Typeable {
    [TypeOf]: () => string;
}

// sub-records

export interface LensSubAccessible<T extends { [method: string]: [any, any] }> {
    [LensSubAccess]: {
        [M in keyof T]: (key: T[M][0]) => T[M][1];
    };
}

export interface LensSubSelectable<T extends { [method: string]: [any, any] }> {
    [LensSubSelect]: {
        [M in keyof T]: (key: T[M][0]) => T[M][1];
    };
}

export interface LensSubMutable<T extends { [method: string]: [any, any] }> extends LensSubAccessible<T> {
    [LensSubMutate]: {
        [M in keyof T]: (key: T[M][0], value: T[M][1]) => void;
    };
}

export interface LensSubApplicable<T extends { [method: string]: [any, any] }> extends LensSubAccessible<T> {
    [LensSubApply]: {
        [M in keyof T]: (key: T[M][0], value: T[M][1]) => this;
    };
}

// property

export interface LensSelectable<T extends { [method: string]: any }> {
    [LensSelect]: {
        [M in keyof T]: () => T[M];
    };
}

export interface LensAccessible<T extends { [method: string]: any }> {
    [LensAccess]: {
        [M in keyof T]: () => T[M];
    };
}

export interface LensApplicable<T extends { [method: string]: any }> extends LensAccessible<T> {
    [LensApply]: {
        [M in keyof T]: (value: T[M]) => this;
    };
}

export interface LensMutable<T extends { [method: string]: any }> extends LensAccessible<T> {
    [LensMutate]: {
        [M in keyof T]: (value: T[M]) => void; // void?
    };
}
