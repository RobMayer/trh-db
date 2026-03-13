import { QueryLens } from "../src/util/lens/types";
import { Predicate } from "../src/util/predicate";
import { LogicalOps, PredicateResult } from "../src/util/logic";

// ============================================================
// Test Data & Infrastructure
// ============================================================

type TestData = {
    name: string;
    age: number;
    roles: string[];
    active: boolean;
    nested: { deep: number; tags: string[] };
    logins: number;
};

type TestMeta = {
    ID: QueryLens<string>;
    DEPTH: QueryLens<number>;
};

// Minimal where function for testing predicate inference
declare function where<T>(pred: ($: QueryLens<TestData> & TestMeta & LogicalOps) => Predicate<T> | PredicateResult): void;

// ============================================================
// Property Access in Predicates
// ============================================================

// Top-level property
where(($) => [$("age"), ">", 12]);

// Nested property
where(($) => [$("nested")("deep"), ">", 5]);

// .size() on array
where(($) => [$("roles").size(), ">", 2]);

// .size() on string
where(($) => [$("name").size(), ">", 3]);

// .at() on array
where(($) => [$("roles").at(0), "=", "admin"]);

// .length() on array
where(($) => [$("roles").length(), ">=", 1]);

// Nested array utility
where(($) => [$("nested")("tags").size(), ">", 0]);

// ============================================================
// Meta-field Access
// ============================================================

where(($) => [$.ID, "=", "abc"]);
where(($) => [$.DEPTH, ">", 3]);

// ============================================================
// Sublens on RHS
// ============================================================

where(($) => [$("age"), "=", $("logins")]);
where(($) => [$("age"), ">", $("logins")]);

// ============================================================
// Operator Coverage — Equality
// ============================================================

where(($) => [$("name"), "=", "Alice"]);
where(($) => [$("name"), "!=", "Bob"]);
where(($) => [$("name"), "==", "Alice"]);
where(($) => [$("name"), "!==", "Bob"]);

// ============================================================
// Operator Coverage — Equality Any-of
// ============================================================

where(($) => [$("age"), "=|", [18, 21, 25]]);
where(($) => [$("age"), "!=|", [18, 21]]);

// ============================================================
// Operator Coverage — Ordering (number)
// ============================================================

where(($) => [$("age"), ">", 18]);
where(($) => [$("age"), ">=", 18]);
where(($) => [$("age"), "<", 65]);
where(($) => [$("age"), "<=", 65]);
where(($) => [$("age"), "!>", 100]);
where(($) => [$("age"), "!>=", 18]);

// Ordering (string)
where(($) => [$("name"), ">", "Alice"]);

// ============================================================
// Operator Coverage — String Ops
// ============================================================

where(($) => [$("name"), "%", "ali"]);
where(($) => [$("name"), "!%", "ali"]);
where(($) => [$("name"), "%^", "Ali"]);
where(($) => [$("name"), "%_", "ali"]);
where(($) => [$("name"), "_%", "ice"]);
where(($) => [$("name"), "%|", ["ali", "bob"]]);
where(($) => [$("name"), "%&", ["hello", "world"]]);

// ============================================================
// Operator Coverage — Regex
// ============================================================

where(($) => [$("name"), "~", /^Alice/i]);
where(($) => [$("name"), "!~", /^Bob/]);
where(($) => [$("name"), "~|", [/^Alice/, /^Bob/]]);
where(($) => [$("name"), "~&", [/^A/, /e$/]]);

// ============================================================
// Operator Coverage — Array Has
// ============================================================

where(($) => [$("roles"), "#", "admin"]);
where(($) => [$("roles"), "!#", "banned"]);
where(($) => [$("roles"), "#|", ["admin", "mod"]]);
where(($) => [$("roles"), "#&", ["admin", "editor"]]);

// ============================================================
// Operator Coverage — Typeof
// ============================================================

where(($) => [$("name"), ":", "string"]);
where(($) => [$("name"), "!:", "number"]);
where(($) => [$("age"), ":|", ["number", "string"]]);

// ============================================================
// Range (4-member)
// ============================================================

where(($) => [$("age"), "><", 18, 65]);
where(($) => [$("age"), ">=<", 18, 65]);
where(($) => [$("age"), "!><", 18, 65]);
where(($) => [$("age"), "><", 18, $("logins")]);

// ============================================================
// Combinators
// ============================================================

where(($) => $.or([$("age"), ">", 18], [$("name"), "%", "A"]));
where(($) => $.and([$("age"), ">", 18], [$("active"), "=", true]));
where(($) => $.not([$("active"), "=", false]));
where(($) => $.xor([$("age"), ">", 18], [$("active"), "=", true]));

// Nested combinator
where(($) => $.or($.and([$("age"), ">", 18], [$("active"), "=", true]), [$("roles"), "#", "admin"]));

// Range inside combinator
where(($) => $.or([$("age"), "><", 18, 25], [$("name"), "%", "A"]));

// ============================================================
// Discriminated Union
// ============================================================

type UnionData = { type: "person"; age: number; name: string } | { type: "book"; title: string; pages: number };

declare function uWhere<T>(pred: ($: QueryLens<UnionData> & { ID: QueryLens<string> } & LogicalOps) => Predicate<T> | PredicateResult): void;

// Common key
uWhere(($) => [$("type"), "=", "person"]);

// Variant-specific keys
uWhere(($) => [$("age"), ">", 18]);
uWhere(($) => [$("title"), "%", "TypeScript"]);
uWhere(($) => [$("pages"), ">", 100]);
uWhere(($) => [$("name"), "=", "Alice"]);

// Variant-specific key on RHS
uWhere(($) => [$("age"), ">", $("pages")]);

// Combinator with variant-specific keys
uWhere(($) => $.or([$("age"), ">", 18], [$("title"), "%", "Guide"]));

// Equality any-of with variant-specific key
uWhere(($) => [$("name"), "=|", ["Alice", "Bob"]]);

// Nested union
type NestedUnionData = { type: "a"; meta: { score: number } } | { type: "b"; meta: { label: string } };

declare function nuWhere<T>(pred: ($: QueryLens<NestedUnionData> & { ID: QueryLens<string> } & LogicalOps) => Predicate<T> | PredicateResult): void;

nuWhere(($) => [$("type"), "=", "a"]);
nuWhere(($) => [$("meta")("score"), ">", 5]);
nuWhere(($) => [$("meta")("label"), "%", "hello"]);

// Combinator with variant-specific keys from nested union
uWhere(($) => $.or([$("age"), ">", 18], [$("title"), "%", "Guide"]));

// ============================================================
// Optional Fields
// ============================================================

type OptionalData = {
    name: string;
    age: number;
    nickname?: string;
    score?: number;
    tags?: string[];
    nested: { value: number; label?: string };
};

declare function oWhere<T>(pred: ($: QueryLens<OptionalData> & TestMeta & LogicalOps) => Predicate<T> | PredicateResult): void;

// Required fields
oWhere(($) => [$("name"), "=", "Alice"]);
oWhere(($) => [$("age"), ">", 18]);

// Optional fields
oWhere(($) => [$("nickname"), "=", "Ali"]);
oWhere(($) => [$("score"), ">", 50]);
oWhere(($) => [$("tags"), "#", "admin"]);
oWhere(($) => [$("tags").at(0), "=", "test"]);
oWhere(($) => [$("tags")(0), "=", "test"]);

// String ops on optional string
oWhere(($) => [$("nickname"), "%", "Ali"]);

// Nested optional field
oWhere(($) => [$("nested")("label"), "%", "hello"]);

// Optional field on RHS
oWhere(($) => [$("age"), ">", $("score")]);

oWhere(($) => [$("score"), ">", $("age")]);

// Size of optional array
oWhere(($) => [$("tags").size(), ">", 0]);

// ============================================================
// Unary Operators (2-member predicates)
// ============================================================

// Boolean field — truthiness
where(($) => [$("active"), "?"]);
where(($) => [$("active"), "!?"]);

// Optional field — is defined?
oWhere(($) => [$("nickname"), "?"]);
oWhere(($) => [$("score"), "!?"]);

// Nested optional field
oWhere(($) => [$("nested")("label"), "?"]);

// ============================================================
// Unary Operators — Map/Set .has()
// ============================================================

type UnaryMapSetData = {
    name: string;
    active: boolean;
    myMap: Map<string, number>;
    mySet: Set<string>;
};

declare function msWhere<T>(pred: ($: QueryLens<UnaryMapSetData> & TestMeta & LogicalOps) => Predicate<T> | PredicateResult): void;

// Map.has() → boolean lens → unary check
msWhere(($) => [$("myMap").has("someKey"), "?"]);
msWhere(($) => [$("myMap").has("someKey"), "!?"]);

// Set.has() → boolean lens → unary check
msWhere(($) => [$("mySet").has("admin"), "?"]);
msWhere(($) => [$("mySet").has("admin"), "!?"]);

// Unary in combinators
msWhere(($) => $.or([$("active"), "?"], [$("myMap").has("key"), "?"]));
msWhere(($) => $.and([$("mySet").has("admin"), "?"], [$("name"), "=", "Alice"]));

// ============================================================
// .each() — Predicates on Mapped Array Elements
// ============================================================

type Address = { type: string; location: string; zip: string };
type EachData = {
    name: string;
    addresses: Address[];
    matrix: number[][];
    tags: string[];
};

declare function eWhere<T>(pred: ($: QueryLens<EachData> & TestMeta & LogicalOps) => Predicate<T> | PredicateResult): void;

// After .each(), Eval = string[] so "#" (array has) is valid
eWhere(($) => [$("addresses").each()("type"), "#", "shipping"]);
eWhere(($) => [$("addresses").each()("type"), "#|", ["shipping", "billing"]]);
eWhere(($) => [$("addresses").each()("zip"), "#", "12345"]);

// .each() on simple string array — Eval = string[]
eWhere(($) => [$("tags").each(), "#", "urgent"]);
eWhere(($) => [$("tags").each(), "!#", "spam"]);

// .each() then .size() — Eval = number[] → array has
eWhere(($) => [$("addresses").each()("type").size(), "#", 4]);

// Size of the addresses array itself (no .each()) — Eval = number → ordering
eWhere(($) => [$("addresses").size(), ">", 0]);
eWhere(($) => [$("addresses").size(), ">=", 1]);

// .each() in combinators
eWhere(($) => $.or([$("addresses").each()("type"), "#", "home"], [$("name"), "%", "A"]));
eWhere(($) => $.and([$("tags").each(), "#", "vip"], [$("addresses").size(), ">", 0]));

// .each() on matrix — Eval = number[][] → has array element
eWhere(($) => [$("matrix").each().at(0), "#", 42]);

// Range on .each() sizes
eWhere(($) => [$("addresses").each()("location").size(), "#", 10]);

eWhere(($) => [
    $("tags")
        .where((_) => [_, "=", "test"])
        .size(),
    ">",
    3,
]);
