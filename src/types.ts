export type Codec = {
    serialize: (value: unknown) => unknown;
    parse: (token: unknown) => unknown;
};

export type ListOr<D> = D | Set<D> | D[];
export type Updater<T, C> = T | ((prev: T, context: C) => T);

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
