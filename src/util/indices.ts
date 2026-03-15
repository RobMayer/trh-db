import { LensPathSegment } from "../types";
import { sortCompare } from "./predicate";

//#region - Path Serialization

const ESCAPE = /([.,()\\])/g;

export const stringifyIndex = (path: LensPathSegment[]) => {
    return path
        .map((segment) => {
            switch (segment.type) {
                case "property":
                    return segment.key.replace(ESCAPE, "\\$1");
                case "index":
                    return `${segment.index}`;
                case "accessor":
                    return `${segment.name.replace(ESCAPE, "\\$1")}(${(segment?.args ?? []).map((e) => `${e}`.replace(ESCAPE, "\\$1")).join(",")})`;
            }
        })
        .join(".");
};

//#endregion

//#region - BTree

const ORDER = 32;
const MIN_KEYS = ORDER - 1; // minimum keys in a non-root node
const MAX_KEYS = 2 * ORDER - 1; // maximum keys in any node

type BTreeNode<V> = {
    keys: unknown[];
    values: V[];
    children: BTreeNode<V>[];
};

const leaf = <V>(): BTreeNode<V> => ({ keys: [], values: [], children: [] });
const isLeaf = <V>(node: BTreeNode<V>) => node.children.length === 0;

class BTree<V> {
    #root: BTreeNode<V> = leaf();
    #size = 0;

    get size() {
        return this.#size;
    }

    // --- Lookup ---

    get(key: unknown): V | undefined {
        return this.#find(this.#root, key);
    }

    has(key: unknown): boolean {
        return this.get(key) !== undefined;
    }

    #find(node: BTreeNode<V>, key: unknown): V | undefined {
        let i = this.#search(node, key);
        if (i < node.keys.length && sortCompare(key, node.keys[i]) === 0) {
            return node.values[i];
        }
        if (isLeaf(node)) return undefined;
        return this.#find(node.children[i], key);
    }

    // Binary search: returns index of first key >= search key
    #search(node: BTreeNode<V>, key: unknown): number {
        let lo = 0, hi = node.keys.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (sortCompare(node.keys[mid], key) < 0) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    // --- Insert ---

    set(key: unknown, value: V): void {
        const root = this.#root;
        if (root.keys.length === MAX_KEYS) {
            const newRoot: BTreeNode<V> = { keys: [], values: [], children: [root] };
            this.#splitChild(newRoot, 0);
            this.#root = newRoot;
        }
        this.#insertNonFull(this.#root, key, value);
    }

    #insertNonFull(node: BTreeNode<V>, key: unknown, value: V): void {
        let i = this.#search(node, key);

        // Key exists — replace value
        if (i < node.keys.length && sortCompare(key, node.keys[i]) === 0) {
            node.values[i] = value;
            return;
        }

        if (isLeaf(node)) {
            node.keys.splice(i, 0, key);
            node.values.splice(i, 0, value);
            this.#size++;
            return;
        }

        if (node.children[i].keys.length === MAX_KEYS) {
            this.#splitChild(node, i);
            if (sortCompare(key, node.keys[i]) > 0) i++;
            else if (sortCompare(key, node.keys[i]) === 0) {
                node.values[i] = value;
                return;
            }
        }

        this.#insertNonFull(node.children[i], key, value);
    }

    #splitChild(parent: BTreeNode<V>, i: number): void {
        const full = parent.children[i];
        const mid = ORDER - 1;
        const right: BTreeNode<V> = {
            keys: full.keys.splice(mid + 1),
            values: full.values.splice(mid + 1),
            children: isLeaf(full) ? [] : full.children.splice(mid + 1),
        };
        const midKey = full.keys.pop()!;
        const midVal = full.values.pop()!;

        parent.keys.splice(i, 0, midKey);
        parent.values.splice(i, 0, midVal);
        parent.children.splice(i + 1, 0, right);
    }

    // --- Delete ---

    delete(key: unknown): boolean {
        const found = this.#delete(this.#root, key);
        if (found) this.#size--;
        // Shrink tree if root is empty but has a child
        if (this.#root.keys.length === 0 && !isLeaf(this.#root)) {
            this.#root = this.#root.children[0];
        }
        return found;
    }

    #delete(node: BTreeNode<V>, key: unknown): boolean {
        let i = this.#search(node, key);
        const found = i < node.keys.length && sortCompare(key, node.keys[i]) === 0;

        if (isLeaf(node)) {
            if (!found) return false;
            node.keys.splice(i, 1);
            node.values.splice(i, 1);
            return true;
        }

        if (found) {
            // Replace with predecessor (rightmost key in left subtree)
            const left = node.children[i];
            if (left.keys.length > MIN_KEYS) {
                const [predKey, predVal] = this.#removePredecessor(left);
                node.keys[i] = predKey;
                node.values[i] = predVal;
                return true;
            }
            // Replace with successor (leftmost key in right subtree)
            const right = node.children[i + 1];
            if (right.keys.length > MIN_KEYS) {
                const [succKey, succVal] = this.#removeSuccessor(right);
                node.keys[i] = succKey;
                node.values[i] = succVal;
                return true;
            }
            // Merge children and recurse
            this.#merge(node, i);
            return this.#delete(node.children[i], key);
        }

        // Key not in this node — descend into child
        const child = node.children[i];
        if (child.keys.length <= MIN_KEYS) {
            this.#fill(node, i);
            // After fill, the index may have shifted
            if (i > node.keys.length) i--;
            // If merge happened, key might now be in merged node
            if (i < node.keys.length && sortCompare(key, node.keys[i]) > 0) i++;
        }
        return this.#delete(node.children[i], key);
    }

    #removePredecessor(node: BTreeNode<V>): [unknown, V] {
        if (isLeaf(node)) return [node.keys.pop()!, node.values.pop()!];
        const last = node.children.length - 1;
        if (node.children[last].keys.length <= MIN_KEYS) this.#fill(node, last);
        return this.#removePredecessor(node.children[node.children.length - 1]);
    }

    #removeSuccessor(node: BTreeNode<V>): [unknown, V] {
        if (isLeaf(node)) return [node.keys.shift()!, node.values.shift()!];
        if (node.children[0].keys.length <= MIN_KEYS) this.#fill(node, 0);
        return this.#removeSuccessor(node.children[0]);
    }

    #fill(parent: BTreeNode<V>, i: number): void {
        // Borrow from left sibling
        if (i > 0 && parent.children[i - 1].keys.length > MIN_KEYS) {
            this.#borrowFromLeft(parent, i);
        }
        // Borrow from right sibling
        else if (i < parent.children.length - 1 && parent.children[i + 1].keys.length > MIN_KEYS) {
            this.#borrowFromRight(parent, i);
        }
        // Merge with a sibling
        else {
            if (i < parent.children.length - 1) this.#merge(parent, i);
            else this.#merge(parent, i - 1);
        }
    }

    #borrowFromLeft(parent: BTreeNode<V>, i: number): void {
        const child = parent.children[i];
        const left = parent.children[i - 1];
        child.keys.unshift(parent.keys[i - 1]);
        child.values.unshift(parent.values[i - 1]);
        parent.keys[i - 1] = left.keys.pop()!;
        parent.values[i - 1] = left.values.pop()!;
        if (!isLeaf(left)) child.children.unshift(left.children.pop()!);
    }

    #borrowFromRight(parent: BTreeNode<V>, i: number): void {
        const child = parent.children[i];
        const right = parent.children[i + 1];
        child.keys.push(parent.keys[i]);
        child.values.push(parent.values[i]);
        parent.keys[i] = right.keys.shift()!;
        parent.values[i] = right.values.shift()!;
        if (!isLeaf(right)) child.children.push(right.children.shift()!);
    }

    #merge(parent: BTreeNode<V>, i: number): void {
        const left = parent.children[i];
        const right = parent.children[i + 1];
        left.keys.push(parent.keys[i], ...right.keys);
        left.values.push(parent.values[i], ...right.values);
        if (!isLeaf(right)) left.children.push(...right.children);
        parent.keys.splice(i, 1);
        parent.values.splice(i, 1);
        parent.children.splice(i + 1, 1);
    }

    // --- Iteration ---

    *entries(): Generator<[unknown, V]> {
        yield* this.#inorder(this.#root);
    }

    *#inorder(node: BTreeNode<V>): Generator<[unknown, V]> {
        for (let i = 0; i < node.keys.length; i++) {
            if (!isLeaf(node)) yield* this.#inorder(node.children[i]);
            yield [node.keys[i], node.values[i]];
        }
        if (!isLeaf(node)) yield* this.#inorder(node.children[node.keys.length]);
    }

    *#reverseInorder(node: BTreeNode<V>): Generator<[unknown, V]> {
        for (let i = node.keys.length - 1; i >= 0; i--) {
            if (!isLeaf(node)) yield* this.#reverseInorder(node.children[i + 1]);
            yield [node.keys[i], node.values[i]];
        }
        if (!isLeaf(node)) yield* this.#reverseInorder(node.children[0]);
    }

    *entriesReversed(): Generator<[unknown, V]> {
        yield* this.#reverseInorder(this.#root);
    }

    // --- Range queries ---

    *gte(key: unknown): Generator<[unknown, V]> {
        yield* this.#rangeFrom(this.#root, key, true);
    }

    *gt(key: unknown): Generator<[unknown, V]> {
        yield* this.#rangeFrom(this.#root, key, false);
    }

    *#rangeFrom(node: BTreeNode<V>, key: unknown, inclusive: boolean): Generator<[unknown, V]> {
        const i = this.#search(node, key);
        const matched = i < node.keys.length && sortCompare(key, node.keys[i]) === 0;

        // Partial traversal of children[i]
        if (!isLeaf(node)) yield* this.#rangeFrom(node.children[i], key, inclusive);

        // Yield key at position i (skip if exclusive exact match)
        if (i < node.keys.length && (!matched || inclusive)) {
            yield [node.keys[i], node.values[i]];
        }

        // Yield everything after position i
        for (let j = i + 1; j < node.keys.length; j++) {
            if (!isLeaf(node)) yield* this.#inorder(node.children[j]);
            yield [node.keys[j], node.values[j]];
        }
        if (!isLeaf(node) && i < node.keys.length) {
            yield* this.#inorder(node.children[node.keys.length]);
        }
    }

    *lte(key: unknown): Generator<[unknown, V]> {
        yield* this.#rangeTo(this.#root, key, true);
    }

    *lt(key: unknown): Generator<[unknown, V]> {
        yield* this.#rangeTo(this.#root, key, false);
    }

    *#rangeTo(node: BTreeNode<V>, key: unknown, inclusive: boolean): Generator<[unknown, V]> {
        let i = this.#search(node, key);
        // Yield keys before the boundary
        for (let j = 0; j < i; j++) {
            if (!isLeaf(node)) yield* this.#inorder(node.children[j]);
            yield [node.keys[j], node.values[j]];
        }
        // Handle boundary key
        if (i < node.keys.length && sortCompare(key, node.keys[i]) === 0) {
            if (!isLeaf(node)) yield* this.#rangeTo(node.children[i], key, inclusive);
            if (inclusive) yield [node.keys[i], node.values[i]];
        } else {
            if (!isLeaf(node)) yield* this.#rangeTo(node.children[i], key, inclusive);
        }
    }

    *range(lo: unknown, hi: unknown, loInclusive = true, hiInclusive = true): Generator<[unknown, V]> {
        for (const entry of this.gte(lo)) {
            const cmp = sortCompare(entry[0], lo);
            if (cmp === 0 && !loInclusive) continue;
            const cmpHi = sortCompare(entry[0], hi);
            if (cmpHi > 0) return;
            if (cmpHi === 0 && !hiInclusive) return;
            yield entry;
        }
    }
}

//#endregion

//#region - IndexStore

export class IndexStore {
    #indices = new Map<string, BTree<Set<string>>>();

    // --- Index lifecycle ---

    create(path: LensPathSegment[]): void {
        const key = stringifyIndex(path);
        if (!this.#indices.has(key)) this.#indices.set(key, new BTree());
    }

    drop(path: LensPathSegment[]): void {
        this.#indices.delete(stringifyIndex(path));
    }

    has(path: LensPathSegment[]): boolean {
        return this.#indices.has(stringifyIndex(path));
    }

    // --- Maintenance ---

    index(pathKey: string, value: unknown, id: string): void {
        const tree = this.#indices.get(pathKey);
        if (!tree) return;
        let ids = tree.get(value);
        if (!ids) {
            ids = new Set();
            tree.set(value, ids);
        }
        ids.add(id);
    }

    deindex(pathKey: string, value: unknown, id: string): void {
        const tree = this.#indices.get(pathKey);
        if (!tree) return;
        const ids = tree.get(value);
        if (!ids) return;
        ids.delete(id);
        if (ids.size === 0) tree.delete(value);
    }

    // --- Queries ---

    eq(pathKey: string, value: unknown): ReadonlySet<string> {
        const tree = this.#indices.get(pathKey);
        if (!tree) return EMPTY_SET;
        return tree.get(value) ?? EMPTY_SET;
    }

    gt(pathKey: string, value: unknown): Set<string> {
        return this.#collect(this.#indices.get(pathKey)?.gt(value));
    }

    gte(pathKey: string, value: unknown): Set<string> {
        return this.#collect(this.#indices.get(pathKey)?.gte(value));
    }

    lt(pathKey: string, value: unknown): Set<string> {
        return this.#collect(this.#indices.get(pathKey)?.lt(value));
    }

    lte(pathKey: string, value: unknown): Set<string> {
        return this.#collect(this.#indices.get(pathKey)?.lte(value));
    }

    range(pathKey: string, lo: unknown, hi: unknown, loInclusive = true, hiInclusive = true): Set<string> {
        return this.#collect(this.#indices.get(pathKey)?.range(lo, hi, loInclusive, hiInclusive));
    }

    scan(pathKey: string, dir: "asc" | "desc"): string[] {
        const tree = this.#indices.get(pathKey);
        if (!tree) return [];
        const result: string[] = [];
        const iter = dir === "asc" ? tree.entries() : tree.entriesReversed();
        for (const [, ids] of iter) {
            for (const id of ids) result.push(id);
        }
        return result;
    }

    keys(): string[] {
        return [...this.#indices.keys()];
    }

    #collect(iter?: Generator<[unknown, Set<string>]>): Set<string> {
        if (!iter) return new Set();
        const result = new Set<string>();
        for (const [, ids] of iter) {
            for (const id of ids) result.add(id);
        }
        return result;
    }
}

const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>());

//#endregion
