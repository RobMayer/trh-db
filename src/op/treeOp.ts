import { TreeItemOf, TreeOf } from "../types";

// DO NOT USE IN PRODUCTION. THIS WILL BE REMOVED!

export namespace TreeOp {
    //#region query
    export const has = <N, K extends string>(tree: TreeOf<N>, id: K): tree is TreeOf<N> & Record<K, TreeItemOf<N>> => id in tree;
    export const entry: {
        <N, K extends string>(tree: TreeOf<N> & Record<K, TreeItemOf<N>>, id: K): TreeItemOf<N>;
        <N>(tree: TreeOf<N>, id: string): TreeItemOf<N> | undefined;
    } = (tree: any, id: string) => tree[id];
    export const get: {
        <N, K extends string>(tree: TreeOf<N> & Record<K, TreeItemOf<N>>, id: K): N;
        <N>(tree: TreeOf<N>, id: string): N | undefined;
    } = (tree: any, id: string) => tree[id]?.data;
    //#endregion

    //#region hierarchy
    export const roots = <N>(tree: TreeOf<N>): TreeItemOf<N>[] => Object.values(tree).filter((each) => each.parent === null);
    export const children: {
        <N, K extends string>(tree: TreeOf<N> & Record<K, TreeItemOf<N>>, id: K): TreeItemOf<N>[];
        <N>(tree: TreeOf<N>, id: string): TreeItemOf<N>[] | undefined;
    } = (tree: any, id: string) => tree[id]?.children?.map((each: string) => tree[each]);
    export const parent: {
        <N, K extends string>(tree: TreeOf<N> & Record<K, TreeItemOf<N>>, id: K): TreeItemOf<N> | null;
        <N>(tree: TreeOf<N>, id: string): TreeItemOf<N> | null | undefined;
    } = (tree: any, id: string) => {
        const p = tree[id]?.parent;
        return p === null ? null : p === undefined ? undefined : tree[p];
    };
    export const ancestors: {
        <N, K extends string>(tree: TreeOf<N> & Record<K, TreeItemOf<N>>, id: K): TreeItemOf<N>[];
        <N>(tree: TreeOf<N>, id: string): TreeItemOf<N>[] | undefined;
    } = (tree: any, id: string): any => {
        if (!(id in tree)) return undefined;
        let current = tree[id]?.parent;
        const result: string[] = [];
        while (current !== null && current !== undefined) {
            result.push(current);
            current = tree[current]?.parent ?? null;
        }
        return result.map((each: string) => tree[each]);
    };
    export const wideDescendents: {
        <N, K extends string>(tree: TreeOf<N> & Record<K, TreeItemOf<N>>, id: K): TreeItemOf<N>[];
        <N>(tree: TreeOf<N>, id: string): TreeItemOf<N>[] | undefined;
    } = (tree: any, id: string): any => {
        if (!(id in tree)) return undefined;
        const result: any[] = [];
        const queue = [...tree[id].children.map((each: string) => tree[each])];

        while (queue.length > 0) {
            const current = queue.shift()!;
            result.push(current);
            if (current) {
                queue.push(...current.children.map((each: string) => tree[each]));
            }
        }
        return result;
    };
    export const deepDescendents: {
        <N, K extends string>(tree: TreeOf<N> & Record<K, TreeItemOf<N>>, id: K): TreeItemOf<N>[];
        <N>(tree: TreeOf<N>, id: string): TreeItemOf<N>[] | undefined;
    } = (tree: any, id: string): any => {
        if (!(id in tree)) return undefined;
        const result: any[] = [];
        const traverse = (nodeId: string) => {
            (tree[nodeId]?.children ?? []).forEach((childId: string) => {
                result.push(tree[childId]);
                traverse(childId);
            });
        };
        traverse(id);
        return result;
    };
    export const path: {
        <N, K1 extends string, K2 extends string>(tree: TreeOf<N> & Record<K1, TreeItemOf<N>> & Record<K2, TreeItemOf<N>>, from: K1, to: K2): TreeItemOf<N>[];
        <N>(tree: TreeOf<N>, from: string, to: string): TreeItemOf<N>[] | undefined;
    } = (tree: any, from: string, to: string): any => {
        if (!tree[from] || !tree[to]) return undefined;
        if (from === to) return [tree[from]];

        // collect from's ancestor chain + set for O(1) lookup
        const fromChain: string[] = [from];
        let current = tree[from];
        while (current.parent !== null) {
            fromChain.push(current.parent);
            current = tree[current.parent];
        }
        const fromSet = new Set(fromChain);

        // walk up from `to` until we intersect fromChain
        const toChain: string[] = [to];
        current = tree[to];
        while (!fromSet.has(current.id)) {
            if (current.parent === null) return []; // different roots
            toChain.push(current.parent);
            current = tree[current.parent];
        }

        // current.id is the LCA
        const lcaIndex = fromChain.indexOf(current.id);
        return [...fromChain.slice(0, lcaIndex + 1), ...toChain.slice(0, -1).reverse()].map((each: string) => tree[each]);
    };
    //#endregion
}
