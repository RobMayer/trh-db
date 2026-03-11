import { CONTEXT_GLYPH, OPERATORS, OPMODS } from "./lib/constants";

// Hierarchical AST Node Types
export type ASTNode = PropertyAccessNode | IndexAccessNode | WildcardAccessNode | CollectionModifierChainNode | GatherNode;

export interface PropertyAccessNode {
    type: "property";
    property: string;
    child?: ASTNode;
}

export interface IndexAccessNode {
    type: "index";
    index: number;
    child?: ASTNode;
}

export interface WildcardAccessNode {
    type: "wildcard";
    child?: ASTNode;
}

export interface CollectionModifierChainNode {
    type: "collection-chain";
    modifiers: CollectionModifier[];
    child?: ASTNode;
}

export interface GatherNode {
    type: "gather";
    sublensCallback: (sublens: any) => any; // Will be properly typed at usage
    child?: ASTNode;
}

// Collection Modifier Types
export type CollectionModifier = WhereModifier | SortModifier | SliceModifier | AtModifier | ReverseModifier | DistinctModifier;

export interface WhereModifier {
    type: "where";
    predicate: PredicateFunction | PredicateDefinition | SublensPredicateDefinition | LogicExpression;
}

export interface SortModifier {
    type: "sort";
    field: string | SublensSortDefinition;
    config?: SortConfig;
}

export interface SliceModifier {
    type: "slice";
    start: number;
    end?: number;
}

export interface AtModifier {
    type: "at";
    index: number;
}

// FirstModifier and LastModifier removed - they are now aliases for AtModifier

export interface ReverseModifier {
    type: "reverse";
}

export interface DistinctModifier {
    type: "distinct";
    field?: string | SublensDistinctDefinition;
}

// Predicate System Types
export interface PredicateDefinition {
    field: string;
    operator: PredicateOperator;
    operand: any;
}

export interface SublensPredicateDefinition {
    sublensCallback: (sublens: any) => any; // Will be properly typed at usage
    operator: PredicateOperator;
    operand: any;
}

export interface SublensSortDefinition {
    sublensCallback: (sublens: any) => any; // Will be properly typed at usage
}

export interface SublensDistinctDefinition {
    sublensCallback: (sublens: any) => any; // Will be properly typed at usage
}

export type PredicateFunction = (item: any) => boolean;

// OR Logic Types
export type PredicateSpec = [string, PredicateOperator, any] | [(sublens: any) => any, PredicateOperator, any];

export interface LogicExpression {
    type: "and" | "or" | "xor" | "not-and" | "not-or" | "not-xor";
    predicates: (PredicateSpec | LogicExpression)[];
}

export interface LogicBuilderCallback {
    (logic: LogicBuilder): LogicExpression;
}

export interface LogicBuilder {
    and(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression;
    or(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression;
    xor(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression;
    not: {
        and(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression;
        or(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression;
        xor(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression;
    };
}

type OpEqual = typeof OPERATORS.EQUAL_LOOSE | typeof OPERATORS.EQUAL_STRICT;
type OpCompare = typeof OPERATORS.COMPARE_GT | typeof OPERATORS.COMPARE_GTE | typeof OPERATORS.COMPARE_LTE | typeof OPERATORS.COMPARE_LT;
type OpString = typeof OPERATORS.STR_INCLUDES | typeof OPERATORS.STR_STARTSWITH | typeof OPERATORS.STR_ENDSWITH | typeof OPERATORS.STR_INCLUDES_CAP | typeof OPERATORS.STR_STARTSWITH_CAP | typeof OPERATORS.STR_ENDSWITH_CAP;
type OpRegex = typeof OPERATORS.STR_REGEX;
type OpRange = typeof OPERATORS.RANGE_INCLUSIVE | typeof OPERATORS.RANGE_EXCLUSIVE;
type OpTypeOf = typeof OPERATORS.TYPEOF;
type OpContains = typeof OPERATORS.CONTAINS;
export type BaseOps = OpEqual | OpCompare | OpString | OpRegex | OpTypeOf | OpRange | OpContains;

export type SafeUpdater<Flags, P, U> = Extract<Flags, P> extends never ? U : never;

// Consolidated operator type generation
type WithWithinOpOf<T extends string> = T | `${T}${typeof OPMODS.WITHIN}`;
type WithNegOpOf<T extends string> = T | `${typeof OPMODS.NEGATE}${T}`;
type WithDirOpOf<T extends string> = T | `${typeof OPMODS.FIRSTOF}${T}` | `${T}${typeof OPMODS.LASTOF}`;

// Generate all operator permutations using utility types
export type PredicateOperator = WithDirOpOf<WithWithinOpOf<WithNegOpOf<BaseOps>>>;

export interface SortConfig {
    direction?: "asc" | "desc";
    nullish?: "first" | "last";
}

// Terminal Call Types
export type TerminalCallType = "count" | "size" | "exists";

export interface TerminalCall {
    type: TerminalCallType;
}

// Core AST and Lens Types
export type Query = ASTNode | null;

export type PathStep = string | number;

export type FinalizedLens<T, Mode extends "single" | "multi" = "single", Flags extends string = ""> = {
    readonly __brand: unique symbol;
    readonly __type: T;
    readonly __mode: Mode;
    readonly __flags: Flags;
    readonly query: Query;
    readonly mode: Mode;
    readonly terminalCall?: TerminalCall;
};

// Enhanced mode inference types for LensBuilder overloads
export type InferMode<T extends ASTNode | null> = T extends null
    ? "single"
    : T extends WildcardAccessNode
    ? InferModeRecursive<T["child"], "multi">
    : T extends CollectionModifierChainNode
    ? InferModeRecursive<T["child"], InferCollectionMode<T["modifiers"]>>
    : T extends PropertyAccessNode | IndexAccessNode
    ? InferModeRecursive<T["child"], "single">
    : "single";

// Recursive mode inference through the AST tree
export type InferModeRecursive<T extends ASTNode | undefined, CurrentMode extends "single" | "multi"> = T extends undefined
    ? CurrentMode
    : T extends WildcardAccessNode
    ? "multi" // Wildcard always forces multi mode
    : T extends CollectionModifierChainNode
    ? InferModeRecursive<T["child"], InferCollectionMode<T["modifiers"]>>
    : T extends PropertyAccessNode | IndexAccessNode
    ? InferModeRecursive<T["child"], CurrentMode> // Property/index preserves current mode
    : CurrentMode;

export type InferCollectionMode<T extends CollectionModifier[]> = T extends [...any[], infer Last]
    ? Last extends AtModifier
        ? "single"
        : Last extends WhereModifier
        ? Last["predicate"] extends PredicateDefinition
            ? IsDirectionalOperator<Last["predicate"]["operator"]> extends true
                ? "single"
                : "multi"
            : "multi"
        : "multi"
    : "multi";

// Helper type to detect directional operators
export type IsDirectionalOperator<T extends string> = T extends `{${string}` | `${string}}` ? true : false;

// Helper type for AMode OR CMode logic: if either is multi, result is multi
export type CombineAccessorAndCollectionMode<AMode extends "single" | "multi", CMode extends "single" | "multi"> = AMode extends "multi" ? "multi" : CMode extends "multi" ? "multi" : "single";

// Terminal call helper types for DRY principle
type CountResult<Mode> = Mode extends "multi" ? FinalizedLens<number, "single", "computed"> : never;
type SizeResult<T, Mode> = Mode extends "single" ? (T extends readonly unknown[] | string | Record<string, any> ? FinalizedLens<number, "single", "computed"> : never) : never;
type ExistsResult<Mode> = Mode extends "single" ? FinalizedLens<boolean, "single", "structural"> : never;

// Collection method return type helpers for DRY principle
type CollectionMethodResult<ArrayType, ItemType, AMode extends "single" | "multi", CMode extends "single" | "multi", Flags extends string> = CollectionLensBuilder<
    ArrayType,
    ItemType,
    AMode,
    CMode,
    Flags
>;

type WhereResult<ArrayType, ItemType, AMode extends "single" | "multi", Op extends string, Flags extends string> = IsDirectionalOperator<Op> extends true
    ? CollectionMethodResult<ArrayType, ItemType, AMode, "single", Flags>
    : CollectionMethodResult<ArrayType, ItemType, AMode, "multi", Flags>;

type MultiMethodResult<ArrayType, ItemType, AMode extends "single" | "multi", Flags extends string> = CollectionMethodResult<ArrayType, ItemType, AMode, "multi", Flags>;

type SingleMethodResult<ArrayType, ItemType, AMode extends "single" | "multi", Flags extends string> = CollectionMethodResult<ArrayType, ItemType, AMode, "single", Flags>;

// Helper type to get result type from a finalized lens
export type LensResult<L> = L extends FinalizedLens<infer T, infer Mode, any> ? (Mode extends "single" ? T : Mode extends "multi" ? T[] : never) : never;

// UNDEFINED_SENTINEL System for broken path tracking
export const UNDEFINED_SENTINEL = Symbol("trh-traversal.undefined-sentinel");
export type UndefinedSentinel = typeof UNDEFINED_SENTINEL;

// UNDEFINED_PLACEHOLDER for sorting undefined values
export const UNDEFINED_PLACEHOLDER = Symbol("trh-traversal.undefined-placeholder");

// Helper type to convert sentinel to undefined at API boundaries
type ResolveSentinel<T> = T extends UndefinedSentinel ? undefined : T;

// Type guard for sentinel detection
export function isSentinel(value: any): value is UndefinedSentinel {
    return value === UNDEFINED_SENTINEL;
}

// Utility to convert sentinel to undefined at API boundaries
export function resolveSentinel<T>(value: T | UndefinedSentinel): ResolveSentinel<T> {
    return (isSentinel(value) ? undefined : value) as ResolveSentinel<T>;
}

// Tri-state logic for predicate operations
export type TriState = true | false | null;

// Helper to check if property exists (vs being undefined)
export function hasProperty(obj: any, key: string | number): boolean {
    if (obj === null || obj === undefined) return false;
    if (typeof key === "number") {
        return Array.isArray(obj) && key >= 0 && key < obj.length;
    }
    return Object.prototype.hasOwnProperty.call(obj, key);
}

// Helper type to extract all possible keys from a union type
// For union types, this gets keys from ANY member (not just common keys)
type KeysOfUnion<T> = T extends any ? keyof T : never;

// Helper type to safely access a property on a union type
// Returns the property type from members that have it, and undefined for those that don't
// Handles union types distributively to get the correct union of possible property types
type SafeUnionAccess<T, K extends PropertyKey> = T extends any ? (K extends keyof T ? T[K] : undefined) : never;

// Helper type to extract element type from arrays using indexed access
type ArrayElement<T> = T extends readonly unknown[] ? T[number] : never;

// Mode-aware LensBuilder interface with type safety constraints and flag support
export interface LensBuilder<T = any, Mode extends "single" | "multi" = "single", Flags extends string = ""> {
    // Index access - MUST come before property access to match numbers correctly
    (index: T extends readonly unknown[] ? number : never): T extends readonly unknown[] ? LensBuilder<T[number], Mode, Flags> : never;

    // Wildcard access - works on arrays (wildcard) or objects with "*" property (property access)
    // Handles unions with null/undefined by checking the non-nullable part
    <W extends "*">(wildcard: W): [T] extends [null | undefined]
        ? never // Explicitly reject pure null/undefined
        : NonNullable<T> extends readonly unknown[]
        ? LensBuilder<NonNullable<T>[number], "multi", Flags>
        : NonNullable<T> extends Record<"*", infer StarValue>
        ? LensBuilder<StarValue, "multi", Flags>
        : never;

    // Property access - handles unions by allowing properties from any member
    // For unions, returns the type from members that have the property, undefined for others
    <K extends KeysOfUnion<NonNullable<T>>>(property: K): LensBuilder<SafeUnionAccess<NonNullable<T>, K> | Extract<T, null | undefined>, Mode, Flags>;

    // Restricted fallback - only for types with explicit index signatures
    // Excludes empty objects {}, unions with undefined/null, and regular typed objects
    (
        property: [T] extends [Record<string, any>]
            ? [T] extends [{}]
                ? never // Exclude empty object {}
                : undefined extends T
                ? never // Exclude unions with undefined
                : null extends T
                ? never // Exclude unions with null
                : string extends keyof T
                ? string
                : never // Only if string is in keyof (index signature)
            : never
    ): LensBuilder<any, Mode, Flags>;

    // Terminal call - finalizes the lens with proper result type and flags
    (): FinalizedLens<T, Mode, Flags>;

    // count() terminal call - only available in multi-mode, returns number of items
    count(): CountResult<Mode>;

    // size() terminal call - only available in single-mode for collections/strings, returns their length
    size(): SizeResult<T, Mode>;

    // exists() terminal call - only available in single-mode, returns boolean indicating path existence
    exists(): ExistsResult<Mode>;

    // Collection modifiers - only allowed on array types
    when<U = T extends readonly (infer Item)[] ? Item : never>(
        predicate: T extends readonly unknown[] ? (item: U) => boolean : never
    ): T extends readonly unknown[] ? MultiMethodResult<T, U, Mode, Flags> : never;

    where<U = T extends readonly (infer Item)[] ? Item : never, Op extends PredicateOperator = PredicateOperator>(
        field: T extends readonly Record<string, unknown>[] ? ValidPredicateTarget<T[number]> : T extends readonly unknown[] ? ValidPredicateTarget<U> : never,
        operator: T extends readonly unknown[] ? Op : never,
        operand: T extends readonly unknown[] ? any : never
    ): T extends readonly unknown[] ? WhereResult<T, U, Mode, Op, Flags> : never;

    // Sublens predicate overload - 3 argument form for nested predicates
    where<U = T extends readonly (infer Item)[] ? Item : never, Op extends PredicateOperator = PredicateOperator, SubT = any>(
        sublensCallback: T extends readonly unknown[] ? (sublens: LensBuilderRoot<U>) => FinalizedLens<SubT, any, any> : never,
        operator: T extends readonly unknown[] ? Op : never,
        operand: T extends readonly unknown[] ? any : never
    ): T extends readonly unknown[] ? WhereResult<T, U, Mode, Op, Flags> : never;

    // Logic expression overload - 1 argument form for OR/AND combinations
    where<U = T extends readonly (infer Item)[] ? Item : never>(
        logicCallback: T extends readonly unknown[] ? (logic: LogicBuilder) => LogicExpression : never
    ): T extends readonly unknown[] ? MultiMethodResult<T, U, Mode, Flags> : never;

    sort<U = T extends readonly (infer Item)[] ? Item : never>(
        field: T extends readonly Record<string, unknown>[] ? ValidTarget<T[number], "sort"> : T extends readonly unknown[] ? ValidTarget<U, "sort"> | SizePropertyPath<U> : never, // Allow size properties on mixed types
        config?: T extends readonly unknown[] ? SortConfig : never
    ): T extends readonly unknown[] ? MultiMethodResult<T, U, Mode, Flags> : never; // sort = multi CMode

    // Sublens sort overload - accepts a callback that returns a finalized lens
    sort<U = T extends readonly (infer Item)[] ? Item : never, SubT = any>(
        sublensCallback: T extends readonly unknown[] ? (sublens: LensBuilderRoot<U>) => FinalizedLens<SubT, any, any> : never,
        config?: T extends readonly unknown[] ? SortConfig : never
    ): T extends readonly unknown[] ? MultiMethodResult<T, U, Mode, Flags> : never; // sort = multi CMode

    slice<U = T extends readonly (infer Item)[] ? Item : never>(
        start: T extends readonly unknown[] ? number : never,
        end?: T extends readonly unknown[] ? number : never
    ): T extends readonly unknown[] ? MultiMethodResult<T, U, Mode, Flags> : never; // slice = multi CMode

    // Convenience aliases for slice operations - only on arrays
    limit<U = T extends readonly (infer Item)[] ? Item : never>(count: T extends readonly unknown[] ? number : never): T extends readonly unknown[] ? MultiMethodResult<T, U, Mode, Flags> : never; // limit = multi CMode

    skip<U = T extends readonly (infer Item)[] ? Item : never>(count: T extends readonly unknown[] ? number : never): T extends readonly unknown[] ? MultiMethodResult<T, U, Mode, Flags> : never; // skip = multi CMode

    at<U = T extends readonly (infer Item)[] ? Item : never>(index: T extends readonly unknown[] ? number : never): T extends readonly unknown[] ? SingleMethodResult<T, U, Mode, Flags> : never; // at = single CMode

    first<U = T extends readonly (infer Item)[] ? Item : never>(): T extends readonly unknown[] ? SingleMethodResult<T, U, Mode, Flags> : never; // first = single CMode

    last<U = T extends readonly (infer Item)[] ? Item : never>(): T extends readonly unknown[] ? SingleMethodResult<T, U, Mode, Flags> : never; // last = single CMode

    reverse<U = T extends readonly (infer Item)[] ? Item : never>(): T extends readonly unknown[] ? MultiMethodResult<T, U, Mode, Flags> : never; // reverse = multi CMode

    distinct<U = T extends readonly (infer Item)[] ? Item : never>(
        field?: T extends readonly Record<string, unknown>[] ? ValidTarget<T[number], "sort"> : T extends readonly unknown[] ? ValidTarget<U, "sort"> | SizePropertyPath<U> : never // Allow size properties on mixed types
    ): T extends readonly unknown[] ? MultiMethodResult<T, U, Mode, Flags> : never; // distinct = multi CMode

    // Sublens distinct overload - accepts a callback that returns a finalized lens
    distinct<U = T extends readonly (infer Item)[] ? Item : never, SubT = any>(
        sublensCallback: T extends readonly unknown[] ? (sublens: LensBuilderRoot<U>) => FinalizedLens<SubT, any, any> : never
    ): T extends readonly unknown[] ? MultiMethodResult<T, U, Mode, Flags> : never; // distinct = multi CMode
}

// Root lens builder interface that provides the collect() method
// Only available at the root level and in sublens callbacks
export interface LensBuilderRoot<T = any, Flags extends string = ""> extends LensBuilder<T, "single", Flags> {
    // gather() method that takes sublens callback and returns multi-mode LensBuilder with "gathered" flag
    gather<U>(sublensCallback: (sublens: LensBuilderRoot<T, "">) => FinalizedLens<U, any, any>): CollectionLensBuilder<U[], U, "multi", "multi", Flags | "gathered">;
}

// Unified collection lens builder with parameterized mode handling
export interface CollectionLensBuilder<ArrayType, ItemType, AMode extends "single" | "multi", CMode extends "single" | "multi", Flags extends string = ""> {
    // Index access - MUST come before property access to match numbers correctly
    (index: ItemType extends readonly unknown[] ? number : never): ItemType extends readonly unknown[] ? LensBuilder<ItemType[number], CombineAccessorAndCollectionMode<AMode, CMode>, Flags> : never;

    // Wildcard access - always forces multi-mode, handles unions with null/undefined
    <W extends "*">(wildcard: W): [ItemType] extends [null | undefined]
        ? never // Explicitly reject pure null/undefined
        : NonNullable<ItemType> extends readonly unknown[]
        ? LensBuilder<NonNullable<ItemType>[number], "multi", Flags>
        : never;

    // Property access - handles unions by allowing properties from any member
    <K extends KeysOfUnion<NonNullable<ItemType>>>(property: K): LensBuilder<
        SafeUnionAccess<NonNullable<ItemType>, K> | Extract<ItemType, null | undefined>,
        CombineAccessorAndCollectionMode<AMode, CMode>,
        Flags
    >;

    // Restricted fallback - only for types with explicit index signatures
    (
        property: [ItemType] extends [Record<string, any>]
            ? [ItemType] extends [{}]
                ? never // Exclude empty object {}
                : undefined extends ItemType
                ? never // Exclude unions with undefined
                : null extends ItemType
                ? never // Exclude unions with null
                : string extends keyof ItemType
                ? string
                : never // Only if string is in keyof (index signature)
            : never
    ): LensBuilder<any, CombineAccessorAndCollectionMode<AMode, CMode>, Flags>;

    // Terminal call - computed mode based on AMode and CMode
    (): FinalizedLens<ItemType, CombineAccessorAndCollectionMode<AMode, CMode>, Flags>;

    // count() terminal call - only available in multi-mode
    count(): CountResult<CombineAccessorAndCollectionMode<AMode, CMode>>;

    // size() terminal call - only available in single-mode for collections/strings
    size(): SizeResult<ItemType, CombineAccessorAndCollectionMode<AMode, CMode>>;

    // exists() terminal call - only available in single-mode, returns boolean indicating path existence
    exists(): ExistsResult<CombineAccessorAndCollectionMode<AMode, CMode>>;

    // Chain more collection modifiers - thread AMode through, compute new CMode
    when(predicate: (item: ItemType) => boolean): MultiMethodResult<ArrayType, ItemType, AMode, Flags>;
    where<Op extends PredicateOperator = PredicateOperator>(
        field: ArrayType extends readonly Record<string, unknown>[] ? ValidPredicateTarget<ArrayType[number]> : ValidPredicateTarget<ItemType>,
        operator: Op,
        operand: any
    ): WhereResult<ArrayType, ItemType, AMode, Op, Flags>;

    // Sublens predicate overload
    where<Op extends PredicateOperator = PredicateOperator, SubT = any>(
        sublensCallback: (sublens: LensBuilderRoot<ItemType, "">) => FinalizedLens<SubT, any, any>,
        operator: Op,
        operand: any
    ): WhereResult<ArrayType, ItemType, AMode, Op, Flags>;

    // Logic expression overload
    where(logicCallback: LogicBuilderCallback): MultiMethodResult<ArrayType, ItemType, AMode, Flags>;

    sort(
        field: ArrayType extends readonly Record<string, unknown>[]
            ? ValidTarget<ArrayType[number], "sort">
            : ArrayType extends readonly unknown[]
            ? ValidTarget<ItemType, "sort"> | SizePropertyPath<ItemType> // Allow size properties on mixed types
            : ValidTarget<ItemType, "sort">,
        config?: SortConfig
    ): MultiMethodResult<ArrayType, ItemType, AMode, Flags>;

    // Sublens sort overload
    sort<SubT = any>(sublensCallback: (sublens: LensBuilderRoot<ItemType>) => FinalizedLens<SubT, any, any>, config?: SortConfig): MultiMethodResult<ArrayType, ItemType, AMode, Flags>;
    slice(start: number, end?: number): MultiMethodResult<ArrayType, ItemType, AMode, Flags>;
    limit(count: number): MultiMethodResult<ArrayType, ItemType, AMode, Flags>;
    skip(count: number): MultiMethodResult<ArrayType, ItemType, AMode, Flags>;
    reverse(): MultiMethodResult<ArrayType, ItemType, AMode, Flags>;
    distinct(
        field?: ArrayType extends readonly Record<string, unknown>[]
            ? ValidTarget<ArrayType[number], "sort">
            : ArrayType extends readonly unknown[]
            ? ValidTarget<ItemType, "sort"> | SizePropertyPath<ItemType> // Allow size properties on mixed types
            : ValidTarget<ItemType, "sort">
    ): MultiMethodResult<ArrayType, ItemType, AMode, Flags>;

    // Sublens distinct overload
    distinct<SubT = any>(sublensCallback: (sublens: LensBuilderRoot<ItemType>) => FinalizedLens<SubT, any, any>): MultiMethodResult<ArrayType, ItemType, AMode, Flags>;

    // Terminal modifiers - return single CMode collection builders
    at(index: number): SingleMethodResult<ArrayType, ItemType, AMode, Flags>;
    first(): SingleMethodResult<ArrayType, ItemType, AMode, Flags>;
    last(): SingleMethodResult<ArrayType, ItemType, AMode, Flags>;
}

// Legacy aliases for backwards compatibility
export type MultiCollectionLensBuilder<ArrayType, ItemType, AMode extends "single" | "multi", Flags extends string = ""> = CollectionLensBuilder<ArrayType, ItemType, AMode, "multi", Flags>;
export type SingleCollectionLensBuilder<ArrayType, ItemType, AMode extends "single" | "multi", Flags extends string = ""> = CollectionLensBuilder<ArrayType, ItemType, AMode, "single", Flags>;

// Legacy alias for backwards compatibility (using the new interface)
export type LegacyCollectionLensBuilder<ArrayType, ItemType, Flags extends string = ""> = CollectionLensBuilder<ArrayType, ItemType, "multi", "multi", Flags>;

// Export helper types for use in collection builders
export type { KeysOfUnion, SafeUnionAccess, ArrayElement };

// TrhSymbols integration for custom type system
export interface TrhSymbolsIntegration {
    readonly Equals: unique symbol;
    readonly Compare: unique symbol;
    readonly TypeOf: unique symbol;
}

// Update context for operations
export interface UpdateContext<T = any> {
    path: PathStep[];
    query: Query;
    mode: "single" | "multi";
    index?: number;
    totalResults?: number;
    isFirst?: boolean;
    isLast?: boolean;
    array?: T[];
    originalPath: PathStep[];
}

// Evaluation context for AST execution
export interface EvaluationContext {
    data: any;
    currentPath: PathStep[];
    mode: "single" | "multi";
    parentContext?: EvaluationContext;
}

// Collection operation results
export interface CollectionResult<T> {
    items: T[];
    indices: number[];
    originalIndices: number[];
    paths: PathStep[][];
}

// Helper types for predicate path validation
// Arrays, objects, and strings are valid for size() operations
// Handle union types by checking if any member is a collection
type IsCollectionForSize<T> = T extends readonly unknown[] | Record<string, any> | string ? true : false;

// Property path validation - allow properties from any member of union types
type PropertyPath<T> = T extends Record<string, any> ? { [K in KeysOfUnion<T>]: K extends string ? `${typeof CONTEXT_GLYPH}.${K}` : never }[KeysOfUnion<T>] : never;

// Size property path validation - allow size properties from any union member that has them as collections
type SizePropertyPath<T> = {
    [K in KeysOfUnion<T>]: K extends string ? (IsCollectionForSize<SafeUnionAccess<T, K>> extends true ? `size(${typeof CONTEXT_GLYPH}.${K})` : never) : never;
}[KeysOfUnion<T>];

// Unified target validation with context discrimination
export type ValidTarget<T, Context extends "predicate" | "sort" = "predicate"> =
    | `${typeof CONTEXT_GLYPH}` // Current item itself
    | `size(${typeof CONTEXT_GLYPH})` // Size of current item (if it's an array or string)
    | (Context extends "predicate" ? `row(${typeof CONTEXT_GLYPH})` | `index(${typeof CONTEXT_GLYPH})` : never) // Special predicate-only targets
    | (T extends readonly unknown[]
          ? never // Arrays don't have property access
          : PropertyPath<T> | SizePropertyPath<T>) // Property access for non-arrays
    | (Context extends "sort" ? (T extends any ? `size(${typeof CONTEXT_GLYPH}.${Extract<keyof T, string>})` : never) : never); // Sort-specific fallback

// Special predicate target types with validation
export type ValidPredicateTarget<T> = ValidTarget<T, "predicate">;

// Legacy type for backwards compatibility
export type PredicateTarget =
    | `${typeof CONTEXT_GLYPH}` // Current item
    | `${typeof CONTEXT_GLYPH}.${string}` // Property of current item
    | `size(${typeof CONTEXT_GLYPH})` // Size of current item
    | `row(${typeof CONTEXT_GLYPH})` // Original row index
    | `index(${typeof CONTEXT_GLYPH})`; // Current index
