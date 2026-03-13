import { GetterLens } from "../src/util/lens";

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

declare const $: GetterLens<TestData>;

// ============================================================
// Property Access
// ============================================================

// Top-level
const l_name: GetterLens<string> = $("name");
const l_age: GetterLens<number> = $("age");
const l_roles: GetterLens<string[]> = $("roles");
const l_active: GetterLens<boolean> = $("active");
const l_logins: GetterLens<number> = $("logins");

// Nested
const l_deep: GetterLens<number> = $("nested")("deep");
const l_tags: GetterLens<string[]> = $("nested")("tags");

// ============================================================
// Utility Methods
// ============================================================

// .size() — arrays, strings
const l_roles_size: GetterLens<number> = $("roles").size();
const l_name_size: GetterLens<number> = $("name").size();
const l_nested_tags_size: GetterLens<number> = $("nested")("tags").size();

// .length() — arrays, strings
const l_roles_len: GetterLens<number> = $("roles").length();

// .at() — arrays
const l_first_role: GetterLens<string> = $("roles").at(0);

// .keys() — objects
const l_nested_keys: GetterLens<string[]> = $("nested").keys();

// .values() — objects
const l_nested_values: GetterLens<(number | string[])[]> = $("nested").values();

// ============================================================
// Discriminated Union Support
// ============================================================

type UnionData =
    | { type: "person"; age: number; name: string }
    | { type: "book"; title: string; pages: number };

declare const u$: GetterLens<UnionData>;

// Common key
const u_type: GetterLens<"person" | "book"> = u$("type");

// Variant-specific keys (SafeLookup: present → T, absent → undefined)
const u_age: GetterLens<number | undefined> = u$("age");
const u_title: GetterLens<string | undefined> = u$("title");
const u_pages: GetterLens<number | undefined> = u$("pages");
const u_name: GetterLens<string | undefined> = u$("name");

// Nested union with shared key, different nested shapes
type NestedUnionData =
    | { type: "a"; meta: { score: number } }
    | { type: "b"; meta: { label: string } };

declare const nu$: GetterLens<NestedUnionData>;

const nu_type: GetterLens<"a" | "b"> = nu$("type");
const nu_meta: GetterLens<{ score: number } | { label: string }> = nu$("meta");
const nu_score: GetterLens<number | undefined> = nu$("meta")("score");
const nu_label: GetterLens<string | undefined> = nu$("meta")("label");

// ============================================================
// Optional Field Support
// ============================================================

type OptionalData = {
    name: string;
    age: number;
    nickname?: string;
    score?: number;
    tags?: string[];
    nested: { value: number; label?: string };
};

declare const o$: GetterLens<OptionalData>;

// Required fields
const o_name: GetterLens<string> = o$("name");
const o_age: GetterLens<number> = o$("age");

// Optional fields (T | undefined)
const o_nick: GetterLens<string | undefined> = o$("nickname");
const o_score: GetterLens<number | undefined> = o$("score");
const o_tags: GetterLens<string[] | undefined> = o$("tags");

// Nested optional
const o_label: GetterLens<string | undefined> = o$("nested")("label");
const o_value: GetterLens<number> = o$("nested")("value");

// Utility on optional array
const o_tags_size: GetterLens<number> = o$("tags").size();
