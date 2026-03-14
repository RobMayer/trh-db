import { describe, it, expect } from "vitest";
import { Lens } from "../../src/util/lens";
import { LensAccess, LensMutate, LensApply, LensSubAccess, LensSubMutate, LensSubApply } from "../../src/types";

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
            [LensAccess] = {
                x: () => this.#x,
                y: () => this.#y,
            };
            [LensMutate] = {
                x: (v: number) => {
                    this.#x = v;
                },
                y: (v: number) => {
                    this.#y = v;
                },
            };
        }

        it("mutates via custom named accessor (LensMutate)", () => {
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
            [LensSubAccess] = {
                lookup: (key: string) => this.#data[key],
            };
            [LensSubMutate] = {
                lookup: (key: string, value: number) => {
                    this.#data[key] = value;
                },
            };
        }

        it("mutates via custom keyed accessor (LensSubMutate)", () => {
            const store = new KeyedStore({ alpha: 10, beta: 20 });
            const data = { store };
            Lens.mutate(data, ($) => ($("store") as any).lookup("alpha"), 99);
            expect(data.store.getVal("alpha")).toBe(99);
            expect(data.store.getVal("beta")).toBe(20); // unchanged
        });
    });
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
            [LensAccess] = {
                x: () => this.#x,
                y: () => this.#y,
            };
            [LensApply] = {
                x: (v: number) => new Vector2(v, this.#y),
                y: (v: number) => new Vector2(this.#x, v),
            };
        }

        it("applies via custom named accessor (LensApply) — returns new instance", () => {
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
            [LensSubAccess] = {
                lookup: (key: string) => this.#data[key],
            };
            [LensSubApply] = {
                lookup: (key: string, value: number) => {
                    const next = new KeyedStore(this.#data);
                    next.#data[key] = value;
                    return next;
                },
            };
        }

        it("applies via custom keyed accessor (LensSubApply) — returns new instance", () => {
            const store = new KeyedStore({ alpha: 10, beta: 20 });
            const data = { store };
            const result = Lens.apply(data, ($) => ($("store") as any).lookup("alpha"), 99);
            expect(result.store.getVal("alpha")).toBe(99);
            expect(result.store.getVal("beta")).toBe(20);
            expect(data.store.getVal("alpha")).toBe(10); // original unchanged
            expect(result.store).not.toBe(data.store); // new instance
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
});
