/**
 * Symbol constants used throughout the traversal library
 */

// Context symbol - refers to the current item being processed in predicates and sorts
export const CONTEXT_GLYPH = "@";

export const OPMODS = {
    FIRSTOF: "{",
    LASTOF: "}",
    NEGATE: "!",
    WITHIN: "|",
} as const;

export const OPERATORS = {
    // Base operators
    EQUAL_LOOSE: "=",
    EQUAL_STRICT: "==",

    COMPARE_LT: "<",
    COMPARE_GT: ">",
    COMPARE_LTE: "<=",
    COMPARE_GTE: ">=",

    STR_INCLUDES: "%",
    STR_STARTSWITH: "%_",
    STR_ENDSWITH: "_%",
    STR_INCLUDES_CAP: "%^",
    STR_STARTSWITH_CAP: "%^_",
    STR_ENDSWITH_CAP: "_%^",
    STR_REGEX: "~",

    TYPEOF: ":",
    CONTAINS: "#",
    RANGE_INCLUSIVE: ">=<",
    RANGE_EXCLUSIVE: "><",
} as const;
