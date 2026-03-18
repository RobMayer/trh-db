export type CodecData<D> = () => { [id: string]: D };

export type Codec<D extends { id: string; data: any }, M extends DBMeta<any> = DBMeta<null>> = {
    update: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    insert: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    delete: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    struct: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    load: () => Promise<[data: { [id: string]: D }, meta: M | null]>;
    flush: (data: CodecData<D>, meta: M | null) => Promise<void>;
    setMeta: (value: M | null, data: CodecData<D>) => Promise<void>;
};

export type DBMeta<U> = { user: U; type: string; version: number };

export type ListOf<D> = Set<D> | D[];
export type ListOr<D> = D | Set<D> | D[];
export type Updater<T, C> = T | ((prev: T, context: C) => T);

export type GraphNodeId = string;
export type GraphLinkId = string;
export type GraphSocketId = string;

export type GraphNodeSelector<N, L> = any; // lens-like interface for selecting nodes in a graph
export type GraphNodeLens<N, L> = any; // lens-like interface for selecting node(s) properties in a graph
export type GraphLinkSelector<N, L> = any; // lens-like interface for selecting links in a graph
export type GraphLinkLens<N, L> = any; // lens-like interface for link(s) properties in a graph

export type GraphOf<N, L> = { nodes: { [id: GraphNodeId]: GraphNodeOf<N> }; links: { [id: GraphLinkId]: GraphLinkOf<L> } };
export type GraphNodeOf<N> = { id: GraphNodeId; type: "node"; in: GraphLinkId[]; out: GraphLinkId[]; data: N };
export type GraphLinkOf<L> = { id: GraphLinkId; type: "link"; from: GraphNodeId; to: GraphNodeId; data: L };

export type SocketedGraphOf<N, L> = { nodes: { [id: GraphNodeId]: SocketedGraphNodeOf<N> }; links: { [id: GraphLinkId]: SocketedGraphLinkOf<L> } };
export type SocketedGraphNodeOf<N> = { id: GraphNodeId; in: { [key: GraphSocketId]: GraphLinkId[] }; out: { [key: GraphSocketId]: GraphLinkId[] }; data: N };
export type SocketedGraphLinkOf<L> = { id: GraphLinkId; fromNode: GraphNodeId; toNode: GraphNodeId; fromSocket: GraphSocketId; toSocket: GraphSocketId; data: L };
