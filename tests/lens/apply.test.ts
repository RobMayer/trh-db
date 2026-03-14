import { describe, it, expect } from "vitest";
import { Lens } from "../../src/util/lens";
import { LensNav } from "../../src/types";

// Path segment helpers for assertions
const P = (key: string) => ({ type: "property" as const, key });
const I = (index: number) => ({ type: "index" as const, index });
const A = (name: string, ...args: string[]) => (args.length > 0 ? { type: "accessor" as const, name, args } : { type: "accessor" as const, name });

// --- Test fixtures ---

const makePerson = () => ({
    name: "Rob",
    age: 30,
    address: {
        city: "Portland",
        zip: "97201",
    },
    roles: ["admin", "editor", "viewer"],
    scores: [95, 82, 71, 88],
    prefs: new Map<string, number>([
        ["theme", 1],
        ["fontSize", 14],
    ]),
});

const makeTeam = () => [
    { name: "Alice", age: 25, role: "dev" },
    { name: "Bob", age: 35, role: "lead" },
    { name: "Carol", age: 28, role: "dev" },
    { name: "Dave", age: 40, role: "manager" },
];

const makeMatrix = () => ({
    rows: [
        [{ val: 1 }, { val: 2 }],
        [{ val: 3 }, { val: 4 }],
        [{ val: 5 }, { val: 6 }],
    ],
});

// --- Lens.apply tests ---

describe("Lens.apply", () => {
    describe("property access", () => {
        it("returns a new object with the property changed", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("name"), "Alice");
            expect(result.name).toBe("Alice");
            expect(data.name).toBe("Rob"); // original unchanged
        });

        it("applies an updater function", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("age"), (prev) => prev + 1);
            expect(result.age).toBe(31);
            expect(data.age).toBe(30); // original unchanged
        });

        it("applies to a nested property with structural sharing", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("address")("city"), "Seattle");
            expect(result.address.city).toBe("Seattle");
            expect(data.address.city).toBe("Portland"); // original unchanged
            expect(result.roles).toBe(data.roles); // unchanged subtree shares reference
        });
    });

    describe("structural sharing", () => {
        it("shares identity for unchanged siblings", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("address")("city"), "Seattle");
            expect(result).not.toBe(data); // new root
            expect(result.address).not.toBe(data.address); // new address (modified spine)
            expect(result.roles).toBe(data.roles); // same reference
            expect(result.scores).toBe(data.scores); // same reference
            expect(result.prefs).toBe(data.prefs); // same reference
        });

        it("shares identity for unchanged array elements", () => {
            const data = makeTeam();
            const result = Lens.apply(data, ($) => $(0)("name"), "Alicia");
            expect(result).not.toBe(data); // new array
            expect(result[0]).not.toBe(data[0]); // new element (modified)
            expect(result[1]).toBe(data[1]); // same reference
            expect(result[2]).toBe(data[2]); // same reference
            expect(result[3]).toBe(data[3]); // same reference
        });
    });

    describe("index access", () => {
        it("applies to an array element by positive index", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("roles")(0), "superadmin");
            expect(result.roles[0]).toBe("superadmin");
            expect(data.roles[0]).toBe("admin"); // original unchanged
        });

        it("applies to an array element by negative index via call syntax", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("scores")(-1), 100);
            expect(result.scores[3]).toBe(100);
            expect(data.scores[3]).toBe(88); // original unchanged
        });

        it("applies via at() with negative index", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("scores").at(-2), 99);
            expect(result.scores[2]).toBe(99);
            expect(data.scores[2]).toBe(71); // original unchanged
        });
    });

    describe("each", () => {
        it("applies to all array elements", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("scores").each(), (prev) => prev * 2);
            expect(result.scores).toEqual([190, 164, 142, 176]);
            expect(data.scores).toEqual([95, 82, 71, 88]); // original unchanged
        });

        it("applies to a property on each element", () => {
            const data = makeTeam();
            const result = Lens.apply(data, ($) => $.each()("age"), (prev) => prev + 1);
            expect(result.map((d: any) => d.age)).toEqual([26, 36, 29, 41]);
            expect(data.map((d) => d.age)).toEqual([25, 35, 28, 40]); // original unchanged
        });

        it("handles nested each (2D array)", () => {
            const data = makeMatrix();
            const result = Lens.apply(data, ($) => $("rows").each().each()("val"), (prev) => prev * 10);
            expect(result.rows[0][0].val).toBe(10);
            expect(result.rows[1][1].val).toBe(40);
            expect(data.rows[0][0].val).toBe(1); // original unchanged
        });
    });

    describe("where", () => {
        it("applies only to matching elements, preserving non-matching refs", () => {
            const data = makeTeam();
            const result = Lens.apply(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).each()("age"), (prev) => prev + 10);
            expect(result[0].age).toBe(35); // Alice: dev → applied
            expect(result[1].age).toBe(35); // Bob: lead → unchanged
            expect(result[2].age).toBe(38); // Carol: dev → applied
            expect(result[3].age).toBe(40); // Dave: manager → unchanged
            // Non-matching elements keep reference identity
            expect(result[1]).toBe(data[1]);
            expect(result[3]).toBe(data[3]);
            // Matching elements are new objects
            expect(result[0]).not.toBe(data[0]);
            expect(result[2]).not.toBe(data[2]);
            // Original unchanged
            expect(data[0].age).toBe(25);
            expect(data[2].age).toBe(28);
        });
    });

    describe("filter", () => {
        it("applies only to elements passing the filter", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("scores").filter((s) => s < 85).each(), (prev) => prev + 10);
            expect(result.scores).toEqual([95, 92, 81, 88]); // 82→92, 71→81
            expect(data.scores).toEqual([95, 82, 71, 88]); // original unchanged
        });
    });

    describe("slice", () => {
        it("applies to elements within the slice range", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("scores").slice(1, 3).each(), () => 0);
            expect(result.scores).toEqual([95, 0, 0, 88]);
            expect(data.scores).toEqual([95, 82, 71, 88]); // original unchanged
        });

        it("applies with negative slice indices", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("scores").slice(-2).each(), (prev) => prev + 100);
            expect(result.scores).toEqual([95, 82, 171, 188]);
            expect(data.scores).toEqual([95, 82, 71, 88]); // original unchanged
        });
    });

    describe("sort", () => {
        it("sort + at(0) targets lowest (immutable)", () => {
            const data = makeTeam();
            // sort by age asc: Alice(25), Carol(28), Bob(35), Dave(40); at(0) → Alice
            const result = Lens.apply(data, ($) => $.sort(($s) => $s("age"), "asc").at(0)("name"), "YOUNGEST");
            expect(result[0].name).toBe("YOUNGEST");
            expect(result[1].name).toBe("Bob");
            expect(data[0].name).toBe("Alice"); // original unchanged
            // structural sharing
            expect(result[1]).toBe(data[1]);
            expect(result[2]).toBe(data[2]);
            expect(result[3]).toBe(data[3]);
        });

        it("sort desc + at(0) targets highest (immutable)", () => {
            const data = makeTeam();
            // sort by age desc: Dave(40), Bob(35), Carol(28), Alice(25); at(0) → Dave
            const result = Lens.apply(data, ($) => $.sort(($s) => $s("age"), "desc").at(0)("name"), "OLDEST");
            expect(result[3].name).toBe("OLDEST"); // Dave
            expect(data[3].name).toBe("Dave"); // original unchanged
            expect(result[0]).toBe(data[0]);
            expect(result[1]).toBe(data[1]);
            expect(result[2]).toBe(data[2]);
        });

        it("where + sort + at(0) filters then sorts (immutable)", () => {
            const data = makeTeam();
            const result = Lens.apply(
                data,
                ($) =>
                    $.where(($s) => [$s("role"), "!=", "manager"])
                        .sort(($s) => $s("age"), "desc")
                        .at(0)("name"),
                "OLDEST_NON_MGR"
            );
            expect(result[1].name).toBe("OLDEST_NON_MGR"); // Bob: oldest non-manager
            expect(data[1].name).toBe("Bob"); // original unchanged
            expect(result[0]).toBe(data[0]);
            expect(result[2]).toBe(data[2]);
            expect(result[3]).toBe(data[3]);
        });
    });

    describe("Map", () => {
        it("returns a new Map with the value changed", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("prefs").get("fontSize"), (prev) => prev + 2);
            expect(result.prefs.get("fontSize")).toBe(16);
            expect(result.prefs.get("theme")).toBe(1); // unchanged value
            expect(data.prefs.get("fontSize")).toBe(14); // original unchanged
            expect(result.prefs).not.toBe(data.prefs); // new Map instance
        });
    });

    describe("chained filters", () => {
        it("where + filter narrows cumulatively (immutable)", () => {
            const data = makeTeam();
            const result = Lens.apply(
                data,
                ($) =>
                    $.where(($s) => [$s("role"), "=", "dev"])
                        .filter((p: any) => p.age > 26)
                        .each()("name"),
                (prev) => prev.toUpperCase()
            );
            expect(result[0].name).toBe("Alice");
            expect(result[1].name).toBe("Bob");
            expect(result[2].name).toBe("CAROL");
            expect(result[3].name).toBe("Dave");
            // structural sharing: unaffected elements keep identity
            expect(result[0]).toBe(data[0]);
            expect(result[1]).toBe(data[1]);
            expect(result[3]).toBe(data[3]);
            expect(result[2]).not.toBe(data[2]);
        });

        it("filter + slice narrows cumulatively (immutable)", () => {
            const data = makePerson();
            const result = Lens.apply(
                data,
                ($) =>
                    $("scores")
                        .filter((s) => s < 90)
                        .slice(1)
                        .each(),
                0
            );
            expect(result.scores).toEqual([95, 82, 0, 0]);
            expect(data.scores).toEqual([95, 82, 71, 88]);
        });

        it("slice + filter narrows cumulatively (immutable)", () => {
            const data = makePerson();
            const result = Lens.apply(
                data,
                ($) =>
                    $("scores")
                        .slice(1, 3)
                        .filter((s) => s > 75)
                        .each(),
                0
            );
            expect(result.scores).toEqual([95, 0, 71, 88]);
            expect(data.scores).toEqual([95, 82, 71, 88]);
        });

        it("where + at(0) targets first match (immutable)", () => {
            const data = makeTeam();
            const result = Lens.apply(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).at(0)("name"), "FIRST_DEV");
            expect(result[0].name).toBe("FIRST_DEV");
            expect(result[2].name).toBe("Carol"); // second dev, untouched
            expect(data[0].name).toBe("Alice"); // original unchanged
            // structural sharing
            expect(result[1]).toBe(data[1]);
            expect(result[2]).toBe(data[2]);
            expect(result[3]).toBe(data[3]);
        });

        it("filter + at(-1) targets last match (immutable)", () => {
            const data = makePerson();
            // filter: < 90 → indices [1,2,3] (82,71,88); at(-1) → index 3 (88)
            const result = Lens.apply(data, ($) => $("scores").filter((s) => s < 90).at(-1), 0);
            expect(result.scores).toEqual([95, 82, 71, 0]);
            expect(data.scores).toEqual([95, 82, 71, 88]);
        });

        it("where + filter + at(0) narrows then picks first (immutable)", () => {
            const data = makeTeam();
            // where: age > 25 → Bob(35), Carol(28), Dave(40); filter: age < 40 → Bob(35), Carol(28); at(0) → Bob
            const result = Lens.apply(
                data,
                ($) =>
                    $.where(($s) => [$s("age"), ">", 25])
                        .filter((p: any) => p.age < 40)
                        .at(0)("role"),
                "picked"
            );
            expect(result[0].role).toBe("dev"); // Alice: excluded
            expect(result[1].role).toBe("picked"); // Bob: first match
            expect(result[2].role).toBe("dev"); // Carol: second match, not picked
            expect(result[3].role).toBe("manager"); // Dave: excluded
            expect(data[1].role).toBe("lead"); // original unchanged
            // structural sharing
            expect(result[0]).toBe(data[0]);
            expect(result[2]).toBe(data[2]);
            expect(result[3]).toBe(data[3]);
        });
    });

    describe("root replacement", () => {
        it("replaces the entire root when path is empty", () => {
            const data = { x: 1 };
            const result = Lens.apply(data, ($) => $, { x: 2 });
            expect(result).toEqual({ x: 2 });
            expect(data).toEqual({ x: 1 }); // original unchanged
        });
    });

    describe("custom accessors", () => {
        class Vector2 {
            #x: number;
            #y: number;
            constructor(x: number, y: number) {
                this.#x = x;
                this.#y = y;
            }
            get x() {
                return this.#x;
            }
            get y() {
                return this.#y;
            }
            [LensNav] = {
                x: { select: () => this.#x, apply: (value: number) => new Vector2(value, this.#y) },
                y: { select: () => this.#y, apply: (value: number) => new Vector2(this.#x, value) },
            };
        }

        it("applies via custom named accessor — returns new instance", () => {
            const data = { pos: new Vector2(3, 4) };
            const result = Lens.apply(data, ($) => ($("pos") as any).x(), 10);
            expect(result.pos.x).toBe(10);
            expect(result.pos.y).toBe(4);
            expect(data.pos.x).toBe(3); // original unchanged
            expect(result.pos).not.toBe(data.pos); // new Vector2 instance
        });

        it("applies via custom named accessor with updater", () => {
            const data = { pos: new Vector2(3, 4) };
            const result = Lens.apply(data, ($) => ($("pos") as any).y(), (prev: number) => prev * 2);
            expect(result.pos.y).toBe(8);
            expect(data.pos.y).toBe(4); // original unchanged
        });

        class KeyedStore {
            #data: Record<string, number>;
            constructor(data: Record<string, number>) {
                this.#data = { ...data };
            }
            getVal(key: string) {
                return this.#data[key];
            }
            [LensNav] = {
                lookup: {
                    select: (key: string) => this.#data[key],
                    apply: (value: number, key: string) => { const next = new KeyedStore(this.#data); next.#data[key] = value; return next; },
                },
            };
        }

        it("applies via custom keyed accessor — returns new instance", () => {
            const store = new KeyedStore({ alpha: 10, beta: 20 });
            const data = { store };
            const result = Lens.apply(data, ($) => ($("store") as any).lookup("alpha"), 99);
            expect(result.store.getVal("alpha")).toBe(99);
            expect(result.store.getVal("beta")).toBe(20);
            expect(data.store.getVal("alpha")).toBe(10); // original unchanged
            expect(result.store).not.toBe(data.store); // new instance
        });

        it("applies via multi-arg custom accessor — returns new instance", () => {
            class Matrix {
                #data: number[][];
                constructor(data: number[][]) {
                    this.#data = data.map((r) => [...r]);
                }
                getCell(row: number, col: number) {
                    return this.#data[row][col];
                }
                [LensNav] = {
                    cell: {
                        select: (row: number, col: number) => this.#data[row][col],
                        apply: (value: number, row: number, col: number) => {
                            const next = new Matrix(this.#data);
                            next.#data[row][col] = value;
                            return next;
                        },
                    },
                };
            }
            const data = { m: new Matrix([[1, 2], [3, 4]]) };
            const result = Lens.apply(data, ($) => ($("m") as any).cell(1, 0), 99);
            expect(result.m.getCell(1, 0)).toBe(99);
            expect(result.m.getCell(0, 1)).toBe(2); // unchanged
            expect(data.m.getCell(1, 0)).toBe(3); // original unchanged
            expect(result.m).not.toBe(data.m); // new instance
        });
    });

    describe("edge cases", () => {
        it("where matching nothing is a no-op (all refs preserved)", () => {
            const data = makeTeam();
            const result = Lens.apply(data, ($) => $.where(($s) => [$s("role"), "=", "ceo"]).each()("name"), "NOBODY");
            expect(result[0].name).toBe("Alice");
            expect(result[1].name).toBe("Bob");
            expect(result[2].name).toBe("Carol");
            expect(result[3].name).toBe("Dave");
            // When nothing matches, all elements keep identity
            expect(result[0]).toBe(data[0]);
            expect(result[1]).toBe(data[1]);
            expect(result[2]).toBe(data[2]);
            expect(result[3]).toBe(data[3]);
        });

        it("where matching everything behaves like plain each", () => {
            const data = makeTeam();
            const result = Lens.apply(data, ($) => $.where(($s) => [$s("age"), ">", 0]).each()("role"), "matched");
            expect(result[0].role).toBe("matched");
            expect(result[1].role).toBe("matched");
            expect(result[2].role).toBe("matched");
            expect(result[3].role).toBe("matched");
            expect(data[0].role).toBe("dev"); // original unchanged
        });

        it("filter on empty array is a no-op", () => {
            const data = { items: [] as number[] };
            const result = Lens.apply(data, ($) => $("items").filter((x) => x > 0).each(), 999);
            expect(result.items).toEqual([]);
        });

        it("each on empty array is a no-op", () => {
            const data = { items: [] as number[] };
            const result = Lens.apply(data, ($) => $("items").each(), 999);
            expect(result.items).toEqual([]);
        });

        it("sort + slice chains correctly (immutable)", () => {
            const data = makeTeam();
            // sort by age desc: Dave(40), Bob(35), Carol(28), Alice(25); slice(0,2) → Dave, Bob
            const result = Lens.apply(
                data,
                ($) =>
                    $.sort(($s) => $s("age"), "desc")
                        .slice(0, 2)
                        .each()("role"),
                "top2"
            );
            expect(result[0].role).toBe("dev"); // Alice: 4th in sorted order
            expect(result[1].role).toBe("top2"); // Bob: 2nd oldest
            expect(result[2].role).toBe("dev"); // Carol: 3rd in sorted order
            expect(result[3].role).toBe("top2"); // Dave: 1st oldest
            expect(data[1].role).toBe("lead"); // original unchanged
            expect(data[3].role).toBe("manager"); // original unchanged
            // structural sharing for untouched
            expect(result[0]).toBe(data[0]);
            expect(result[2]).toBe(data[2]);
        });

        it("each + sort + at targets per sub-array (immutable)", () => {
            const data = {
                groups: [
                    [
                        { name: "a", score: 10 },
                        { name: "b", score: 30 },
                        { name: "c", score: 20 },
                    ],
                    [
                        { name: "d", score: 50 },
                        { name: "e", score: 40 },
                    ],
                ],
            };
            // In each sub-array, sort by score desc, pick at(0) → highest scorer per group
            const result = Lens.apply(data, ($) => $("groups").each().sort(($s) => $s("score"), "desc").at(0)("name"), "BEST");
            expect(result.groups[0][0].name).toBe("a"); // score 10, not highest
            expect(result.groups[0][1].name).toBe("BEST"); // score 30, highest in group 0
            expect(result.groups[0][2].name).toBe("c"); // score 20
            expect(result.groups[1][0].name).toBe("BEST"); // score 50, highest in group 1
            expect(result.groups[1][1].name).toBe("e"); // score 40
            // originals unchanged
            expect(data.groups[0][1].name).toBe("b");
            expect(data.groups[1][0].name).toBe("d");
        });

        it("root-is-array direct index apply", () => {
            const data = [10, 20, 30];
            const result = Lens.apply(data, ($) => $(1), 99);
            expect(result).toEqual([10, 99, 30]);
            expect(data).toEqual([10, 20, 30]); // original unchanged
        });

        it("root-is-array with where + each (immutable)", () => {
            const data = [
                { name: "a", active: true },
                { name: "b", active: false },
                { name: "c", active: true },
            ];
            const result = Lens.apply(data, ($) => $.where(($s) => [$s("active"), "=", true]).each()("name"), (prev) => prev.toUpperCase());
            expect(result[0].name).toBe("A");
            expect(result[1].name).toBe("b"); // inactive, unchanged
            expect(result[2].name).toBe("C");
            expect(data[0].name).toBe("a"); // original unchanged
            // structural sharing
            expect(result[1]).toBe(data[1]);
        });
    });

    describe("updater pattern (array push/pop equivalent)", () => {
        it("appends to an array via updater", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("roles"), (prev) => [...prev, "owner"]);
            expect(result.roles).toEqual(["admin", "editor", "viewer", "owner"]);
            expect(data.roles).toEqual(["admin", "editor", "viewer"]); // original unchanged
        });

        it("removes last element via updater", () => {
            const data = makePerson();
            const result = Lens.apply(data, ($) => $("roles"), (prev) => prev.slice(0, -1));
            expect(result.roles).toEqual(["admin", "editor"]);
            expect(data.roles).toEqual(["admin", "editor", "viewer"]); // original unchanged
        });
    });

    describe("updater context", () => {
        it("provides path for simple property access", () => {
            const data = makePerson();
            let captured: Lens.Context | undefined;
            Lens.apply(data, ($) => $("address")("city"), (prev, _i, ctx) => {
                captured = ctx;
                return "Seattle";
            });
            expect(captured!.path).toEqual([P("address"), P("city")]);
            expect(captured!.index).toBe(0);
            expect(captured!.count).toBe(1);
        });

        it("provides index and count for each", () => {
            const data = makeTeam();
            const contexts: Lens.Context[] = [];
            Lens.apply(data, ($) => $.each()("name"), (prev, _i, ctx) => {
                contexts.push(ctx);
                return prev;
            });
            expect(contexts).toHaveLength(4);
            expect(contexts[0]).toEqual({ path: [I(0), P("name")], index: 0, count: 4 });
            expect(contexts[3]).toEqual({ path: [I(3), P("name")], index: 3, count: 4 });
        });

        it("provides index and count for filtered each", () => {
            const data = makeTeam();
            const contexts: Lens.Context[] = [];
            Lens.apply(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).each()("name"), (prev, _i, ctx) => {
                contexts.push(ctx);
                return prev;
            });
            expect(contexts).toHaveLength(2);
            expect(contexts[0]).toEqual({ path: [I(0), P("name")], index: 0, count: 2 });
            expect(contexts[1]).toEqual({ path: [I(2), P("name")], index: 1, count: 2 });
        });

        it("provides path through nested each (2D) with structural sharing", () => {
            const data = makeMatrix();
            const paths: any[][] = [];
            const result = Lens.apply(data, ($) => $("rows").each().each()("val"), (prev, _i, ctx) => {
                paths.push([...ctx.path]);
                return prev * 10;
            });
            expect(paths).toEqual([
                [P("rows"), I(0), I(0), P("val")],
                [P("rows"), I(0), I(1), P("val")],
                [P("rows"), I(1), I(0), P("val")],
                [P("rows"), I(1), I(1), P("val")],
                [P("rows"), I(2), I(0), P("val")],
                [P("rows"), I(2), I(1), P("val")],
            ]);
            expect(result.rows[0][0].val).toBe(10);
            expect(data.rows[0][0].val).toBe(1); // original unchanged
        });

        it("root replacement provides empty path", () => {
            const data = { x: 1 };
            let captured: Lens.Context | undefined;
            Lens.apply(data, ($) => $, (prev, _i, ctx) => {
                captured = ctx;
                return { x: 2 };
            });
            expect(captured!.path).toEqual([]);
            expect(captured!.index).toBe(0);
            expect(captured!.count).toBe(1);
        });

        it("at() with negative index shows resolved positive index in path", () => {
            const data = makePerson();
            let captured: Lens.Context | undefined;
            Lens.apply(data, ($) => $("scores").at(-1), (prev, _i, ctx) => {
                captured = ctx;
                return 0;
            });
            expect(captured!.path).toEqual([P("scores"), I(3)]); // -1 resolves to index 3
        });

        it("at() after filter provides index 0, count 1", () => {
            const data = makeTeam();
            let captured: Lens.Context | undefined;
            Lens.apply(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).at(0)("name"), (prev, _i, ctx) => {
                captured = ctx;
                return "FIRST";
            });
            expect(captured!.index).toBe(0);
            expect(captured!.count).toBe(1);
        });

        it("Map .get() shows stringified key in path", () => {
            const data = makePerson();
            let captured: Lens.Context | undefined;
            Lens.apply(data, ($) => $("prefs").get("fontSize"), (prev, _i, ctx) => {
                captured = ctx;
                return 16;
            });
            expect(captured!.path).toEqual([P("prefs"), A("get", "fontSize")]);
        });

        it("custom named accessor shows prop() in path", () => {
            const data = { pos: new (class {
                #x = 3; #y = 4;
                get x() { return this.#x; }
                get y() { return this.#y; }
                [LensNav] = {
                    x: { select: () => this.#x, apply: (v: number) => new (this.constructor as any)(v, this.#y) },
                    y: { select: () => this.#y, apply: (v: number) => new (this.constructor as any)(this.#x, v) },
                };
            })() };
            let captured: Lens.Context | undefined;
            Lens.apply(data, ($) => ($("pos") as any).x(), (prev, _i, ctx) => {
                captured = ctx;
                return 10;
            });
            expect(captured!.path).toEqual([P("pos"), A("x")]);
        });

        it("custom keyed accessor shows prop(key) in path", () => {
            const data = { store: new (class {
                #data: Record<string, number> = { alpha: 10, beta: 20 };
                getVal(key: string) { return this.#data[key]; }
                [LensNav] = { lookup: { select: (key: string) => this.#data[key], apply: (value: number, key: string) => { const n = new (this.constructor as any)(); n.#data = { ...this.#data, [key]: value }; return n; } } };
            })() };
            let captured: Lens.Context | undefined;
            Lens.apply(data, ($) => ($("store") as any).lookup("alpha"), (prev, _i, ctx) => {
                captured = ctx;
                return 99;
            });
            expect(captured!.path).toEqual([P("store"), A("lookup", "alpha")]);
        });

        it("sort + each provides sorted iteration with correct index and count", () => {
            const data = makeTeam();
            const contexts: Lens.Context[] = [];
            Lens.apply(data, ($) => $.sort(($s) => $s("age"), "asc").each()("role"), (prev, _i, ctx) => {
                contexts.push({ ...ctx, path: [...ctx.path] });
                return prev;
            });
            expect(contexts).toHaveLength(4);
            expect(contexts.every((c) => c.count === 4)).toBe(true);
            // Sorted: Alice(0), Carol(2), Bob(1), Dave(3)
            expect(contexts[0]).toEqual({ path: [I(0), P("role")], index: 0, count: 4 });
            expect(contexts[1]).toEqual({ path: [I(2), P("role")], index: 1, count: 4 });
            expect(contexts[2]).toEqual({ path: [I(1), P("role")], index: 2, count: 4 });
            expect(contexts[3]).toEqual({ path: [I(3), P("role")], index: 3, count: 4 });
        });
    });

    // ================================================================
    // each(callback) — per-element dynamic navigation
    // ================================================================

    describe("each(callback)", () => {
        it("basic: each(el => el(field)) applies like each()(field)", () => {
            const data = makeTeam();
            const result = Lens.apply(data, ($) => $.each((el) => el("role")), "updated");
            expect(result.every((d) => d.role === "updated")).toBe(true);
            expect(data[0].role).toBe("dev"); // original unchanged
        });

        it("dynamic index: apply at per-element pointer", () => {
            const data = [
                { pointer: 1, refs: ["a", "b", "c"] },
                { pointer: 0, refs: ["x", "y"] },
            ];
            const result = Lens.apply(data, ($) => $.each((el) => el("refs").at(el("pointer"))), "!");
            expect(result[0].refs).toEqual(["a", "!", "c"]);
            expect(result[1].refs).toEqual(["!", "y"]);
            // original unchanged
            expect(data[0].refs).toEqual(["a", "b", "c"]);
            expect(data[1].refs).toEqual(["x", "y"]);
        });

        it("structural sharing preserved", () => {
            const data = [
                { pointer: 0, refs: ["a", "b"] },
                { pointer: 1, refs: ["c", "d"] },
            ];
            const result = Lens.apply(data, ($) => $.each((el) => el("refs").at(el("pointer"))), "!");
            // Both elements modified, but identity check on untouched nested values
            expect(result).not.toBe(data);
            expect(result[0]).not.toBe(data[0]);
            expect(result[1]).not.toBe(data[1]);
        });
    });

    // ================================================================
    // Dynamic lens references — lens args in apply context
    // ================================================================

    describe("dynamic lens references", () => {
        it("$(n) with lens arg applies to correct element", () => {
            const data = { idx: 1, items: ["a", "b", "c"] };
            const result = Lens.apply(data, ($) => $("items")($("idx")), "X");
            expect(result.items).toEqual(["a", "X", "c"]);
            expect(data.items).toEqual(["a", "b", "c"]); // original unchanged
        });

        it("Map.get() with lens arg applies correctly", () => {
            const data = { key: "fontSize", prefs: new Map([["theme", 1], ["fontSize", 14]]) };
            const result = Lens.apply(data, ($) => $("prefs").get($("key")), 20);
            expect(result.prefs.get("fontSize")).toBe(20);
            expect(data.prefs.get("fontSize")).toBe(14); // original unchanged
        });

        it("custom keyed accessor with lens arg applies correctly", () => {
            class Store {
                #data: Record<string, number>;
                constructor(data: Record<string, number>) { this.#data = { ...data }; }
                getVal(key: string) { return this.#data[key]; }
                [LensNav] = {
                    lookup: {
                        select: (key: string) => this.#data[key],
                        apply: (value: number, key: string) => { const next = new Store(this.#data); next.#data[key] = value; return next; },
                    },
                };
            }
            const data = { which: "beta", store: new Store({ alpha: 10, beta: 20 }) };
            const result = Lens.apply(data, ($) => ($("store") as any).lookup($("which")), 99);
            expect(result.store.getVal("beta")).toBe(99);
            expect(result.store.getVal("alpha")).toBe(10);
            expect(data.store.getVal("beta")).toBe(20); // original unchanged
        });

        it("multi-arg custom accessor with lens args applies correctly", () => {
            class Matrix {
                #data: number[][];
                constructor(data: number[][]) { this.#data = data.map((r) => [...r]); }
                getCell(row: number, col: number) { return this.#data[row][col]; }
                [LensNav] = {
                    cell: {
                        select: (row: number, col: number) => this.#data[row][col],
                        apply: (value: number, row: number, col: number) => { const next = new Matrix(this.#data); next.#data[row][col] = value; return next; },
                    },
                };
            }
            const data = { row: 0, col: 1, m: new Matrix([[1, 2], [3, 4]]) };
            const result = Lens.apply(data, ($) => ($("m") as any).cell($("row"), $("col")), 99);
            expect(result.m.getCell(0, 1)).toBe(99);
            expect(data.m.getCell(0, 1)).toBe(2); // original unchanged
        });
    });

    describe("each(callback) with custom accessors", () => {
        it("applies via each() + custom named accessor", () => {
            class Box {
                #val: number;
                constructor(val: number) { this.#val = val; }
                get val() { return this.#val; }
                [LensNav] = {
                    value: { select: () => this.#val, apply: (v: number) => new Box(v) },
                };
            }
            const data = [new Box(10), new Box(20), new Box(30)];
            const result = Lens.apply(data, ($) => ($ as any).each().value(), (prev: number) => prev + 1);
            expect(result[0].val).toBe(11);
            expect(result[1].val).toBe(21);
            expect(result[2].val).toBe(31);
            expect(data[0].val).toBe(10); // original unchanged
        });

        it("applies via each(callback) + keyed custom accessor with element-scoped lens arg", () => {
            class Store {
                #data: Record<string, number>;
                constructor(data: Record<string, number>) { this.#data = { ...data }; }
                getVal(key: string) { return this.#data[key]; }
                [LensNav] = {
                    lookup: {
                        select: (key: string) => this.#data[key],
                        apply: (value: number, key: string) => { const next = new Store(this.#data); next.#data[key] = value; return next; },
                    },
                };
            }
            const data = [
                { key: "x", store: new Store({ x: 100, y: 200 }) },
                { key: "y", store: new Store({ x: 300, y: 400 }) },
            ];
            const result = Lens.apply(data, ($) => $.each((el) => (el("store") as any).lookup(el("key"))), 0);
            expect(result[0].store.getVal("x")).toBe(0);
            expect(result[0].store.getVal("y")).toBe(200);
            expect(result[1].store.getVal("y")).toBe(0);
            expect(result[1].store.getVal("x")).toBe(300);
            expect(data[0].store.getVal("x")).toBe(100); // original unchanged
            expect(data[1].store.getVal("y")).toBe(400); // original unchanged
        });

        // --- Nested each(callback) ---

        it("nested each(callback) + inner each(): applies to all nested items", () => {
            const data = [
                { items: ["a", "b", "c"] },
                { items: ["d", "e"] },
            ];
            const result = Lens.apply(data, ($) => $.each((row) => row("items").each()), "x");
            expect(result).toEqual([
                { items: ["x", "x", "x"] },
                { items: ["x", "x"] },
            ]);
            expect(data[0].items).toEqual(["a", "b", "c"]); // original unchanged
        });

        it("nested each(callback) + inner each(): applies with updater function", () => {
            const data = [
                { items: [1, 2, 3] },
                { items: [4, 5] },
            ];
            const result = Lens.apply(data, ($) => $.each((row) => row("items").each()), (prev: number) => prev * 10);
            expect(result).toEqual([
                { items: [10, 20, 30] },
                { items: [40, 50] },
            ]);
            expect(data[0].items).toEqual([1, 2, 3]); // original unchanged
        });

        it("both each() with callbacks: nested callback navigation", () => {
            const data = [
                { matrix: [[1, 2], [3, 4]] },
                { matrix: [[5, 6]] },
            ];
            const result = Lens.apply(data, ($) => $.each((group) => group("matrix").each((row) => row.at(0))), 0);
            expect(result).toEqual([
                { matrix: [[0, 2], [0, 4]] },
                { matrix: [[0, 6]] },
            ]);
            expect(data[0].matrix[0]).toEqual([1, 2]); // original unchanged
        });

        it("inner each(callback) using outer element lens for at()", () => {
            const data = [
                { matrix: [[1, 2, 3], [4, 5, 6]], colPick: 0 },
                { matrix: [[7, 8], [9, 10]], colPick: 1 },
            ];
            const result = Lens.apply(data, ($) => $.each((group) => group("matrix").each((row) => row.at(group("colPick")))), 99);
            expect(result).toEqual([
                { matrix: [[99, 2, 3], [99, 5, 6]], colPick: 0 },
                { matrix: [[7, 99], [9, 99]], colPick: 1 },
            ]);
            expect(data[0].matrix[0]).toEqual([1, 2, 3]); // original unchanged
        });

        it("read-only custom accessor returns unchanged copy when applied", () => {
            class Stats {
                #values: number[];
                constructor(values: number[]) { this.#values = [...values]; }
                getValues() { return [...this.#values]; }
                [LensNav] = {
                    sum: { select: () => this.#values.reduce((a, b) => a + b, 0) },
                };
            }
            const data = { s: new Stats([10, 20, 30]) };
            // no apply handler, so the accessor returns current (no replacement)
            const result = Lens.apply(data, ($) => ($("s") as any).sum(), 999);
            expect(result.s.getValues()).toEqual([10, 20, 30]); // no change
            // the spine is still shallow-copied above the accessor
            expect(result).not.toBe(data);
        });
    });
});
