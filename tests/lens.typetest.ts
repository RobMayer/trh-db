import { LensSubAccessible, LensSubAccess, LensSubSelectable, LensSubSelect } from "../src/types";
import { SelectorLens } from "../src/util/lens/types";

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

class Example implements LensSubSelectable<{ link: [string, string]; node: [string, number]; has: [string, boolean] }> {
    link = (k: string) => "hi";
    node = (k: string) => 0;
    has = (k: string) => false;
    [LensSubSelect] = {
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

// .each() unwraps element type for chaining, eval stays as array
const e_addresses_each: SelectorLens<Address[], Address> = e$("addresses").each();

// .each() then property access — eval becomes string[], chain is string
const e_types: SelectorLens<string[], string> = e$("addresses").each()("type");
const e_zips: SelectorLens<string[], string> = e$("addresses").each()("zip");

// .each() then .size() — length of each element's property
const e_type_sizes: SelectorLens<number[], number> = e$("addresses").each()("type").size();

// Simple array .each() then no further chaining
const e_tags_each: SelectorLens<string[], string> = e$("tags").each();

// .each() on nested array field
const e_nested_tags: SelectorLens<string[], string> = $("nested")("tags").each();

// .each() on number[][] — eval stays as number[][], chain unwraps to number[]
const e_matrix_each: SelectorLens<number[][], number[]> = e$("matrix").each();
// .at() after .each() — chain is number[], at(0) gives number, eval wraps to number[]
const e_matrix_each_at: SelectorLens<number[], number> = e$("matrix").each().at(0);

// Chaining .size() on the array itself vs after .each()
const e_addr_size: SelectorLens<number> = e$("addresses").size(); // size of the array

// should point to points to string[]
const e_addrtype_aryEach: SelectorLens<number[], number> = e$("addresses")
    .each()
    .transform((m) => Number(m.type));
const e_addrtype_ary: SelectorLens<string[], string> = e$("addresses")
    .each()
    .transform((m) => m.type);
const e_addrtype_num: SelectorLens<number> = e$("name").transform((item) => Number(item));
