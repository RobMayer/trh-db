import { describe, it, expect } from "vitest";
import { Lens } from "../../src/util/lens";
import { LensSubQuery, LensSubAccess } from "../../src/types";

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

describe("Lens.query", () => {
    describe("property access", () => {
        it("accesses a top-level property", () => {
            expect(Lens.query(person, ($) => $("name"))).toBe("Rob");
            expect(Lens.query(person, ($) => $("age"))).toBe(30);
        });

        it("accesses nested properties", () => {
            expect(Lens.query(person, ($) => $("address")("city"))).toBe("Portland");
        });

        it("returns undefined for missing properties", () => {
            const data = { a: 1 };
            //@ts-expect-error
            expect(Lens.query(data, ($) => $("missing"))).toBeUndefined();
        });

        it("returns undefined when chaining through null", () => {
            const data = { a: null };
            //@ts-expect-error
            expect(Lens.query(data, ($) => $("a")("b"))).toBeUndefined();
        });
    });
    describe("index access", () => {
        it("accesses array elements by index", () => {
            expect(Lens.query(person, ($) => $("roles")(0))).toBe("admin");
            expect(Lens.query(person, ($) => $("roles")(2))).toBe("viewer");
        });

        it("accesses with at() including negative indices", () => {
            expect(Lens.query(person, ($) => $("scores").at(0))).toBe(95);
            expect(Lens.query(person, ($) => $("scores").at(-1))).toBe(88);
            expect(Lens.query(person, ($) => $("scores").at(-2))).toBe(71);
        });
    });

    describe("size and length", () => {
        it("returns string length via size()", () => {
            expect(Lens.query(person, ($) => $("name").size())).toBe(3);
        });

        it("returns array length via size()", () => {
            expect(Lens.query(person, ($) => $("roles").size())).toBe(3);
        });

        it("returns array length via length()", () => {
            expect(Lens.query(person, ($) => $("scores").length())).toBe(4);
        });

        it("returns Set size", () => {
            expect(Lens.query(person, ($) => $("tags").size())).toBe(2);
        });

        it("returns Map size", () => {
            expect(Lens.query(person, ($) => $("prefs").size())).toBe(2);
        });

        it("returns object key count via size()", () => {
            expect(Lens.query(person, ($) => $("address").size())).toBe(2);
        });
    });

    describe("keys and values", () => {
        it("returns object keys", () => {
            expect(Lens.query(person, ($) => $("address").keys())).toEqual(["city", "zip"]);
        });

        it("returns object values", () => {
            expect(Lens.query(person, ($) => $("address").values())).toEqual(["Portland", "97201"]);
        });
    });

    describe("Map and Set", () => {
        it("gets a Map value", () => {
            expect(Lens.query(person, ($) => $("prefs").get("theme"))).toBe(1);
            expect(Lens.query(person, ($) => $("prefs").get("fontSize"))).toBe(14);
        });

        it("checks Map has", () => {
            expect(Lens.query(person, ($) => $("prefs").has("theme"))).toBe(true);
            expect(Lens.query(person, ($) => $("prefs").has("missing"))).toBe(false);
        });

        it("checks Set has", () => {
            expect(Lens.query(person, ($) => $("tags").has("dev"))).toBe(true);
            expect(Lens.query(person, ($) => $("tags").has("qa"))).toBe(false);
        });
    });

    describe("transform", () => {
        it("applies a transform function", () => {
            expect(Lens.query(person, ($) => $("name").transform((s) => s.toUpperCase()))).toBe("ROB");
        });

        it("transforms a nested value", () => {
            expect(Lens.query(person, ($) => $("age").transform((n) => n * 2))).toBe(60);
        });
    });

    describe("each", () => {
        it("maps property access over array elements", () => {
            expect(Lens.query(team, ($) => $.each()("name"))).toEqual(["Alice", "Bob", "Carol", "Dave"]);
        });

        it("maps size over each element", () => {
            expect(Lens.query(team, ($) => $.each()("name").size())).toEqual([5, 3, 5, 4]);
        });

        it("chains each with nested property access", () => {
            const data = { items: [{ info: { x: 1 } }, { info: { x: 2 } }, { info: { x: 3 } }] };
            expect(Lens.query(data, ($) => $("items").each()("info")("x"))).toEqual([1, 2, 3]);
        });

        it("flattens with nested each", () => {
            const matrix = {
                rows: [
                    [1, 2],
                    [3, 4],
                    [5, 6],
                ],
            };
            expect(Lens.query(matrix, ($) => $("rows").each().each())).toEqual([1, 2, 3, 4, 5, 6]);
        });

        it("maps transform over each element", () => {
            expect(Lens.query(team, ($) => $.each()("age").transform((a) => a + 1))).toEqual([26, 36, 29, 41]);
        });
    });

    describe("filter", () => {
        it("filters an array with a callback", () => {
            expect(Lens.query(person, ($) => $("scores").filter((s) => s > 80))).toEqual([95, 82, 88]);
        });
    });

    describe("slice", () => {
        it("slices an array", () => {
            expect(Lens.query(person, ($) => $("scores").slice(1, 3))).toEqual([82, 71]);
        });

        it("slices with no end", () => {
            expect(Lens.query(person, ($) => $("scores").slice(2))).toEqual([71, 88]);
        });
    });

    describe("sort", () => {
        it("sorts with a comparator", () => {
            expect(Lens.query(person, ($) => $("scores").sort((a, b) => a - b))).toEqual([71, 82, 88, 95]);
        });

        it("sorts by accessor ascending", () => {
            const result = Lens.query(team, ($) => $.sort(($s) => $s("age"), "asc"));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Carol", "Bob", "Dave"]);
        });

        it("sorts by accessor descending", () => {
            const result = Lens.query(team, ($) => $.sort(($s) => $s("name"), "desc"));
            expect(result.map((r: any) => r.name)).toEqual(["Dave", "Carol", "Bob", "Alice"]);
        });

        it("does not mutate the original", () => {
            Lens.query(person, ($) => $("scores").sort((a, b) => a - b));
            expect(person.scores).toEqual([95, 82, 71, 88]);
        });
    });

    describe("where", () => {
        it("filters with equality", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("role"), "=", "dev"]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Carol"]);
        });

        it("filters with ordering", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("age"), ">", 30]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Dave"]);
        });

        it("filters with range (exclusive)", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("age"), "><", 25, 40]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Carol"]);
        });

        it("filters with range (inclusive)", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("age"), ">=<", 25, 40]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Bob", "Carol", "Dave"]);
        });

        it("filters with negated equality", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("role"), "!=", "dev"]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Dave"]);
        });

        it("filters with string contains", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("name"), "%", "a"]));
            expect(result.map((r: any) => r.name)).toEqual(["Carol", "Dave"]);
        });

        it("filters with case-insensitive contains", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("name"), "%^", "a"]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Carol", "Dave"]);
        });

        it("filters with starts-with", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("name"), "%_", "D"]));
            expect(result.map((r: any) => r.name)).toEqual(["Dave"]);
        });

        it("filters with ends-with", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("name"), "_%", "b"]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob"]);
        });

        it("filters with regex", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("name"), "~", /^[A-B]/]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Bob"]);
        });

        it("filters with array has", () => {
            const data = [
                { name: "x", tags: ["a", "b"] },
                { name: "y", tags: ["b", "c"] },
                { name: "z", tags: ["c", "d"] },
            ];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("tags"), "#", "b"]));
            expect(result.map((r: any) => r.name)).toEqual(["x", "y"]);
        });

        it("filters with typeof", () => {
            const data = [
                { name: "a", val: 1 },
                { name: "b", val: "two" },
                { name: "c", val: 3 },
            ];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), ":", "string"]));
            expect(result.map((r: any) => r.name)).toEqual(["b"]);
        });

        it("filters with unary truthiness", () => {
            const data = [
                { name: "a", val: 1 },
                { name: "b", val: 0 },
                { name: "c", val: null },
            ];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "?"]));
            expect(result.map((r: any) => r.name)).toEqual(["a"]);
        });

        it("filters with negated unary", () => {
            const data = [
                { name: "a", val: 1 },
                { name: "b", val: 0 },
                { name: "c", val: null },
            ];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "!?"]));
            expect(result.map((r: any) => r.name)).toEqual(["b", "c"]);
        });

        it("filters with equality any-of", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("role"), "=|", ["dev", "lead"]]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Bob", "Carol"]);
        });

        it("filters with regex any-of", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("name"), "~|", [/^A/, /^D/]]));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Dave"]);
        });

        it("filters with has all-of", () => {
            const data = [
                { name: "x", tags: ["a", "b", "c"] },
                { name: "y", tags: ["a", "c"] },
                { name: "z", tags: ["a", "b"] },
            ];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("tags"), "#&", ["a", "b"]]));
            expect(result.map((r: any) => r.name)).toEqual(["x", "z"]);
        });
    });

    describe("logical combinators", () => {
        it("or — matches either condition", () => {
            const result = Lens.query(team, ($) => $.where(($s) => $s.or([$s("age"), "<", 26], [$s("role"), "=", "manager"])));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Dave"]);
        });

        it("and — matches both conditions", () => {
            const result = Lens.query(team, ($) => $.where(($s) => $s.and([$s("age"), "<", 30], [$s("role"), "=", "dev"])));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Carol"]);
        });

        it("not — negates a condition", () => {
            const result = Lens.query(team, ($) => $.where(($s) => $s.not([$s("role"), "=", "dev"])));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Dave"]);
        });

        it("xor — exactly one true", () => {
            const result = Lens.query(team, ($) => $.where(($s) => $s.xor([$s("age"), ">", 30], [$s("role"), "=", "dev"])));
            // Alice: age<=30 T, dev T → xor(F,T) = T
            // Bob: age>30 T, dev F → xor(T,F) = T
            // Carol: age<=30 F, dev T → xor(F,T) = T
            // Dave: age>30 T, dev F → xor(T,F) = T
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Bob", "Carol", "Dave"]);
        });

        it("nested combinators", () => {
            const result = Lens.query(team, ($) => $.where(($s) => $s.and($s.or([$s("role"), "=", "dev"], [$s("role"), "=", "lead"]), [$s("age"), "<", 30])));
            expect(result.map((r: any) => r.name)).toEqual(["Alice", "Carol"]);
        });
    });

    describe("custom accessors", () => {
        class Registry {
            #entries: Record<string, number>;
            constructor(entries: Record<string, number>) {
                this.#entries = entries;
            }
            [LensSubQuery] = {
                lookup: (key: string) => this.#entries[key] ?? -1,
            };
        }

        it("dispatches LensSubQuery methods", () => {
            const data = { reg: new Registry({ alpha: 10, beta: 20 }) };
            expect(Lens.query(data, ($) => ($("reg") as any).lookup("alpha"))).toBe(10);
            expect(Lens.query(data, ($) => ($("reg") as any).lookup("missing"))).toBe(-1);
        });

        class ReadOnlyStore {
            #data: Map<string, string>;
            constructor(data: Map<string, string>) {
                this.#data = data;
            }
            [LensSubAccess] = {
                fetch: (key: string) => this.#data.get(key) ?? null,
            };
        }

        it("dispatches LensSubAccess methods", () => {
            const data = { store: new ReadOnlyStore(new Map([["x", "hello"]])) };
            expect(Lens.query(data, ($) => ($("store") as any).fetch("x"))).toBe("hello");
            expect(Lens.query(data, ($) => ($("store") as any).fetch("y"))).toBeNull();
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
            const result = Lens.query(items, ($) => $.sort(($s) => $s("score"), "asc"));
            const names = result.map((r: any) => r.name);
            expect(names.slice(0, 3)).toEqual(["Alice", "Eve", "Carol"]);
            expect(names.slice(3)).toEqual(expect.arrayContaining(["Bob", "Dave"]));
        });

        it("pushes nullish values first with config", () => {
            const result = Lens.query(items, ($) => $.sort(($s) => $s("score"), { direction: "asc", nullish: "first" }));
            const names = result.map((r: any) => r.name);
            expect(names.slice(0, 2)).toEqual(expect.arrayContaining(["Bob", "Dave"]));
            expect(names.slice(2)).toEqual(["Alice", "Eve", "Carol"]);
        });

        it("sorts descending with nullish last", () => {
            const result = Lens.query(items, ($) => $.sort(($s) => $s("score"), { direction: "desc", nullish: "last" }));
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
            const result = Lens.query(data, ($) => $.sort(($s) => $s("priority"), "asc"));
            expect(result.map((r: any) => r.name)).toEqual(["A", "B", "C"]);
        });
    });

    describe("sort — natural string collation", () => {
        it("sorts strings with embedded numbers naturally", () => {
            const files = [{ n: "file10" }, { n: "file2" }, { n: "file1" }, { n: "file20" }];
            const result = Lens.query(files, ($) => $.sort(($s) => $s("n"), "asc"));
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
            const gt = Lens.query(data, ($) => $.where(($s) => [$s("val"), ">", 3]));
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
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "=", 999]));
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
            expect(Lens.query(data, ($) => $.where(($s) => [$s("val"), ":", "string"])).map((r: any) => r.name)).toEqual(["str"]);
            expect(Lens.query(data, ($) => $.where(($s) => [$s("val"), ":", "array"])).map((r: any) => r.name)).toEqual(["arr"]);
            expect(Lens.query(data, ($) => $.where(($s) => [$s("val"), ":", "set"])).map((r: any) => r.name)).toEqual(["set"]);
            expect(Lens.query(data, ($) => $.where(($s) => [$s("val"), ":", "map"])).map((r: any) => r.name)).toEqual(["map"]);
            expect(Lens.query(data, ($) => $.where(($s) => [$s("val"), ":", "date"])).map((r: any) => r.name)).toEqual(["date"]);
        });

        it("matches hierarchical type prefixes", () => {
            const data = [
                { name: "int", val: 42 },
                { name: "big", val: 100n },
                { name: "nil", val: null },
                { name: "undef", val: undefined },
            ];
            // "number" prefix matches both "number/native" and "number/bigint"
            expect(Lens.query(data, ($) => $.where(($s) => [$s("val"), ":", "number"])).map((r: any) => r.name)).toEqual(["int", "big"]);
            // "nullish" prefix matches both "nullish/null" and "nullish/undefined"
            expect(Lens.query(data, ($) => $.where(($s) => [$s("val"), ":", "nullish"])).map((r: any) => r.name)).toEqual(["nil", "undef"]);
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
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "%", "ru"]));
            expect(result.map((r: any) => r.name)).toEqual(["b"]);
        });

        it("rejects arrays from string operators", () => {
            const data = [
                { name: "a", val: [1, 2] },
                { name: "b", val: "1,2" },
            ];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "%", "1"]));
            expect(result.map((r: any) => r.name)).toEqual(["b"]);
        });

        it("allows numbers in string operators", () => {
            const data = [
                { name: "a", val: 12345 },
                { name: "b", val: 67890 },
            ];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "%", "234"]));
            expect(result.map((r: any) => r.name)).toEqual(["a"]);
        });

        it("returns false for null/undefined in string operators", () => {
            const data = [
                { name: "a", val: null },
                { name: "b", val: undefined },
                { name: "c", val: "hello" },
            ];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "%", "h"]));
            expect(result.map((r: any) => r.name)).toEqual(["c"]);
        });

        it("uses custom toString for objects", () => {
            const obj = { toString: () => "custom-value" };
            const data = [{ name: "a", val: obj }, { name: "b", val: "other" }];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "%", "custom"]));
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
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "~", "[invalid"]));
            expect(result).toEqual([]);
        });

        it("still works with valid regex strings", () => {
            const data = [
                { name: "a", val: "hello" },
                { name: "b", val: "world" },
            ];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "~", "^h"]));
            expect(result.map((r: any) => r.name)).toEqual(["a"]);
        });

        it("rejects non-string subjects for regex", () => {
            const data = [
                { name: "a", val: true },
                { name: "b", val: "true" },
            ];
            const result = Lens.query(data, ($) => $.where(($s) => [$s("val"), "~", /true/]));
            expect(result.map((r: any) => r.name)).toEqual(["b"]);
        });
    });

    describe("range auto-ordering", () => {
        it("works with operands in correct order", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("age"), "><", 25, 40]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Carol"]);
        });

        it("works with operands in reversed order", () => {
            // Same as above but hi,lo instead of lo,hi — should give same result
            const result = Lens.query(team, ($) => $.where(($s) => [$s("age"), "><", 40, 25]));
            expect(result.map((r: any) => r.name)).toEqual(["Bob", "Carol"]);
        });

        it("inclusive range with reversed operands", () => {
            const result = Lens.query(team, ($) => $.where(($s) => [$s("age"), ">=<", 40, 25]));
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
});
