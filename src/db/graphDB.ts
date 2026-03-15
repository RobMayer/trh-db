import { GraphLinkId, GraphLinkLens, GraphLinkOf, GraphLinkSelector, GraphNodeId, GraphNodeLens, GraphNodeOf, GraphNodeSelector, ListOr, Updater } from "../types";

export class GraphDB<N, L> {
    //#region CRUD operations

    #data: { [id: string]: (GraphNodeOf<N> & { type: "node" }) | (GraphLinkOf<L> & { type: "link" }) } = {}; // lump data - easier for codecs
    #nodes: { [id: string]: string } = {}; // node lookups
    #links: { [id: string]: string } = {}; // link lookups

    select: {
        (lens: GraphNodeLens<N, L>): unknown; // select link(s), node(s), or property(s)
    } = () => {};
    updateNode: {
        (target: GraphNodeLens<N, L> | ListOr<GraphNodeId>, payload: Updater<N, GraphNodeOf<N>>): unknown;
        (payload: { [id: GraphNodeId]: Updater<N, GraphNodeOf<N>> }): unknown;
    } = () => {};
    remove: {
        (nodes: GraphNodeSelector<N, L> | ListOr<GraphNodeId>): unknown;
    } = () => {};
    insert: {
        (id: GraphNodeId, payload: N): unknown; //insert one
        (payload: { [id: GraphNodeId]: N }): unknown; //insert many
    } = () => {};
    link: {
        (from: GraphNodeSelector<N, L> | ListOr<GraphNodeId>, to: GraphNodeSelector<N, L> | ListOr<GraphNodeId>, payload: L | ((from: GraphNodeOf<N>, to: GraphNodeOf<N>) => L)): unknown;
    } = () => {};
    updateLink: {
        (target: GraphLinkLens<N, L>, payload: Updater<unknown, GraphLinkOf<L>>): unknown; // update data or some nested field of data
        (target: GraphLinkSelector<N, L>, payload: Updater<L, GraphLinkOf<L>>): unknown; // update data  - this might be superfluous given the above overload
        (target: ListOr<GraphLinkId>, payload: Updater<L, GraphLinkOf<L>>): unknown; // update data on selected
        (payload: { [id: GraphLinkId]: Updater<L, GraphLinkOf<L>> }): unknown; // bulk update
    } = () => {};
    unlink: {
        (links: GraphLinkSelector<N, L> | ListOr<GraphLinkId>): unknown;
    } = () => {};

    //#endregion
    //#region Meta

    addNodeIndex = () => {};
    removeNodeIndex = () => {};
    addLinkIndex = () => {};
    removeLinkIndex = () => {};

    //#endregion
}
