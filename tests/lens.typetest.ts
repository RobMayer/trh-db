import { LensSubAccessible, LensSubAccess, LensSubQueryable, LensSubQuery } from "../src/types";
import { QueryLens } from "../src/util/lens";

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

declare const $: QueryLens<TestData>;

// ============================================================
// Property Access
// ============================================================

// Top-level
const l_name: QueryLens<string> = $("name");
const l_age: QueryLens<number> = $("age");
const l_roles: QueryLens<string[]> = $("roles");
const l_active: QueryLens<boolean> = $("active");
const l_logins: QueryLens<number> = $("logins");

// Nested
const l_deep: QueryLens<number> = $("nested")("deep");
const l_tags: QueryLens<string[]> = $("nested")("tags");

// ============================================================
// Utility Methods
// ============================================================

// .size() — arrays, strings
const l_roles_size: QueryLens<number> = $("roles").size();
const l_name_size: QueryLens<number> = $("name").size();
const l_nested_tags_size: QueryLens<number> = $("nested")("tags").size();

// .length() — arrays, strings
const l_roles_len: QueryLens<number> = $("roles").length();

// .at() — arrays
const l_first_role: QueryLens<string> = $("roles").at(0);

// .keys() — objects
const l_nested_keys: QueryLens<string[]> = $("nested").keys();

// .values() — objects
const l_nested_values: QueryLens<(number | string[])[]> = $("nested").values();

// ============================================================
// Discriminated Union Support
// ============================================================

type UnionData = { type: "person"; age: number; name: string } | { type: "book"; title: string; pages: number };

declare const u$: QueryLens<UnionData>;

// Common key
const u_type: QueryLens<"person" | "book"> = u$("type");

// Variant-specific keys (SafeLookup: present → T, absent → undefined)
const u_age: QueryLens<number | undefined> = u$("age");
const u_title: QueryLens<string | undefined> = u$("title");
const u_pages: QueryLens<number | undefined> = u$("pages");
const u_name: QueryLens<string | undefined> = u$("name");

// Nested union with shared key, different nested shapes
type NestedUnionData = { type: "a"; meta: { score: number } } | { type: "b"; meta: { label: string } };

declare const nu$: QueryLens<NestedUnionData>;

const nu_type: QueryLens<"a" | "b"> = nu$("type");
const nu_meta: QueryLens<{ score: number } | { label: string }> = nu$("meta");
const nu_score: QueryLens<number | undefined> = nu$("meta")("score");
const nu_label: QueryLens<string | undefined> = nu$("meta")("label");

// ============================================================
// Optional Field Support
// ============================================================

class Example implements LensSubQueryable<{ link: [string, string]; node: [string, number]; has: [string, boolean] }> {
    link = (k: string) => "hi";
    node = (k: string) => 0;
    has = (k: string) => false;
    [LensSubQuery] = {
        link: this.link,
        node: this.node,
        has: this.has,
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

declare const o$: QueryLens<OptionalData>;

// Required fields
const o_name: QueryLens<string> = o$("name");
const o_age: QueryLens<number> = o$("age");

// Optional fields (T | undefined)
const o_nick: QueryLens<string | undefined> = o$("nickname");
const o_date: QueryLens<() => number> = o$("someDate")("getDay");
const o_score: QueryLens<number | undefined> = o$("score");
const o_tags: QueryLens<string[] | undefined> = o$("tags");
const o_mapNumber: QueryLens<number> = o$("someMap").get("someKey");

// Nested optional
const o_label: QueryLens<string | undefined> = o$("nested")("label");
const o_value: QueryLens<number> = o$("nested")("value");

// Utility on optional array
const o_tags_size: QueryLens<number> = o$("tags").size();

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

declare const e$: QueryLens<EachData>;

// .each() unwraps element type for chaining, eval stays as array
const e_addresses_each: QueryLens<Address[], Address> = e$("addresses").each();

// .each() then property access — eval becomes string[], chain is string
const e_types: QueryLens<string[], string> = e$("addresses").each()("type");
const e_zips: QueryLens<string[], string> = e$("addresses").each()("zip");

// .each() then .size() — length of each element's property
const e_type_sizes: QueryLens<number[], number> = e$("addresses").each()("type").size();

// Simple array .each() then no further chaining
const e_tags_each: QueryLens<string[], string> = e$("tags").each();

// .each() on nested array field
const e_nested_tags: QueryLens<string[], string> = $("nested")("tags").each();

// .each() on number[][] — eval stays as number[][], chain unwraps to number[]
const e_matrix_each: QueryLens<number[][], number[]> = e$("matrix").each();
// .at() after .each() — chain is number[], at(0) gives number, eval wraps to number[]
const e_matrix_each_at: QueryLens<number[], number> = e$("matrix").each().at(0);

// Chaining .size() on the array itself vs after .each()
const e_addr_size: QueryLens<number> = e$("addresses").size(); // size of the array

// should point to points to string[]
const e_addrtype_aryEach: QueryLens<number[], number> = e$("addresses")
    .each()
    .transform((m) => Number(m.type));
const e_addrtype_ary: QueryLens<string[], string> = e$("addresses")
    .each()
    .transform((m) => m.type);
const e_addrtype_num: QueryLens<number> = e$("name").transform((item) => Number(item));
