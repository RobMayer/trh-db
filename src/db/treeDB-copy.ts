import { ListOr, TreeId, TreeItemOf, TreeLens, TreeOf, TreeSelector, Updater } from "../types";

export class TreeDB<D> {
    //#region CRUD operations

    select: {
        (lens: TreeLens<D>): unknown;
    } = () => {};
    update: {
        (target: TreeLens<D>, payload: Updater<unknown, TreeItemOf<D>>): unknown;
        (target: TreeSelector<D>, payload: Updater<D, TreeItemOf<D>>): unknown; // this might be superfluous given the above overload
        (target: ListOr<TreeId>, payload: Updater<D, TreeItemOf<D>>): unknown;
        (payload: { [id: TreeId]: Updater<D, TreeItemOf<D>> }): unknown;
    } = () => {};
    insert: {
        (id: TreeId, data: D, parent: string | null): unknown;
        (payload: { [id: TreeId]: [data: D, parent: TreeId | null] }): unknown;
    } = () => {}; //need a good way to insert multiple
    pluck: {
        (target: TreeSelector<D> | ListOr<TreeId>): unknown;
    } = () => {}; // remove this node - children of this node become roots
    splice: {
        (target: TreeSelector<D> | ListOr<TreeId>): unknown;
    } = () => {}; // remove this node - children of this node become children of this node's parent
    prune: {
        (target: TreeSelector<D> | ListOr<TreeId>): unknown;
    } = () => {}; // remove subtree starting at a given node.
    trim: {
        (target: TreeSelector<D> | ListOr<TreeId>): unknown;
    } = () => {}; // remove node so long as it has no children
    graft: {
        (subttree: TreeOf<D>): unknown;
    } = () => {}; // merge in subtree
    move: {
        (target: TreeSelector<D> | ListOr<TreeId>, newParent: Updater<string | null, TreeItemOf<D>>): unknown;
        (payload: { [id: TreeId]: Updater<string | null, TreeItemOf<D>> }): unknown;
    } = () => {};

    //#endregion
    //#region Meta

    addIndex = () => {};
    removeIndex = () => {};

    //#endregion
}
