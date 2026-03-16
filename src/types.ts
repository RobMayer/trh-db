export type Codec<D extends { id: string; data: any }, M = null> = {
    update: (items: D[], data: { [id: string]: D }) => Promise<void>;
    insert: (items: D[], data: { [id: string]: D }) => Promise<void>;
    delete: (items: D[], data: { [id: string]: D }) => Promise<void>;
    struct: (items: D[], data: { [id: string]: D }) => Promise<void>;
    load: () => Promise<{ [id: string]: D }>;
    flush: (data: { [id: string]: D }) => Promise<void>;
    metadata: M | null;
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

export type LensPathSegment = { type: "property"; key: string } | { type: "index"; index: number } | { type: "accessor"; name: string; args?: unknown[] };

export type TreeId = string;
export type TreeOf<D> = { [id: TreeId]: TreeItemOf<D> };
export type TreeItemOf<D> = { id: TreeId; parent: TreeId | null; children: TreeId[]; data: D };

export type TreeSelector<D> = any; // lens-like interface for selecting members(s) in a tree
export type TreeLens<D> = any; // lens-like interface for selecting members or properties thereof in a tree

export type CollectionId = string;
export type CollectionOf<D> = { [id: CollectionId]: CollectionMemberOf<D> };
export type CollectionMemberOf<D> = { id: CollectionId; data: D };

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
