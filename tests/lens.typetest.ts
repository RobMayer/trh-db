import { SubLensNavigable, SubLensNav } from "../src/types";
import { DataLens, SelectorLens, MutatorLensOf, ApplierLensOf } from "../src/util/lens/types";

// ============================================================
// Test Data Shapes
// ============================================================

type TestData = {
    name: string;
    age: number;
    roles: string[];
    active: boolean;
    nested: { deep: number; tags: string[] };
    logins: number;
};

declare const $: SelectorLens<TestData>;

// ============================================================
// Property Access
// ============================================================

// Top-level
const l_name: SelectorLens<string> = $("name");
const l_age: SelectorLens<number> = $("age");
const l_roles: SelectorLens<string[]> = $("roles");
const l_active: SelectorLens<boolean> = $("active");
const l_logins: SelectorLens<number> = $("logins");

// Nested
const l_deep: SelectorLens<number> = $("nested")("deep");
const l_tags: SelectorLens<string[]> = $("nested")("tags");

// ============================================================
// Utility Methods
// ============================================================

// .size() — arrays, strings
const l_roles_size: SelectorLens<number> = $("roles").size();
const l_name_size: SelectorLens<number> = $("name").size();
const l_nested_tags_size: SelectorLens<number> = $("nested")("tags").size();

// .length() — arrays, strings
const l_roles_len: SelectorLens<number> = $("roles").length();

// .at() — arrays
const l_first_role: SelectorLens<string> = $("roles").at(0);

// .keys() — objects
const l_nested_keys: SelectorLens<string[]> = $("nested").keys();

// .values() — objects
const l_nested_values: SelectorLens<(number | string[])[]> = $("nested").values();

// ============================================================
// Discriminated Union Support
// ============================================================

type UnionData = { type: "person"; age: number; name: string } | { type: "book"; title: string; pages: number };

declare const u$: SelectorLens<UnionData>;

// Common key
const u_type: SelectorLens<"person" | "book"> = u$("type");

// Variant-specific keys (SafeLookup: present → T, absent → undefined)
const u_age: SelectorLens<number | undefined> = u$("age");
const u_title: SelectorLens<string | undefined> = u$("title");
const u_pages: SelectorLens<number | undefined> = u$("pages");
const u_name: SelectorLens<string | undefined> = u$("name");

// Nested union with shared key, different nested shapes
type NestedUnionData = { type: "a"; meta: { score: number } } | { type: "b"; meta: { label: string } };

declare const nu$: SelectorLens<NestedUnionData>;

const nu_type: SelectorLens<"a" | "b"> = nu$("type");
const nu_meta: SelectorLens<{ score: number } | { label: string }> = nu$("meta");
const nu_score: SelectorLens<number | undefined> = nu$("meta")("score");
const nu_label: SelectorLens<string | undefined> = nu$("meta")("label");

// ============================================================
// Optional Field Support
// ============================================================

class Example implements SubLensNavigable<{ link: [string, string]; node: [string, number]; has: [string, boolean] }> {
    [SubLensNav] = {
        link: (key: string, hint: string, value?: string) => { if (hint === "select") return "hi"; },
        node: (key: string, hint: string, value?: number) => { if (hint === "select") return 0; },
        has: (key: string, hint: string, value?: boolean) => { if (hint === "select") return false; },
    };
}

type OptionalData = {
    name: string;
    age: number;
    nickname?: string;
    score?: number;
    tags?: string[];
    nested: { value: number; label?: string };
    someDate: Date;
    someMap: Map<string, number>;
    someExample: Example;
};

declare const o$: SelectorLens<OptionalData>;

// Required fields
const o_name: SelectorLens<string> = o$("name");
const o_age: SelectorLens<number> = o$("age");

// Optional fields (T | undefined)
const o_nick: SelectorLens<string | undefined> = o$("nickname");
const o_date: SelectorLens<() => number> = o$("someDate")("getDay");
const o_score: SelectorLens<number | undefined> = o$("score");
const o_tags: SelectorLens<string[] | undefined> = o$("tags");
const o_mapNumber: SelectorLens<number> = o$("someMap").get("someKey");

// Nested optional
const o_label: SelectorLens<string | undefined> = o$("nested")("label");
const o_value: SelectorLens<number> = o$("nested")("value");

// Utility on optional array
const o_tags_size: SelectorLens<number> = o$("tags").size();

const o_weird = o$("someExample").has("test");

// ============================================================
// .each() — Array Element Mapping
// ============================================================

type Address = { type: string; location: string; zip: string };
type EachData = {
    name: string;
    addresses: Address[];
    matrix: number[][];
    tags: string[];
};

declare const e$: SelectorLens<EachData>;

// .each() unwraps element type for chaining, eval stays as array, target is element
const e_addresses_each: DataLens<Address, Address[], Address> = e$("addresses").each();

// .each() then property access — eval becomes string[], chain is string, target is string
const e_types: DataLens<string, string[], string> = e$("addresses").each()("type");
const e_zips: DataLens<string, string[], string> = e$("addresses").each()("zip");

// .each() then .size() — read-only, target is never
const e_type_sizes: DataLens<never, number[], number> = e$("addresses").each()("type").size();

// Simple array .each() then no further chaining
const e_tags_each: DataLens<string, string[], string> = e$("tags").each();

// .each() on nested array field
const e_nested_tags: DataLens<string, string[], string> = $("nested")("tags").each();

// .each() on number[][] — eval stays as number[][], chain unwraps to number[]
const e_matrix_each: DataLens<number[], number[][], number[]> = e$("matrix").each();
// .at() after .each() — chain is number[], at(0) gives number, eval wraps to number[]
const e_matrix_each_at: DataLens<number, number[], number> = e$("matrix").each().at(0);

// Chaining .size() on the array itself vs after .each()
const e_addr_size: SelectorLens<number> = e$("addresses").size(); // size of the array

// .each() then .transform() — read-only (target = never), eval wraps
const e_addrtype_aryEach: DataLens<never, number[], number> = e$("addresses")
    .each()
    .transform((m) => Number(m.type));
const e_addrtype_ary: DataLens<never, string[], string> = e$("addresses")
    .each()
    .transform((m) => m.type);
const e_addrtype_num: DataLens<never, number> = e$("name").transform((item) => Number(item));

// ============================================================
// Target = never enforcement — read-only ops can't be mutation terminals
// ============================================================

// Enforcement works through function inference: when the lens callback returns
// a DataLens with Target = never, R infers as never, making the value parameter
// `never` — so any concrete value is a type error.

declare function testMutate<D, R>(data: D, lens: ($: DataLens<D>) => MutatorLensOf<R>, value: R): void;
declare function testApply<D, R>(data: D, lens: ($: DataLens<D>) => ApplierLensOf<R>, value: R): D;

declare const testData: TestData;
declare const eachTestData: EachData;
declare const optTestData: OptionalData;

// --- Valid mutation terminals (Target ≠ never) — should compile ---

testMutate(testData, ($) => $("name"), "new");
testMutate(testData, ($) => $("nested")("deep"), 42);
testMutate(testData, ($) => $("roles")(0), "new");
testMutate(testData, ($) => $("roles").at(0), "new");
testMutate(eachTestData, ($) => $("addresses").each()("type"), "new");
testMutate(optTestData, ($) => $("someMap").get("key"), 42);
testApply(testData, ($) => $("name"), "new");
testApply(testData, ($) => $("roles").at(-1), "new");

// --- Invalid mutation terminals (Target = never) — @ts-expect-error on each ---

// @ts-expect-error — .size() is read-only
testMutate(testData, ($) => $("roles").size(), 3);
// @ts-expect-error — .length() is read-only
testMutate(testData, ($) => $("roles").length(), 3);
// @ts-expect-error — .transform() is read-only
testMutate(testData, ($) => $("name").transform((s) => s.length), 5);
// @ts-expect-error — .keys() is read-only
testMutate(testData, ($) => $("nested").keys(), ["a"]);
// @ts-expect-error — .values() is read-only
testMutate(testData, ($) => $("nested").values(), [1]);
// @ts-expect-error — .has() is read-only
testMutate(optTestData, ($) => $("someMap").has("key"), true);
// @ts-expect-error — string .size() is read-only
testMutate(testData, ($) => $("name").size(), 3);
// @ts-expect-error — .size() after .each() is read-only
testMutate(eachTestData, ($) => $("addresses").each()("type").size(), 5);

// Same for apply
// @ts-expect-error — .size() is read-only
testApply(testData, ($) => $("roles").size(), 3);
// @ts-expect-error — .transform() is read-only
testApply(testData, ($) => $("name").transform((s) => s.length), 5);

// --- where/filter/slice/sort set Target = never (need each/at to restore) ---

// @ts-expect-error — .where() without .each()/.at() can't be terminal
testMutate(testData, ($) => $("roles").where(($s) => [$s, "?"]), ["a"]);
// @ts-expect-error — .filter() without .each()/.at() can't be terminal
testMutate(testData, ($) => $("roles").filter(() => true), ["a"]);
// @ts-expect-error — .slice() without .each()/.at() can't be terminal
testMutate(testData, ($) => $("roles").slice(0, 1), ["a"]);

// But where + each/at restores Target — should compile
testMutate(testData, ($) => $("roles").where(($s) => [$s, "?"]).each(), "new");
testMutate(testData, ($) => $("roles").where(($s) => [$s, "?"]).at(0), "new");

// ============================================================
// each(callback) — type-level tests
// ============================================================

// Eval is array of per-element results
const ec_names: DataLens<string, string[], string> = e$("addresses").each((el) => el("type"));

// Chaining after each(callback) — chain is string, so property access on string
const ec_chain: DataLens<never, number[], number> = e$("addresses").each((el) => el("type")).size();

// each(callback) with mutable path — valid mutation terminal
testMutate(eachTestData, ($) => $("addresses").each((el) => el("type")), "new");

// each(callback) with read-only sub-path — Target = never
// @ts-expect-error — .size() inside callback makes it read-only
testMutate(eachTestData, ($) => $("addresses").each((el) => el("type").size()), 5);

// each(callback) apply with mutable path
testApply(eachTestData, ($) => $("addresses").each((el) => el("type")), "new");
