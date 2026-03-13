import { GetterLens, QueryLens } from "./types";

export namespace Lens {
    export const query = <D, R>(data: D, lens: ($: QueryLens<D>) => QueryLens<R>): R => {
        return {} as any;
    };
    export const get = <D, R>(data: D, lens: ($: GetterLens<D>) => GetterLens<R>): R => {
        return {} as any;
    };
    /*
    todo: after we solidify what MutateLens and ApplyLens is like
    const mutate = <D, R>(data: D, lens: ($: GetterLens<D>) => GetterLens<R>, value: R | ((prev: R) => R)): void => {};
    const apply = <D, R>(data: D, lens: ($: GetterLens<D>) => GetterLens<R>, value: R | ((prev: R) => R)): D => {
        return {} as any;
    };
    */
}
