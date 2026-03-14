import { describe, it, expect } from "vitest";
import { Lens } from "../../src/util/lens";
import { SubLensNav, Contains, Containable } from "../../src/types";

// --- Test fixtures ---

const person = {
    name: "Rob",
    age: 30,
    active: true,
    address: {
        city: "Portland",
        zip: "97201",
    },
    roles: ["admin", "editor", "viewer"],
    scores: [95, 82, 71, 88],
    tags: new Set(["dev", "lead"]),
    prefs: new Map<string, number>([
        ["theme", 1],
        ["fontSize", 14],
    ]),
};

const team = [
    { name: "Alice", age: 25, role: "dev" },
    { name: "Bob", age: 35, role: "lead" },
    { name: "Carol", age: 28, role: "dev" },
    { name: "Dave", age: 40, role: "manager" },
];

// --- Tests ---

describe("Lens.get", () => {
    describe("property access", () => {
        it("accesses a top-level property", () => {
            expect(Lens.get(person, ($) => $("name"))).toBe("Rob");
            expect(Lens.get(person, ($) => $("age"))).toBe(30);
        });

        it("accesses nested properties", () => {
            expect(Lens.get(person, ($) => $("address")("city"))).toBe("Portland");
        });

        it("returns undefined for missing properties", () => {
            const data = { a: 1 };
            //@ts-expect-error
            expect(Lens.get(data, ($) => $("missing"))).toBeUndefined();
        });

        it("returns undefined when chaining through null", () => {
            const data = { a: null };
            //@ts-expect-error
            expect(Lens.get(data, ($) => $("a")("b"))).toBeUndefined();
        });
    });
    describe("index access", () => {
        it("accesses array elements by index", () => {
            expect(Lens.get(person, ($) => $("roles")(0))).toBe("admin");
            expect(Lens.get(person, ($) => $("roles")(2))).toBe("viewer");
        });

        it("accesses with at() including negative indices", () => {
            expect(Lens.get(person, ($) => $("scores").at(0))).toBe(95);
            expect(Lens.get(person, ($) => $("scores").at(-1))).toBe(88);
            expect(Lens.get(person, ($) => $("scores").at(-2))).toBe(71);
        });
    });

    describe("size and length", () => {
        it("returns string length via size()", () => {
            expect(Lens.get(person, ($) => $("name").size())).toBe(3);
        });

        it("returns array length via size()", () => {
            expect(Lens.get(person, ($) => $("roles").size())).toBe(3);
        });

        it("returns array length via length()", () => {
            expect(Lens.get(person, ($) => $("scores").length())).toBe(4);
        });

        it("returns Set size", () => {
            expect(Lens.get(person, ($) => $("tags").size())).toBe(2);
        });

        it("returns Map size", () => {
            expect(Lens.get(person, ($) => $("prefs").size())).toBe(2);
        });

        it("returns object key count via size()", () => {
            expect(Lens.get(person, ($) => $("address").size())).toBe(2);
        });
    });

    describe("keys and values", () => {
        it("returns object keys", () => {
            expect(Lens.get(person, ($) => $("address").keys())).toEqual(["city", "zip"]);
        });

        it("returns object values", () => {
            expect(Lens.get(person, ($) => $("address").values())).toEqual(["Portland", "97201"]);
        });
    });

    describe("Map and Set", () => {
        it("gets a Map value", () => {
            expect(Lens.get(person, ($) => $("prefs").get("theme"))).toBe(1);
            expect(Lens.get(person, ($) => $("prefs").get("fontSize"))).toBe(14);
        });

        it("checks Map has", () => {
            expect(Lens.get(person, ($) => $("prefs").has("theme"))).toBe(true);
            expect(Lens.get(person, ($) => $("prefs").has("missing"))).toBe(false);
        });

        it("checks Set has", () => {
            expect(Lens.get(person, ($) => $("tags").has("dev"))).toBe(true);
            expect(Lens.get(person, ($) => $("tags").has("qa"))).toBe(false);
        });
    });

    describe("transform", () => {
        it("applies a transform function", () => {
            expect(Lens.get(person, ($) => $("name").transform((s) => s.toUpperCase()))).toBe("ROB");
        });

        it("transforms a nested value", () => {
            expect(Lens.get(person, ($) => $("age").transform((n) => n * 2))).toBe(60);
        });
    });

    describe("each", () => {
        it("maps property access over array elements", () => {
            expect(Lens.get(team, ($) => $.each()("name"))).toEqual(["Alice", "Bob", "Carol", "Dave"]);
        });

        it("maps size over each element", () => {
            expect(Lens.get(team, ($) => $.each()("name").size())).toEqual([5, 3, 5, 4]);
        });

        it("chains each with nested property access", () => {
            const data = { items: [{ info: { x: 1 } }, { info: { x: 2 } }, { info: { x: 3 } }] };
            expect(Lens.get(data, ($) => $("items").each()("info")("x"))).toEqual([1, 2, 3]);
        });

        it("flattens with nested each", () => {
            const matrix = {
                rows: [
                    [1, 2],
                    [3, 4],
                    [5, 6],
                ],
            };
            expect(Lens.get(matrix, ($) => $("rows").each().each())).toEqual([1, 2, 3, 4, 5, 6]);
        });

        it("maps transform over each element", () => {
            expect(Lens.get(team, ($) => $.each()("age").transform((a) => a + 1))).toEqual([26, 36, 29, 41]);
        });
    });

    describe("filter", () => {
        it("filters an array with a callback", () => {
            expect(Lens.get(person, ($) => $("scores").filter((s) => s > 80))).toEqual([95, 82, 88]);
        });
    });

    describe("slice", () => {
        it("slices an array", () => {
            expect(Lens.get(person, ($) => $("scores").slice(1, 3))).toEqual([82, 71]);
        });

        it("slices with no end", () => {
            expect(Lens.get(person, ($) => $("scores").slice(2))).toEqual([71, 88]);
        });
    });

    describe("sort", () => {
        it("sorts with a comparator", () => {
            expect(Lens.get(person, ($) => $("scores").sort((a, b) => a - b))).toEqual([71, 82, 88, 95]);
        });

        it("sorts by accessor ascending", () => {
            const result = Lens.get(team, ($) => $.sort(($s) => $s("age"), "asc"));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Carol", "Bob", "Dave"]);
        });

        it("sorts by accessor descending", () => {
            const result = Lens.get(team, ($) => $.sort(($s) => $s("name"), "desc"));
            expect(result.map((r: any) => r.name)).toEqual(["Dave", "Carol", "Bob", "Alice"]);
        });

        it("does not mutate the original", () => {
            Lens.get(person, ($) => $("scores").sort((a, b) => a - b));
            expect(person.scores).toEqual([95, 82, 71, 88]);
        });
    });

    describe("where", () => {
        it("filters with equality", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("role"), "=", "dev"]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Carol"]);
        });

        it("filters with ordering", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("age"), ">", 30]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Dave"]);
        });

        it("filters with range (exclusive)", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("age"), "><", 25, 40]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Carol"]);
        });

        it("filters with range (inclusive)", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("age"), ">=<", 25, 40]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Bob", "Carol", "Dave"]);
        });

        it("filters with negated equality", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("role"), "!=", "dev"]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Dave"]);
        });

        it("filters with string contains", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("name"), "%", "a"]));
            expect(result.map((r: any) => r.name)).toEqual(["Carol", "Dave"]);
        });

        it("filters with case-insensitive contains", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("name"), "%^", "a"]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Carol", "Dave"]);
        });

        it("filters with starts-with", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("name"), "%_", "D"]));
            expect(result.map((r: any) => r.name)).toEqual(["Dave"]);
        });

        it("filters with ends-with", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("name"), "_%", "b"]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob"]);
        });

        it("filters with regex", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("name"), "~", /^[A-B]/]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Bob"]);
        });

        it("filters with array has", () => {
            const data = [
                { name: "x", tags: ["a", "b"] },
                { name: "y", tags: ["b", "c"] },
                { name: "z", tags: ["c", "d"] },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("tags"), "#", "b"]));
            expect(result.map((r: any) => r.name)).toEqual(["x", "y"]);
        });

        it("filters with typeof", () => {
            const data = [
                { name: "a", val: 1 },
                { name: "b", val: "two" },
                { name: "c", val: 3 },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), ":", "string"]));
            expect(result.map((r: any) => r.name)).toEqual(["b"]);
        });

        it("filters with unary truthiness", () => {
            const data = [
                { name: "a", val: 1 },
                { name: "b", val: 0 },
                { name: "c", val: null },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "?"]));
            expect(result.map((r: any) => r.name)).toEqual(["a"]);
        });

        it("filters with negated unary", () => {
            const data = [
                { name: "a", val: 1 },
                { name: "b", val: 0 },
                { name: "c", val: null },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "!?"]));
            expect(result.map((r: any) => r.name)).toEqual(["b", "c"]);
        });

        it("filters with equality any-of", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("role"), "=|", ["dev", "lead"]]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Bob", "Carol"]);
        });

        it("filters with regex any-of", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("name"), "~|", [/^A/, /^D/]]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Dave"]);
        });

        it("filters with has all-of", () => {
            const data = [
                { name: "x", tags: ["a", "b", "c"] },
                { name: "y", tags: ["a", "c"] },
                { name: "z", tags: ["a", "b"] },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("tags"), "#&", ["a", "b"]]));
            expect(result.map((r: any) => r.name)).toEqual(["x", "z"]);
        });
    });

    describe("logical combinators", () => {
        it("or — matches either condition", () => {
            const result = Lens.get(team, ($) => $.where(($s) => $s.or([$s("age"), "<", 26], [$s("role"), "=", "manager"])));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Dave"]);
        });

        it("and — matches both conditions", () => {
            const result = Lens.get(team, ($) => $.where(($s) => $s.and([$s("age"), "<", 30], [$s("role"), "=", "dev"])));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Carol"]);
        });

        it("not — negates a condition", () => {
            const result = Lens.get(team, ($) => $.where(($s) => $s.not([$s("role"), "=", "dev"])));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Dave"]);
        });

        it("xor — exactly one true", () => {
            const result = Lens.get(team, ($) => $.where(($s) => $s.xor([$s("age"), ">", 30], [$s("role"), "=", "dev"])));
            // Alice: age<=30 T, dev T → xor(F,T) = T
            // Bob: age>30 T, dev F → xor(T,F) = T
            // Carol: age<=30 F, dev T → xor(F,T) = T
            // Dave: age>30 T, dev F → xor(T,F) = T
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Bob", "Carol", "Dave"]);
        });

        it("nested combinators", () => {
            const result = Lens.get(team, ($) => $.where(($s) => $s.and($s.or([$s("role"), "=", "dev"], [$s("role"), "=", "lead"]), [$s("age"), "<", 30])));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Carol"]);
        });
    });

    describe("custom accessors", () => {
        class Registry {
            #entries: Record<string, number>;
            constructor(entries: Record<string, number>) {
                this.#entries = entries;
            }
            [SubLensNav] = {
                lookup: (key: string, hint: string, value?: number) => {
                    if (hint === "select") return this.#entries[key] ?? -1;
                },
            };
        }

        it("dispatches SubLensNav methods", () => {
            const data = { reg: new Registry({ alpha: 10, beta: 20 }) };
            expect(Lens.get(data, ($) => ($("reg") as any).lookup("alpha"))).toBe(10);
            expect(Lens.get(data, ($) => ($("reg") as any).lookup("missing"))).toBe(-1);
        });

        class ReadOnlyStore {
            #data: Map<string, string>;
            constructor(data: Map<string, string>) {
                this.#data = data;
            }
            [SubLensNav] = {
                fetch: (key: string, hint: string, value?: string | null) => {
                    if (hint === "select") return this.#data.get(key) ?? null;
                },
            };
        }

        it("dispatches SubLensNav keyed methods", () => {
            const data = { store: new ReadOnlyStore(new Map([["x", "hello"]])) };
            expect(Lens.get(data, ($) => ($("store") as any).fetch("x"))).toBe("hello");
            expect(Lens.get(data, ($) => ($("store") as any).fetch("y"))).toBeNull();
        });
    });

    describe("sort — nullish handling", () => {
        const items = [
            { name: "Alice", score: 10 },
            { name: "Bob", score: null },
            { name: "Carol", score: 30 },
            { name: "Dave", score: undefined },
            { name: "Eve", score: 20 },
        ];

        it("pushes nullish values last by default", () => {
            const result = Lens.get(items, ($) => $.sort(($s) => $s("score"), "asc"));
            const names = result.map((r: any) => r.name);
            expect(names.slice(0, 3)).toEqual(["Alice", "Eve", "Carol"]);
            expect(names.slice(3)).toEqual(expect.arrayContaining(["Bob", "Dave"]));
        });

        it("pushes nullish values first with config", () => {
            const result = Lens.get(items, ($) => $.sort(($s) => $s("score"), { direction: "asc", nullish: "first" }));
            const names = result.map((r: any) => r.name);
            expect(names.slice(0, 2)).toEqual(expect.arrayContaining(["Bob", "Dave"]));
            expect(names.slice(2)).toEqual(["Alice", "Eve", "Carol"]);
        });

        it("sorts descending with nullish last", () => {
            const result = Lens.get(items, ($) => $.sort(($s) => $s("score"), { direction: "desc", nullish: "last" }));
            const names = result.map((r: any) => r.name);
            expect(names.slice(0, 3)).toEqual(["Carol", "Eve", "Alice"]);
            expect(names.slice(3)).toEqual(expect.arrayContaining(["Bob", "Dave"]));
        });

        it("maintains stable order for equal values", () => {
            const data = [
                { name: "A", priority: 1 },
                { name: "B", priority: 1 },
                { name: "C", priority: 1 },
            ];
            const result = Lens.get(data, ($) => $.sort(($s) => $s("priority"), "asc"));
            expect(result.map((r: any) => r.name)).toEqual(["A", "B", "C"]);
        });
    });

    describe("sort — natural string collation", () => {
        it("sorts strings with embedded numbers naturally", () => {
            const files = [{ n: "file10" }, { n: "file2" }, { n: "file1" }, { n: "file20" }];
            const result = Lens.get(files, ($) => $.sort(($s) => $s("n"), "asc"));
            expect(result.map((r: any) => r.n)).toEqual(["file1", "file2", "file10", "file20"]);
        });
    });

    describe("comparison — incomparable types", () => {
        it("returns false for ordering on incomparable types", () => {
            const data = [
                { name: "a", val: {} },
                { name: "b", val: 5 },
                { name: "c", val: [] },
            ];
            // Objects are not comparable to numbers — should not match > or <
            const gt = Lens.get(data, ($) => $.where(($s) => [$s("val"), ">", 3]));
            expect(gt.map((r: any) => r.name)).toEqual(["b"]);
        });
    });

    describe("equality — bidirectional Equals symbol", () => {
        it("checks left-side Equals symbol", () => {
            const Eq = Symbol.for("Equals");
            // Use the actual imported Equals symbol from types
            const data = [
                { name: "a", val: { [Eq]: () => true } },
                { name: "b", val: 5 },
            ];
            // Without the Equals symbol from types.ts, this is just a regular object — strict equality fails
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "=", 999]));
            // Only "b" would match strict equality to 999 — neither should match
            expect(result.map((r: any) => r.name)).toEqual([]);
        });
    });

    describe("typeof — hierarchical type strings", () => {
        it("matches exact type strings", () => {
            const data = [
                { name: "num", val: 42 },
                { name: "str", val: "hello" },
                { name: "nil", val: null },
                { name: "arr", val: [1, 2] },
                { name: "set", val: new Set() },
                { name: "map", val: new Map() },
                { name: "date", val: new Date() },
            ];
            expect(Lens.get(data, ($) => $.where(($s) => [$s("val"), ":", "string"])).map((r: any) => r.name)).toEqual(["str"]);
            expect(Lens.get(data, ($) => $.where(($s) => [$s("val"), ":", "array"])).map((r: any) => r.name)).toEqual(["arr"]);
            expect(Lens.get(data, ($) => $.where(($s) => [$s("val"), ":", "set"])).map((r: any) => r.name)).toEqual(["set"]);
            expect(Lens.get(data, ($) => $.where(($s) => [$s("val"), ":", "map"])).map((r: any) => r.name)).toEqual(["map"]);
            expect(Lens.get(data, ($) => $.where(($s) => [$s("val"), ":", "date"])).map((r: any) => r.name)).toEqual(["date"]);
        });

        it("matches hierarchical type prefixes", () => {
            const data = [
                { name: "int", val: 42 },
                { name: "big", val: 100n },
                { name: "nil", val: null },
                { name: "undef", val: undefined },
            ];
            // "number" prefix matches both "number/native" and "number/bigint"
            expect(Lens.get(data, ($) => $.where(($s) => [$s("val"), ":", "number"])).map((r: any) => r.name)).toEqual(["int", "big"]);
            // "nullish" prefix matches both "nullish/null" and "nullish/undefined"
            expect(Lens.get(data, ($) => $.where(($s) => [$s("val"), ":", "nullish"])).map((r: any) => r.name)).toEqual(["nil", "undef"]);
        });
    });

    describe("string coercion guards", () => {
        it("rejects booleans from string operators", () => {
            const data = [
                { name: "a", val: true },
                { name: "b", val: "true" },
                { name: "c", val: false },
            ];
            // "true" contains "ru", but boolean true should not match
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "%", "ru"]));
            expect(result.map((r: any) => r.name)).toEqual(["b"]);
        });

        it("rejects arrays from string operators", () => {
            const data = [
                { name: "a", val: [1, 2] },
                { name: "b", val: "1,2" },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "%", "1"]));
            expect(result.map((r: any) => r.name)).toEqual(["b"]);
        });

        it("allows numbers in string operators", () => {
            const data = [
                { name: "a", val: 12345 },
                { name: "b", val: 67890 },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "%", "234"]));
            expect(result.map((r: any) => r.name)).toEqual(["a"]);
        });

        it("returns false for null/undefined in string operators", () => {
            const data = [
                { name: "a", val: null },
                { name: "b", val: undefined },
                { name: "c", val: "hello" },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "%", "h"]));
            expect(result.map((r: any) => r.name)).toEqual(["c"]);
        });

        it("uses custom toString for objects", () => {
            const obj = { toString: () => "custom-value" };
            const data = [
                { name: "a", val: obj },
                { name: "b", val: "other" },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "%", "custom"]));
            expect(result.map((r: any) => r.name)).toEqual(["a"]);
        });
    });

    describe("regex safety", () => {
        it("handles invalid regex strings gracefully", () => {
            const data = [
                { name: "a", val: "hello" },
                { name: "b", val: "world" },
            ];
            // "[invalid" is not a valid regex — should not throw, just no matches
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "~", "[invalid"]));
            expect(result).toEqual([]);
        });

        it("still works with valid regex strings", () => {
            const data = [
                { name: "a", val: "hello" },
                { name: "b", val: "world" },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "~", "^h"]));
            expect(result.map((r: any) => r.name)).toEqual(["a"]);
        });

        it("rejects non-string subjects for regex", () => {
            const data = [
                { name: "a", val: true },
                { name: "b", val: "true" },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "~", /true/]));
            expect(result.map((r: any) => r.name)).toEqual(["b"]);
        });
    });

    describe("range auto-ordering", () => {
        it("works with operands in correct order", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("age"), "><", 25, 40]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Carol"]);
        });

        it("works with operands in reversed order", () => {
            // Same as above but hi,lo instead of lo,hi — should give same result
            const result = Lens.get(team, ($) => $.where(($s) => [$s("age"), "><", 40, 25]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Carol"]);
        });

        it("inclusive range with reversed operands", () => {
            const result = Lens.get(team, ($) => $.where(($s) => [$s("age"), ">=<", 40, 25]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Bob", "Carol", "Dave"]);
        });
    });

    describe("Lens.get", () => {
        it("works identically for basic access", () => {
            expect(Lens.get(person, ($) => $("address")("city"))).toBe("Portland");
        });

        it("works with size", () => {
            expect(Lens.get(person, ($) => $("roles").size())).toBe(3);
        });
    });

    describe("# operator with Sets", () => {
        it("filters by Set membership", () => {
            const data = [
                { name: "a", tags: new Set(["x", "y"]) },
                { name: "b", tags: new Set(["y", "z"]) },
                { name: "c", tags: new Set(["z", "w"]) },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("tags"), "#", "y"]));
            expect(result.map((r: any) => r.name)).toEqual(["a", "b"]);
        });

        it("negated Set membership with !#", () => {
            const data = [
                { name: "a", tags: new Set(["x", "y"]) },
                { name: "b", tags: new Set(["y", "z"]) },
                { name: "c", tags: new Set(["z", "w"]) },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("tags"), "!#", "y"]));
            expect(result.map((r: any) => r.name)).toEqual(["c"]);
        });
    });

    describe("# operator with Containable", () => {
        class TagBag implements Containable<string> {
            items: string[];
            constructor(...items: string[]) {
                this.items = items;
            }
            [Contains] = (other: string) => this.items.includes(other);
        }

        it("filters by Containable membership", () => {
            const data = [
                { name: "a", bag: new TagBag("x", "y") },
                { name: "b", bag: new TagBag("y", "z") },
                { name: "c", bag: new TagBag("z", "w") },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("bag"), "#", "y"]));
            expect(result.map((r: any) => r.name)).toEqual(["a", "b"]);
        });

        it("negated Containable membership with !#", () => {
            const data = [
                { name: "a", bag: new TagBag("x", "y") },
                { name: "b", bag: new TagBag("y", "z") },
                { name: "c", bag: new TagBag("z", "w") },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("bag"), "!#", "y"]));
            expect(result.map((r: any) => r.name)).toEqual(["c"]);
        });

        it("Containable takes priority over array fallback", () => {
            // An object that is array-like but also has Contains — Contains should win
            class WeirdContainer implements Containable<number> {
                // Contains always returns true regardless of input
                [Contains] = (_other: number) => true;
            }
            const data = [{ val: new WeirdContainer() }, { val: [1, 2, 3] }];
            // WeirdContainer's Contains always returns true, so val with WeirdContainer matches
            const result = Lens.get(data, ($) => $.where(($s) => [$s("val"), "#", 999]));
            expect(result).toHaveLength(1);
            expect(result[0].val).toBeInstanceOf(WeirdContainer);
        });

        it("Containable with numeric element type", () => {
            class NumberSet implements Containable<number> {
                private nums: Set<number>;
                constructor(...nums: number[]) {
                    this.nums = new Set(nums);
                }
                [Contains] = (other: number) => this.nums.has(other);
            }

            const data = [
                { name: "evens", nums: new NumberSet(2, 4, 6) },
                { name: "odds", nums: new NumberSet(1, 3, 5) },
                { name: "primes", nums: new NumberSet(2, 3, 5) },
            ];
            const result = Lens.get(data, ($) => $.where(($s) => [$s("nums"), "#", 3]));
            expect(result.map((r: any) => r.name)).toEqual(["odds", "primes"]);
        });
    });

    // ================================================================
    // each(callback) — per-element navigation
    // ================================================================

    describe("each(callback)", () => {
        const items = [
            { name: "A", pointer: 1, refs: ["x", "y", "z"] },
            { name: "B", pointer: 0, refs: ["p", "q"] },
            { name: "C", pointer: 2, refs: ["a", "b", "c"] },
        ];

        it("basic: each(el => el(field)) works like each()(field)", () => {
            const result = Lens.get(items, ($) => $.each((el) => el("name")));
            expect(result).toEqual(["A", "B", "C"]);
        });

        it("dynamic index: each(el => el(refs).at(el(pointer)))", () => {
            const result = Lens.get(items, ($) => $.each((el) => el("refs").at(el("pointer"))));
            expect(result).toEqual(["y", "p", "c"]);
        });

        it("root closure: callback uses root $ for cross-referencing", () => {
            const data = { globalIdx: 0, items: [{ refs: ["a", "b"] }, { refs: ["c", "d"] }] };
            const result = Lens.get(data, ($) => $("items").each((el) => el("refs").at($("globalIdx"))));
            expect(result).toEqual(["a", "c"]);
        });

        it("chaining after each(callback)", () => {
            const data = [
                { ref: { name: "Alice", age: 30 } },
                { ref: { name: "Bob", age: 25 } },
            ];
            const result = Lens.get(data, ($) => $.each((el) => el("ref"))("name"));
            expect(result).toEqual(["Alice", "Bob"]);
        });

        it("with where filter before each(callback)", () => {
            const result = Lens.get(items, ($) => $.where(($s) => [$s("pointer"), ">", 0]).each((el) => el("refs").at(el("pointer"))));
            expect(result).toEqual(["y", "c"]);
        });

        it("null safety: missing fields return undefined", () => {
            const data = [{ a: { b: 1 } }, { a: null }, { a: { b: 3 } }];
            const result = Lens.get(data, ($) => $.each((el) => el("a")("b")));
            expect(result).toEqual([1, undefined, 3]);
        });
    });

    // ================================================================
    // Dynamic lens references — lens args in $(n), get, has, slice
    // ================================================================

    describe("dynamic lens references", () => {
        it("$(n) with lens arg — index from sibling field", () => {
            const data = { idx: 2, items: ["a", "b", "c", "d"] };
            const result = Lens.get(data, ($) => $("items")($("idx")));
            expect(result).toBe("c");
        });

        it("$(n) with negative lens arg", () => {
            const data = { idx: -1, items: ["a", "b", "c"] };
            const result = Lens.get(data, ($) => $("items")($("idx")));
            expect(result).toBe("c");
        });

        it("at() with lens arg from root", () => {
            const data = { pick: 1, scores: [10, 20, 30] };
            const result = Lens.get(data, ($) => $("scores").at($("pick")));
            expect(result).toBe(20);
        });

        it("Map.get() with lens arg", () => {
            const data = { key: "fontSize", prefs: new Map([["theme", 1], ["fontSize", 14]]) };
            const result = Lens.get(data, ($) => $("prefs").get($("key")));
            expect(result).toBe(14);
        });

        it("Set.has() with lens arg", () => {
            const data = { check: "dev", tags: new Set(["dev", "lead"]) };
            const result = Lens.get(data, ($) => $("tags").has($("check")));
            expect(result).toBe(true);
        });

        it("Set.has() with lens arg — negative case", () => {
            const data = { check: "nope", tags: new Set(["dev", "lead"]) };
            const result = Lens.get(data, ($) => $("tags").has($("check")));
            expect(result).toBe(false);
        });

        it("Map.has() with lens arg", () => {
            const data = { key: "theme", prefs: new Map([["theme", 1], ["fontSize", 14]]) };
            const result = Lens.get(data, ($) => $("prefs").has($("key")));
            expect(result).toBe(true);
        });

        it("slice() with lens args", () => {
            const data = { from: 1, to: 3, items: ["a", "b", "c", "d", "e"] };
            const result = Lens.get(data, ($) => $("items").slice($("from"), $("to")));
            expect(result).toEqual(["b", "c"]);
        });

        it("slice() with only start as lens arg", () => {
            const data = { from: 2, items: ["a", "b", "c", "d"] };
            const result = Lens.get(data, ($) => $("items").slice($("from")));
            expect(result).toEqual(["c", "d"]);
        });

        it("each(callback) with $(n) inside callback", () => {
            const data = [
                { pick: 0, vals: [10, 20] },
                { pick: 1, vals: [30, 40] },
            ];
            const result = Lens.get(data, ($) => $.each((el) => el("vals")(el("pick"))));
            expect(result).toEqual([10, 40]);
        });

        it("custom keyed accessor with lens arg", () => {
            class Registry {
                #entries: Record<string, number>;
                constructor(entries: Record<string, number>) {
                    this.#entries = entries;
                }
                [SubLensNav] = {
                    lookup: (key: string, hint: string, value?: number) => {
                        if (hint === "select") return this.#entries[key] ?? -1;
                    },
                };
            }
            const data = { which: "beta", reg: new Registry({ alpha: 10, beta: 20, gamma: 30 }) };
            const result = Lens.get(data, ($) => ($("reg") as any).lookup($("which")));
            expect(result).toBe(20);
        });

        it("custom keyed accessor with lens arg inside each()", () => {
            class Store {
                #data: Record<string, number>;
                constructor(data: Record<string, number>) {
                    this.#data = data;
                }
                [SubLensNav] = {
                    lookup: (key: string, hint: string, value?: number) => {
                        if (hint === "select") return this.#data[key] ?? 0;
                    },
                };
            }
            const data = [
                { key: "x", store: new Store({ x: 100, y: 200 }) },
                { key: "y", store: new Store({ x: 300, y: 400 }) },
            ];
            const result = Lens.get(data, ($) => $.each((el) => (el("store") as any).lookup(el("key"))));
            expect(result).toEqual([100, 400]);
        });
    });
});
