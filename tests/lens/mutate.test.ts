import { describe, it, expect } from "vitest";
import { Lens } from "../../src/util/lens";
import { LensNav, SubLensNav } from "../../src/types";

// Path segment helpers for assertions
const P = (key: string) => ({ type: "property" as const, key });
const I = (index: number) => ({ type: "index" as const, index });
const A = (name: string, key?: string) => (key !== undefined ? { type: "accessor" as const, name, key } : { type: "accessor" as const, name });

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

// --- Lens.mutate tests ---

describe("Lens.mutate", () => {
    describe("property access", () => {
        it("sets a top-level property with a direct value", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("name"), "Alice");
            expect(data.name).toBe("Alice");
        });

        it("sets a top-level property with an updater", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("age"), (prev) => prev + 1);
            expect(data.age).toBe(31);
        });

        it("sets a nested property", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("address")("city"), "Seattle");
            expect(data.address.city).toBe("Seattle");
            expect(data.address.zip).toBe("97201"); // unchanged
        });
    });

    describe("index access", () => {
        it("sets an array element by positive index", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("roles")(0), "superadmin");
            expect(data.roles[0]).toBe("superadmin");
            expect(data.roles[1]).toBe("editor"); // unchanged
        });

        it("sets an array element by negative index via call syntax", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("scores")(-1), 100);
            expect(data.scores[3]).toBe(100);
            expect(data.scores[2]).toBe(71); // unchanged
        });

        it("sets an array element via at() with negative index", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("scores").at(-2), 99);
            expect(data.scores[2]).toBe(99);
        });
    });

    describe("each", () => {
        it("mutates all array elements", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("scores").each(), (prev) => prev * 2);
            expect(data.scores).toEqual([190, 164, 142, 176]);
        });

        it("mutates a property on each element", () => {
            const data = makeTeam();
            Lens.mutate(data, ($) => $.each()("age"), (prev) => prev + 1);
            expect(data.map((d) => d.age)).toEqual([26, 36, 29, 41]);
        });

        it("handles nested each (2D array)", () => {
            const data = makeMatrix();
            Lens.mutate(data, ($) => $("rows").each().each()("val"), (prev) => prev * 10);
            expect(data.rows[0][0].val).toBe(10);
            expect(data.rows[1][1].val).toBe(40);
            expect(data.rows[2][1].val).toBe(60);
        });
    });

    describe("where", () => {
        it("mutates only matching elements", () => {
            const data = makeTeam();
            Lens.mutate(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).each()("age"), (prev) => prev + 10);
            expect(data[0].age).toBe(35); // Alice: dev → mutated
            expect(data[1].age).toBe(35); // Bob: lead → unchanged
            expect(data[2].age).toBe(38); // Carol: dev → mutated
            expect(data[3].age).toBe(40); // Dave: manager → unchanged
        });

        it("mutates with ordering predicate", () => {
            const data = makeTeam();
            Lens.mutate(data, ($) => $.where(($s) => [$s("age"), ">", 30]).each()("role"), "senior");
            expect(data[0].role).toBe("dev"); // unchanged
            expect(data[1].role).toBe("senior"); // Bob age 35
            expect(data[3].role).toBe("senior"); // Dave age 40
        });
    });

    describe("filter", () => {
        it("mutates only elements passing the filter", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("scores").filter((s) => s < 85).each(), (prev) => prev + 10);
            expect(data.scores).toEqual([95, 92, 81, 88]); // 82→92, 71→81
        });
    });

    describe("slice", () => {
        it("mutates elements within the slice range", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("scores").slice(1, 3).each(), (prev) => 0);
            expect(data.scores).toEqual([95, 0, 0, 88]);
        });

        it("mutates with negative slice indices", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("scores").slice(-2).each(), (prev) => prev + 100);
            expect(data.scores).toEqual([95, 82, 171, 188]);
        });
    });

    describe("Map", () => {
        it("mutates a Map value", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $("prefs").get("fontSize"), (prev) => prev + 2);
            expect(data.prefs.get("fontSize")).toBe(16);
            expect(data.prefs.get("theme")).toBe(1); // unchanged
        });
    });

    describe("chained filters", () => {
        it("where + filter narrows cumulatively", () => {
            const data = makeTeam();
            // where: role = "dev" → Alice(25), Carol(28); filter: age > 26 → Carol(28)
            Lens.mutate(
                data,
                ($) =>
                    $.where(($s) => [$s("role"), "=", "dev"])
                        .filter((p: any) => p.age > 26)
                        .each()("name"),
                (prev) => prev.toUpperCase()
            );
            expect(data[0].name).toBe("Alice"); // dev but age 25, filtered out
            expect(data[1].name).toBe("Bob"); // not dev
            expect(data[2].name).toBe("CAROL"); // dev AND age > 26
            expect(data[3].name).toBe("Dave"); // not dev
        });

        it("where + slice narrows cumulatively", () => {
            const data = makeTeam();
            // where: age < 40 → Alice(25), Bob(35), Carol(28); slice(0,2) → Alice, Bob
            Lens.mutate(
                data,
                ($) =>
                    $.where(($s) => [$s("age"), "<", 40])
                        .slice(0, 2)
                        .each()("role"),
                "intern"
            );
            expect(data[0].role).toBe("intern"); // Alice: age < 40, in slice
            expect(data[1].role).toBe("intern"); // Bob: age < 40, in slice
            expect(data[2].role).toBe("dev"); // Carol: age < 40 but outside slice
            expect(data[3].role).toBe("manager"); // Dave: age >= 40
        });

        it("filter + slice narrows cumulatively", () => {
            const data = makePerson();
            // filter: score < 90 → [82, 71, 88]; slice(1) → [71, 88]
            Lens.mutate(
                data,
                ($) =>
                    $("scores")
                        .filter((s) => s < 90)
                        .slice(1)
                        .each(),
                0
            );
            expect(data.scores).toEqual([95, 82, 0, 0]); // 71→0, 88→0
        });

        it("slice + filter narrows cumulatively", () => {
            const data = makePerson();
            // slice(1, 3) → [82, 71]; filter: > 75 → [82]
            Lens.mutate(
                data,
                ($) =>
                    $("scores")
                        .slice(1, 3)
                        .filter((s) => s > 75)
                        .each(),
                0
            );
            expect(data.scores).toEqual([95, 0, 71, 88]); // only 82→0
        });

        it("where + where narrows cumulatively", () => {
            const data = makeTeam();
            // where: age > 25 → Bob(35), Carol(28), Dave(40); where: age < 35 → Carol(28)
            Lens.mutate(
                data,
                ($) =>
                    $.where(($s) => [$s("age"), ">", 25])
                        .where(($s) => [$s("age"), "<", 35])
                        .each()("name"),
                "MATCH"
            );
            expect(data[0].name).toBe("Alice"); // age 25, not > 25
            expect(data[1].name).toBe("Bob"); // age 35, not < 35
            expect(data[2].name).toBe("MATCH"); // age 28, matches both
            expect(data[3].name).toBe("Dave"); // age 40, not < 35
        });

        it("where + at(0) targets first matching element", () => {
            const data = makeTeam();
            // where: role = "dev" → Alice(0), Carol(2); at(0) → Alice
            Lens.mutate(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).at(0)("name"), "FIRST_DEV");
            expect(data[0].name).toBe("FIRST_DEV"); // Alice: first dev
            expect(data[1].name).toBe("Bob"); // unchanged
            expect(data[2].name).toBe("Carol"); // second dev, not targeted
            expect(data[3].name).toBe("Dave"); // unchanged
        });

        it("where + at(-1) targets last matching element", () => {
            const data = makeTeam();
            // where: role = "dev" → Alice(0), Carol(2); at(-1) → Carol
            Lens.mutate(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).at(-1)("name"), "LAST_DEV");
            expect(data[0].name).toBe("Alice"); // first dev, not targeted
            expect(data[1].name).toBe("Bob"); // unchanged
            expect(data[2].name).toBe("LAST_DEV"); // Carol: last dev
            expect(data[3].name).toBe("Dave"); // unchanged
        });

        it("filter + at(1) targets second matching element", () => {
            const data = makePerson();
            // filter: < 90 → indices [1,2,3] (82,71,88); at(1) → index 2 (71)
            Lens.mutate(data, ($) => $("scores").filter((s) => s < 90).at(1), 999);
            expect(data.scores).toEqual([95, 82, 999, 88]);
        });

        it("slice + at(0) targets first element in slice", () => {
            const data = makePerson();
            // slice(1,3) → indices [1,2] (82,71); at(0) → index 1 (82)
            Lens.mutate(data, ($) => $("scores").slice(1, 3).at(0), 0);
            expect(data.scores).toEqual([95, 0, 71, 88]);
        });

        it("where + filter + at(0) narrows then picks first", () => {
            const data = makeTeam();
            // where: age > 25 → Bob(35), Carol(28), Dave(40); filter: age < 40 → Bob(35), Carol(28); at(0) → Bob
            Lens.mutate(
                data,
                ($) =>
                    $.where(($s) => [$s("age"), ">", 25])
                        .filter((p: any) => p.age < 40)
                        .at(0)("role"),
                "picked"
            );
            expect(data[0].role).toBe("dev"); // Alice: age 25, excluded by where
            expect(data[1].role).toBe("picked"); // Bob: matches both, first match
            expect(data[2].role).toBe("dev"); // Carol: matches both, but at(0) only picks first
            expect(data[3].role).toBe("manager"); // Dave: age 40, excluded by filter
        });
    });

    describe("sort", () => {
        it("sort + at(0) targets element with lowest value", () => {
            const data = makeTeam();
            // sort by age asc: Alice(25), Carol(28), Bob(35), Dave(40); at(0) → Alice (index 0)
            Lens.mutate(data, ($) => $.sort(($s) => $s("age"), "asc").at(0)("name"), "YOUNGEST");
            expect(data[0].name).toBe("YOUNGEST"); // Alice: age 25, lowest
            expect(data[1].name).toBe("Bob");
            expect(data[2].name).toBe("Carol");
            expect(data[3].name).toBe("Dave");
        });

        it("sort + at(0) targets element with highest value (desc)", () => {
            const data = makeTeam();
            // sort by age desc: Dave(40), Bob(35), Carol(28), Alice(25); at(0) → Dave (index 3)
            Lens.mutate(data, ($) => $.sort(($s) => $s("age"), "desc").at(0)("name"), "OLDEST");
            expect(data[0].name).toBe("Alice");
            expect(data[1].name).toBe("Bob");
            expect(data[2].name).toBe("Carol");
            expect(data[3].name).toBe("OLDEST"); // Dave: age 40, highest
        });

        it("sort + at(1) targets second in sorted order", () => {
            const data = makeTeam();
            // sort by age desc: Dave(40), Bob(35), Carol(28), Alice(25); at(1) → Bob (index 1)
            Lens.mutate(data, ($) => $.sort(($s) => $s("age"), "desc").at(1)("name"), "SECOND_OLDEST");
            expect(data[0].name).toBe("Alice");
            expect(data[1].name).toBe("SECOND_OLDEST"); // Bob: age 35, second highest
            expect(data[2].name).toBe("Carol");
            expect(data[3].name).toBe("Dave");
        });

        it("sort + each mutates all in sorted order", () => {
            const data = makeTeam();
            let rank = 0;
            // sort by age asc, then assign rank to each
            Lens.mutate(data, ($) => $.sort(($s) => $s("age"), "asc").each()("role"), () => `rank-${rank++}`);
            // sorted order: Alice(25)→rank-0, Carol(28)→rank-1, Bob(35)→rank-2, Dave(40)→rank-3
            expect(data[0].role).toBe("rank-0"); // Alice
            expect(data[1].role).toBe("rank-2"); // Bob
            expect(data[2].role).toBe("rank-1"); // Carol
            expect(data[3].role).toBe("rank-3"); // Dave
        });

        it("sort with comparator + at(0)", () => {
            const data = makePerson();
            // sort scores descending via comparator: [95, 88, 82, 71]; at(0) → 95 (index 0)
            Lens.mutate(data, ($) => $("scores").sort((a, b) => b - a).at(0), 999);
            expect(data.scores).toEqual([999, 82, 71, 88]); // index 0 had the highest (95)
        });

        it("where + sort + at(0) filters then sorts", () => {
            const data = makeTeam();
            // where: role != "manager" → Alice(25), Bob(35), Carol(28)
            // sort by age desc: Bob(35), Carol(28), Alice(25); at(0) → Bob
            Lens.mutate(
                data,
                ($) =>
                    $.where(($s) => [$s("role"), "!=", "manager"])
                        .sort(($s) => $s("age"), "desc")
                        .at(0)("name"),
                "OLDEST_NON_MGR"
            );
            expect(data[0].name).toBe("Alice");
            expect(data[1].name).toBe("OLDEST_NON_MGR"); // Bob: oldest non-manager
            expect(data[2].name).toBe("Carol");
            expect(data[3].name).toBe("Dave"); // manager, excluded
        });
    });

    describe("combinations", () => {
        it("each + where: mutates matching elements across all sub-arrays", () => {
            const data = {
                groups: [
                    [
                        { name: "a", active: true },
                        { name: "b", active: false },
                    ],
                    [
                        { name: "c", active: true },
                        { name: "d", active: true },
                    ],
                ],
            };
            Lens.mutate(data, ($) => $("groups").each().where(($s) => [$s("active"), "=", true]).each()("name"), (prev) => prev.toUpperCase());
            expect(data.groups[0][0].name).toBe("A"); // active → mutated
            expect(data.groups[0][1].name).toBe("b"); // inactive → unchanged
            expect(data.groups[1][0].name).toBe("C"); // active → mutated
            expect(data.groups[1][1].name).toBe("D"); // active → mutated
        });

        it("where + nested property", () => {
            const data = makeTeam();
            Lens.mutate(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).each()("name"), (prev) => `[${prev}]`);
            expect(data[0].name).toBe("[Alice]");
            expect(data[1].name).toBe("Bob"); // unchanged
            expect(data[2].name).toBe("[Carol]");
        });
    });

    describe("edge cases", () => {
        it("mutate root with empty path is a no-op", () => {
            const data = makePerson();
            Lens.mutate(data, ($) => $, { name: "REPLACED" } as any);
            expect(data.name).toBe("Rob"); // can't replace root by reference
        });

        it("where matching nothing is a no-op", () => {
            const data = makeTeam();
            Lens.mutate(data, ($) => $.where(($s) => [$s("role"), "=", "ceo"]).each()("name"), "NOBODY");
            expect(data[0].name).toBe("Alice");
            expect(data[1].name).toBe("Bob");
            expect(data[2].name).toBe("Carol");
            expect(data[3].name).toBe("Dave");
        });

        it("where matching everything behaves like plain each", () => {
            const data = makeTeam();
            Lens.mutate(data, ($) => $.where(($s) => [$s("age"), ">", 0]).each()("role"), "matched");
            expect(data[0].role).toBe("matched");
            expect(data[1].role).toBe("matched");
            expect(data[2].role).toBe("matched");
            expect(data[3].role).toBe("matched");
        });

        it("filter on empty array is a no-op", () => {
            const data = { items: [] as number[] };
            Lens.mutate(data, ($) => $("items").filter((x) => x > 0).each(), 999);
            expect(data.items).toEqual([]);
        });

        it("each on empty array is a no-op", () => {
            const data = { items: [] as number[] };
            Lens.mutate(data, ($) => $("items").each(), 999);
            expect(data.items).toEqual([]);
        });

        it("sort + slice chains correctly", () => {
            const data = makeTeam();
            // sort by age desc: Dave(40), Bob(35), Carol(28), Alice(25); slice(0,2) → Dave, Bob
            Lens.mutate(
                data,
                ($) =>
                    $.sort(($s) => $s("age"), "desc")
                        .slice(0, 2)
                        .each()("role"),
                "top2"
            );
            expect(data[0].role).toBe("dev"); // Alice: 4th in sorted order
            expect(data[1].role).toBe("top2"); // Bob: 2nd oldest
            expect(data[2].role).toBe("dev"); // Carol: 3rd in sorted order
            expect(data[3].role).toBe("top2"); // Dave: 1st oldest
        });

        it("each + sort + at targets per sub-array", () => {
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
            Lens.mutate(data, ($) => $("groups").each().sort(($s) => $s("score"), "desc").at(0)("name"), "BEST");
            expect(data.groups[0][0].name).toBe("a"); // score 10, not highest
            expect(data.groups[0][1].name).toBe("BEST"); // score 30, highest in group 0
            expect(data.groups[0][2].name).toBe("c"); // score 20
            expect(data.groups[1][0].name).toBe("BEST"); // score 50, highest in group 1
            expect(data.groups[1][1].name).toBe("e"); // score 40
        });

        it("root-is-array direct index mutate", () => {
            const data = [10, 20, 30];
            Lens.mutate(data, ($) => $(1), 99);
            expect(data).toEqual([10, 99, 30]);
        });

        it("root-is-array with where + each", () => {
            const data = [
                { name: "a", active: true },
                { name: "b", active: false },
                { name: "c", active: true },
            ];
            Lens.mutate(data, ($) => $.where(($s) => [$s("active"), "=", true]).each()("name"), (prev) => prev.toUpperCase());
            expect(data[0].name).toBe("A");
            expect(data[1].name).toBe("b"); // inactive, unchanged
            expect(data[2].name).toBe("C");
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
                x: (hint: string, value?: number) => {
                    if (hint === "select") return this.#x;
                    if (hint === "mutate") this.#x = value!;
                },
                y: (hint: string, value?: number) => {
                    if (hint === "select") return this.#y;
                    if (hint === "mutate") this.#y = value!;
                },
            };
        }

        it("mutates via custom named accessor (LensNav)", () => {
            const data = { pos: new Vector2(3, 4) };
            Lens.mutate(data, ($) => ($("pos") as any).x(), 10);
            expect(data.pos.x).toBe(10);
            expect(data.pos.y).toBe(4); // unchanged
        });

        it("mutates via custom named accessor with updater", () => {
            const data = { pos: new Vector2(3, 4) };
            Lens.mutate(data, ($) => ($("pos") as any).y(), (prev: number) => prev * 2);
            expect(data.pos.y).toBe(8);
        });

        class KeyedStore {
            #data: Record<string, number>;
            constructor(data: Record<string, number>) {
                this.#data = { ...data };
            }
            getVal(key: string) {
                return this.#data[key];
            }
            [SubLensNav] = {
                lookup: (key: string, hint: string, value?: number) => {
                    if (hint === "select") return this.#data[key];
                    if (hint === "mutate") this.#data[key] = value!;
                },
            };
        }

        it("mutates via custom keyed accessor (SubLensNav)", () => {
            const store = new KeyedStore({ alpha: 10, beta: 20 });
            const data = { store };
            Lens.mutate(data, ($) => ($("store") as any).lookup("alpha"), 99);
            expect(data.store.getVal("alpha")).toBe(99);
            expect(data.store.getVal("beta")).toBe(20); // unchanged
        });
    });

    describe("updater context", () => {
        it("provides path for simple property access", () => {
            const data = makePerson();
            let captured: Lens.Context | undefined;
            Lens.mutate(data, ($) => $("address")("city"), (prev, _i, ctx) => {
                captured = ctx;
                return "Seattle";
            });
            expect(captured!.path).toEqual([P("address"), P("city")]);
            expect(captured!.index).toBe(0);
            expect(captured!.count).toBe(1);
        });

        it("provides path with numeric index", () => {
            const data = makePerson();
            let captured: Lens.Context | undefined;
            Lens.mutate(data, ($) => $("scores")(2), (prev, _i, ctx) => {
                captured = ctx;
                return 0;
            });
            expect(captured!.path).toEqual([P("scores"), I(2)]);
        });

        it("provides index and count for each", () => {
            const data = makeTeam();
            const contexts: Lens.Context[] = [];
            Lens.mutate(data, ($) => $.each()("name"), (prev, _i, ctx) => {
                contexts.push(ctx);
                return prev;
            });
            expect(contexts).toHaveLength(4);
            expect(contexts[0]).toEqual({ path: [I(0), P("name")], index: 0, count: 4 });
            expect(contexts[1]).toEqual({ path: [I(1), P("name")], index: 1, count: 4 });
            expect(contexts[2]).toEqual({ path: [I(2), P("name")], index: 2, count: 4 });
            expect(contexts[3]).toEqual({ path: [I(3), P("name")], index: 3, count: 4 });
        });

        it("provides index and count for filtered each", () => {
            const data = makeTeam();
            const contexts: Lens.Context[] = [];
            Lens.mutate(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).each()("name"), (prev, _i, ctx) => {
                contexts.push(ctx);
                return prev;
            });
            // Alice(0) and Carol(2) are devs
            expect(contexts).toHaveLength(2);
            expect(contexts[0]).toEqual({ path: [I(0), P("name")], index: 0, count: 2 });
            expect(contexts[1]).toEqual({ path: [I(2), P("name")], index: 1, count: 2 });
        });

        it("provides path for at() after filter", () => {
            const data = makeTeam();
            let captured: Lens.Context | undefined;
            Lens.mutate(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).at(0)("name"), (prev, _i, ctx) => {
                captured = ctx;
                return "FIRST";
            });
            expect(captured!.path).toEqual([I(0), P("name")]); // Alice is at index 0
        });

        it("provides path through nested each (2D)", () => {
            const data = makeMatrix();
            const paths: any[][] = [];
            Lens.mutate(data, ($) => $("rows").each().each()("val"), (prev, _i, ctx) => {
                paths.push([...ctx.path]);
                return prev;
            });
            expect(paths).toEqual([
                [P("rows"), I(0), I(0), P("val")],
                [P("rows"), I(0), I(1), P("val")],
                [P("rows"), I(1), I(0), P("val")],
                [P("rows"), I(1), I(1), P("val")],
                [P("rows"), I(2), I(0), P("val")],
                [P("rows"), I(2), I(1), P("val")],
            ]);
        });

        it("inner each resets index and count", () => {
            const data = makeMatrix();
            const contexts: Lens.Context[] = [];
            Lens.mutate(data, ($) => $("rows").each().each()("val"), (prev, _i, ctx) => {
                contexts.push({ ...ctx, path: [...ctx.path] });
                return prev;
            });
            // outer each: 3 rows, inner each: 2 items per row
            // inner each resets index/count for its own iteration
            expect(contexts[0]).toEqual({ path: [P("rows"), I(0), I(0), P("val")], index: 0, count: 2 });
            expect(contexts[1]).toEqual({ path: [P("rows"), I(0), I(1), P("val")], index: 1, count: 2 });
            expect(contexts[2]).toEqual({ path: [P("rows"), I(1), I(0), P("val")], index: 0, count: 2 });
            expect(contexts[3]).toEqual({ path: [P("rows"), I(1), I(1), P("val")], index: 1, count: 2 });
        });

        it("sort + each provides sorted iteration order", () => {
            const data = makeTeam();
            const contexts: Lens.Context[] = [];
            // sort by age asc: Alice(25)→0, Carol(28)→2, Bob(35)→1, Dave(40)→3
            Lens.mutate(data, ($) => $.sort(($s) => $s("age"), "asc").each()("role"), (prev, _i, ctx) => {
                contexts.push({ ...ctx, path: [...ctx.path] });
                return `rank-${_i}`;
            });
            expect(contexts).toHaveLength(4);
            // Sorted order: Alice(idx 0), Carol(idx 2), Bob(idx 1), Dave(idx 3)
            expect(contexts[0].path).toEqual([I(0), P("role")]); // Alice
            expect(contexts[1].path).toEqual([I(2), P("role")]); // Carol
            expect(contexts[2].path).toEqual([I(1), P("role")]); // Bob
            expect(contexts[3].path).toEqual([I(3), P("role")]); // Dave
            expect(contexts[0].index).toBe(0);
            expect(contexts[1].index).toBe(1);
            expect(contexts[2].index).toBe(2);
            expect(contexts[3].index).toBe(3);
        });

        it("at() with negative index shows resolved positive index in path", () => {
            const data = makePerson();
            let captured: Lens.Context | undefined;
            Lens.mutate(data, ($) => $("scores").at(-1), (prev, _i, ctx) => {
                captured = ctx;
                return 0;
            });
            expect(captured!.path).toEqual([P("scores"), I(3)]); // -1 resolves to index 3
        });

        it("at() after filter provides index 0, count 1", () => {
            const data = makeTeam();
            let captured: Lens.Context | undefined;
            Lens.mutate(data, ($) => $.where(($s) => [$s("role"), "=", "dev"]).at(0)("name"), (prev, _i, ctx) => {
                captured = ctx;
                return "FIRST";
            });
            expect(captured!.index).toBe(0);
            expect(captured!.count).toBe(1);
        });

        it("Map .get() shows stringified key in path", () => {
            const data = makePerson();
            let captured: Lens.Context | undefined;
            Lens.mutate(data, ($) => $("prefs").get("fontSize"), (prev, _i, ctx) => {
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
                    x: (hint: string, v?: number) => { if (hint === "select") return this.#x; if (hint === "mutate") this.#x = v!; },
                    y: (hint: string, v?: number) => { if (hint === "select") return this.#y; if (hint === "mutate") this.#y = v!; },
                };
            })() };
            let captured: Lens.Context | undefined;
            Lens.mutate(data, ($) => ($("pos") as any).x(), (prev, _i, ctx) => {
                captured = ctx;
                return 10;
            });
            expect(captured!.path).toEqual([P("pos"), A("x")]);
        });

        it("custom keyed accessor shows prop(key) in path", () => {
            const data = { store: new (class {
                #data: Record<string, number> = { alpha: 10, beta: 20 };
                getVal(key: string) { return this.#data[key]; }
                [SubLensNav] = { lookup: (key: string, hint: string, value?: number) => { if (hint === "select") return this.#data[key]; if (hint === "mutate") this.#data[key] = value!; } };
            })() };
            let captured: Lens.Context | undefined;
            Lens.mutate(data, ($) => ($("store") as any).lookup("alpha"), (prev, _i, ctx) => {
                captured = ctx;
                return 99;
            });
            expect(captured!.path).toEqual([P("store"), A("lookup", "alpha")]);
        });

        it("sort + each count reflects sorted set size", () => {
            const data = makeTeam();
            const contexts: Lens.Context[] = [];
            Lens.mutate(data, ($) => $.sort(($s) => $s("age"), "asc").each()("role"), (prev, _i, ctx) => {
                contexts.push({ ...ctx, path: [...ctx.path] });
                return prev;
            });
            // all 4 are iterated
            expect(contexts.every((c) => c.count === 4)).toBe(true);
        });
    });

    // ================================================================
    // each(callback) — per-element dynamic navigation
    // ================================================================

    describe("each(callback)", () => {
        it("basic: each(el => el(field)) mutates like each()(field)", () => {
            const data = makeTeam();
            Lens.mutate(data, ($) => $.each((el) => el("role")), "updated");
            expect(data.every((d) => d.role === "updated")).toBe(true);
        });

        it("dynamic index: mutate at per-element pointer", () => {
            const data = [
                { pointer: 1, refs: ["a", "b", "c"] },
                { pointer: 0, refs: ["x", "y"] },
            ];
            Lens.mutate(data, ($) => $.each((el) => el("refs").at(el("pointer"))), "!");
            expect(data[0].refs).toEqual(["a", "!", "c"]);
            expect(data[1].refs).toEqual(["!", "y"]);
        });

        it("with updater function", () => {
            const data = [
                { pointer: 0, vals: [10, 20] },
                { pointer: 1, vals: [30, 40] },
            ];
            Lens.mutate(data, ($) => $.each((el) => el("vals").at(el("pointer"))), (prev) => (prev as number) * 100);
            expect(data[0].vals).toEqual([1000, 20]);
            expect(data[1].vals).toEqual([30, 4000]);
        });

        it("with where filter before each(callback)", () => {
            const data = [
                { active: true, pointer: 1, refs: ["a", "b"] },
                { active: false, pointer: 0, refs: ["c", "d"] },
                { active: true, pointer: 0, refs: ["e", "f"] },
            ];
            Lens.mutate(data, ($) => $.where(($s) => [$s("active"), "?"]).each((el) => el("refs").at(el("pointer"))), "!");
            expect(data[0].refs).toEqual(["a", "!"]);
            expect(data[1].refs).toEqual(["c", "d"]); // untouched
            expect(data[2].refs).toEqual(["!", "f"]);
        });
    });

    // ================================================================
    // Dynamic lens references — lens args in mutate context
    // ================================================================

    describe("dynamic lens references", () => {
        it("$(n) with lens arg mutates correct element", () => {
            const data = { idx: 1, items: ["a", "b", "c"] };
            Lens.mutate(data, ($) => $("items")($("idx")), "X");
            expect(data.items).toEqual(["a", "X", "c"]);
        });

        it("Map.get() with lens arg mutates correct entry", () => {
            const data = { key: "fontSize", prefs: new Map([["theme", 1], ["fontSize", 14]]) };
            Lens.mutate(data, ($) => $("prefs").get($("key")), 20);
            expect(data.prefs.get("fontSize")).toBe(20);
            expect(data.prefs.get("theme")).toBe(1);
        });
    });
});
