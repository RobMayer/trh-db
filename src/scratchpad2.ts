/*
    Design Decisions — Pipeline/Cursor API

    D1 — Pipeline model, not monolithic lens
        The DB query system uses a chainable pipeline rather than a single lens callback.
        Each pipeline step transforms the working set of items. The pipeline always operates
        on a flat set of items (not data properties — just whole items).

    D2 — Terminal verbs
        The CRUD action is the *terminator* of the chain, not the initiator.
        .get() returns results. .update(), .pluck(), .prune(), .move(), etc. perform mutations.
        Everything before the terminal is targeting/filtering/traversal.

    D3 — Flexible entry points
        The DB class offers multiple entry points depending on how much you already know:
        - Direct:       myDb.get("someId")                         — bypass pipeline entirely
        - Traversal:    myDb.ancestors("someId").where(...).get()   — start from a known node
        - Full pipeline: myDb.where(...).ancestors().get()          — discovery via filtering

        Shorthand traversal entry points like myDb.children("id"), myDb.deep("id")
        are sugar for myDb.where($ => $.ID, "=", "id").children(), etc.

    D4 — Sublens is a minimal property accessor
        The sublens ($ => $("age"), $ => $("roles").size()) is used only for pointing at
        properties within item data. It does NOT carry query logic, traversal, or filtering.
        This makes it data-shape-agnostic and reusable across DB types (tree, graph, collection).

    D5 — Structural traversal lives on the pipeline
        Methods like .ancestors(), .children(), .deep(), .wide(), .siblings(), .parent()
        are cursor/pipeline methods, not part of the sublens. They expand or transform
        the working set of items by following structural relationships.

    D6 — Flat set default with .each() for per-item sub-pipelines
        Traversal methods (e.g., .ancestors()) flatMap by default — all results go into
        one flat set. For per-item semantics, use .each():
            myDb.where(...).each(q => q.ancestors().last()).get()
        .each() scopes a sub-pipeline per item, collects results back into the outer set.
        .each() can be nested.

    D7 — Items only; projection is a separate terminal
        The pipeline always yields whole items (TreeItemOf<D>, etc.), never raw data values.
        The sublens peeks into data for filtering/sorting purposes, but the pipeline result
        is always items. If data reshaping is needed, a .project() terminal handles it.
        This eliminates the "items vs data" mode tracking from the lens design.

    D8 — Cardinality tracking (single vs multi)
        The pipeline tracks whether the result is a single item or multiple items.
        .first(), .last(), .at(n) collapse to single. .where(), traversals stay multi.
        The terminal's return type reflects this:
            .get() after multi  → Item[]
            .get() after single → Item | undefined
            .get("someId")      → Item | undefined

    D9 — Presentation methods on the pipeline
        .sort(), .distinct(), .paginate(), .slice(), .first(), .last(), .at()
        are pipeline methods that shape results without changing what's selected.
        .distinct() is explicit — deduplication is never implicit.

    D10 — Implicit AND for chained .where(), combinatorial logic for OR
        Multiple .where() calls chain as implicit AND.
        OR / complex boolean logic uses $.or() and $.and() inside a single .where():
            myDb.where($ => $.or(
                [$("age"), ">", 12],
                [$("roles"), "=|", ["admin", "superadmin"]]
            )).get()
        Tuple form [sublens, operator, value] for predicates within combinators (to be validated).

    D11 — Sublens on both sides of comparators
        The right-hand side of .where() can be a value OR another sublens, enabling
        intra-item comparisons:
            .where($ => $("age"), "=", $ => $("roles").size())

    D12 — Shared infrastructure across DB shapes
        Sublens, .where(), .sort(), .distinct(), .paginate(), .first(), .last(), .get(),
        .update() etc. are shared across all DB types.
        DB-specific methods:
        - Tree: .roots(), .children(), .parent(), .ancestors(), .deep(), .wide(), .siblings()
        - Graph: TBD — complicated by dual item types (nodes + links)
        - Collection: essentially just the shared base

    D13 — Operator system carried forward from typeScratchpad.ts
        The full operator set ("=", "!=", ">", "<", ">=", "<=", "><", "%", "?", "=|", etc.)
        and their semantics (including range tuples for "><") carry forward unchanged.

    Open questions:
    - Tuple predicate typing: can generics + mapped variadic tuples make [sublens, op, value] type-safe?
    - Mutation method specifics: what .update(), .move(), etc. look like as terminals

    

*/

import { ListOr, TreeId, TreeItemOf, Updater } from "./types";

class TreeDBNew<D> {
    // without chain building
    get: {
        (target: ListOr<TreeId>): Promise<unknown>;
    } = async () => {};
    pluck: {
        (target: ListOr<TreeId>): Promise<unknown>;
    } = async () => {};
    move: {
        (target: ListOr<TreeId>, newParent: Updater<string | null, TreeItemOf<D>>): Promise<unknown>;
        (payload: { [id: TreeId]: Updater<string | null, TreeItemOf<D>> }): Promise<unknown>;
    } = async () => {};
    // etc....

    // chain quickstart
    ancestors: {
        (target: ListOr<TreeId>): unknown; // chain...
    } = () => {};

    select: {
        (target: ListOr<TreeId>): unknown; // chain...
    } = () => {};

    parent: {
        (target: ListOr<TreeId>): unknown; // chain...
    } = () => {};

    children: {
        (target: ListOr<TreeId>): unknown; // chain...
    } = () => {};

    where: {
        (nowTheFunBegins: unknown): unknown; //chain
    } = () => {};
}

interface SelectorTerminator {
    get: () => Promise<unknown>;
    move: (newParent: string | null | ((item: unknown) => string | null)) => Promise<unknown>;
    pluck: () => Promise<unknown>;
    //...etc
}
