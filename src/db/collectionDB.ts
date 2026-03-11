import { CollectionLens, CollectionId, Updater, CollectionSelector, ListOr, CollectionMemberOf } from "../types";

export class CollectionDB<D> {
    //#region CRUD Operations

    select: {
        (lens: CollectionLens<D>): unknown;
    } = () => {};
    insert: {
        (id: CollectionId, data: D): unknown; //insert one
        (payload: { [id: CollectionId]: D }): unknown; //insert many
    } = () => {};
    update: {
        (target: CollectionLens<D>, payload: Updater<unknown, CollectionMemberOf<D>>): unknown;
        (target: CollectionSelector<D>, payload: Updater<D, CollectionMemberOf<D>>): unknown; // this might be superfluous given the above overload
        (target: ListOr<CollectionId>, payload: Updater<D, CollectionMemberOf<D>>): unknown;
        (payload: { [id: CollectionId]: Updater<D, CollectionMemberOf<D>> }): unknown;
    } = () => {};
    remove: {
        (nodes: CollectionSelector<D> | ListOr<CollectionId>): unknown;
    } = () => {};

    //#endregion

    //#region Meta Operations

    addIndex = () => {};
    removeIndex = () => {};

    //#endregion
}
