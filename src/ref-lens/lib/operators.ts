import { TrhSymbols } from "@trh/symbols";
import { BaseOps, PredicateOperator } from "../types";
import { OPERATORS, OPMODS } from "./constants";
import { typeOf } from "./typhelpers";

// Static Intl.Collator for natural comparison (handles numeric strings naturally)
const naturalCollator = new Intl.Collator(undefined, {
    numeric: true, // Enable numeric sorting for embedded numbers
    sensitivity: "base", // Case-insensitive comparison
});

// Check if a value is meaningfully comparable (string, number, or bigint only)
function isComparableType(value: any): boolean {
    const type = typeof value;
    return type === "string" || type === "number" || type === "bigint";
    // Explicitly excludes: null, undefined, objects, arrays, functions, symbols, etc.
}

// Unified comparison function with symmetric TrhSymbols support
function performComparison(value: any, operand: any): number | null {
    // 1. Left-side precedence for TrhSymbols.Compare
    if (value && typeof value[TrhSymbols.Compare] === "function") {
        const result = value[TrhSymbols.Compare](operand);
        if (result !== null) return result;
    }

    // 2. Right-side precedence if left-side doesn't implement or returns null
    if (operand && typeof operand[TrhSymbols.Compare] === "function") {
        const result = operand[TrhSymbols.Compare](value);
        if (result !== null) return -result; // Flip sign since args are swapped
    }

    // 3. Only proceed with natural comparison for meaningful types
    if (!isComparableType(value) || !isComparableType(operand)) {
        return null; // Cannot meaningfully compare these types
    }

    // 4. Fall back to natural collator for string/number/bigint
    return naturalCollator.compare(String(value), String(operand));
}

// Unified equality function with symmetric TrhSymbols support
function performEquality(value: any, operand: any): boolean | null {
    // 1. Left-side precedence for TrhSymbols.Equals
    if (value && typeof value[TrhSymbols.Equals] === "function") {
        const result = value[TrhSymbols.Equals](operand);
        if (result !== null) return result;
    }

    // 2. Right-side precedence if left-side doesn't implement or returns null
    if (operand && typeof operand[TrhSymbols.Equals] === "function") {
        const result = operand[TrhSymbols.Equals](value);
        if (result !== null) return result; // No flip needed for equality
    }

    // 3. fallback to default JS behaviour
    return value == operand;
}

// Convert value to string for string operations, return null if not meaningful
export function convertToString(value: any): string | null {
    if (value === null || value === undefined) return null;

    switch (typeof value) {
        case "string":
            return value;
        case "number":
        case "bigint":
            return value.toString();
        case "boolean":
            return null; // Exclude booleans per design requirements
        case "object":
            if (Array.isArray(value)) return null; // Exclude arrays

            // Check for custom toString
            if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
                return value.toString();
            }
            return null; // Exclude objects with default toString
        default:
            return null;
    }
}

// OPERATOR_FUNCTIONS with enforced implementation for all BaseOps
// This pattern ensures compile-time safety when adding new operators
export const OPERATOR_FUNCTIONS: { [key in BaseOps]: (value: any, operand: any) => boolean | null } = {
    [OPERATORS.EQUAL_LOOSE]: (value, operand) => {
        return performEquality(value, operand);
    },

    [OPERATORS.EQUAL_STRICT]: (value, operand) => {
        return value === operand;
    },

    [OPERATORS.COMPARE_GT]: (value, operand) => {
        const cmp = performComparison(value, operand);
        return cmp === null ? null : cmp > 0;
    },

    [OPERATORS.COMPARE_GTE]: (value, operand) => {
        const cmp = performComparison(value, operand);
        return cmp === null ? null : cmp >= 0;
    },

    [OPERATORS.COMPARE_LTE]: (value, operand) => {
        const cmp = performComparison(value, operand);
        return cmp === null ? null : cmp <= 0;
    },

    [OPERATORS.COMPARE_LT]: (value, operand) => {
        const cmp = performComparison(value, operand);
        return cmp === null ? null : cmp < 0;
    },

    [OPERATORS.STR_INCLUDES]: (value, operand) => {
        // Case insensitive contains
        const valueStr = convertToString(value);
        const operandStr = convertToString(operand);
        if (valueStr === null || operandStr === null) return null;

        return valueStr.toLowerCase().includes(operandStr.toLowerCase());
    },

    [OPERATORS.STR_STARTSWITH]: (value, operand) => {
        // Case insensitive starts with
        const valueStr = convertToString(value);
        const operandStr = convertToString(operand);
        if (valueStr === null || operandStr === null) return null;

        return valueStr.toLowerCase().startsWith(operandStr.toLowerCase());
    },

    [OPERATORS.STR_ENDSWITH]: (value, operand) => {
        // Case insensitive ends with
        const valueStr = convertToString(value);
        const operandStr = convertToString(operand);
        if (valueStr === null || operandStr === null) return null;

        return valueStr.toLowerCase().endsWith(operandStr.toLowerCase());
    },

    [OPERATORS.STR_INCLUDES_CAP]: (value, operand) => {
        // Case sensitive contains
        const valueStr = convertToString(value);
        const operandStr = convertToString(operand);
        if (valueStr === null || operandStr === null) return null;

        return valueStr.includes(operandStr);
    },

    [OPERATORS.STR_STARTSWITH_CAP]: (value, operand) => {
        // Case sensitive starts with
        const valueStr = convertToString(value);
        const operandStr = convertToString(operand);
        if (valueStr === null || operandStr === null) return null;

        return valueStr.startsWith(operandStr);
    },

    [OPERATORS.STR_ENDSWITH_CAP]: (value, operand) => {
        // Case sensitive ends with
        const valueStr = convertToString(value);
        const operandStr = convertToString(operand);
        if (valueStr === null || operandStr === null) return null;

        return valueStr.endsWith(operandStr);
    },

    [OPERATORS.STR_REGEX]: (value, operand) => {
        // Regex match
        const valueStr = convertToString(value);
        if (valueStr === null) return null;

        try {
            const regex = operand instanceof RegExp ? operand : new RegExp(operand);
            return regex.test(valueStr);
        } catch {
            return null; // Invalid regex
        }
    },

    [OPERATORS.TYPEOF]: (value, operand) => {
        // Type check
        const valueType = getValueType(value);
        return valueType.startsWith(operand);
    },

    [OPERATORS.RANGE_INCLUSIVE]: (value, operand) => {
        // Inclusive range
        if (!Array.isArray(operand) || operand.length !== 2) return null;
        const [a, b] = operand;

        // Determine which is lower and which is upper by comparing a and b directly
        const aToBCmp = performComparison(a, b);
        if (aToBCmp === null) return null;

        const [lower, upper] = aToBCmp <= 0 ? [a, b] : [b, a];
        const lowerResult = performComparison(value, lower);
        const upperResult = performComparison(value, upper);

        if (lowerResult === null || upperResult === null) return null;
        return lowerResult >= 0 && upperResult <= 0;
    },

    [OPERATORS.RANGE_EXCLUSIVE]: (value, operand) => {
        // Exclusive range
        if (!Array.isArray(operand) || operand.length !== 2) return null;
        const [a, b] = operand;

        // Determine which is lower and which is upper by comparing a and b directly
        const aToBCmp = performComparison(a, b);
        if (aToBCmp === null) return null;

        const [lower, upper] = aToBCmp <= 0 ? [a, b] : [b, a];
        const lowerResult = performComparison(value, lower);
        const upperResult = performComparison(value, upper);

        if (lowerResult === null || upperResult === null) return null;
        return lowerResult > 0 && upperResult < 0;
    },

    [OPERATORS.CONTAINS]: (value, operand) => {
        // Array contains
        if (!Array.isArray(value)) return null;
        return value.includes(operand);
    },
};

// Get type of value using custom type detection chain
function getValueType(value: any): string {
    // Use custom TypeOf symbol if available
    if (value && typeof value[TrhSymbols.TypeOf] === "function") {
        return value[TrhSymbols.TypeOf]();
    }

    // Defer to typeOf function from type-utils
    // We'll import this to avoid circular dependency
    return typeOf(value);
}

const OPERATOR_PARSER_REGEX = new RegExp(`[\\${OPMODS.FIRSTOF}\\${OPMODS.LASTOF}\\${OPMODS.WITHIN}\\${OPMODS.NEGATE}]`, "g");

export function getOperatorProperties(operator: PredicateOperator): [(value: any, operand: any) => boolean | null, boolean, boolean, boolean, boolean] {
    const baseOp = operator.replace(OPERATOR_PARSER_REGEX, "");
    const isFirstOf = operator.startsWith(OPMODS.FIRSTOF);
    const isLastOf = operator.endsWith(OPMODS.LASTOF);

    const isNegation = operator.includes(OPMODS.NEGATE);
    const isGroup = operator.includes(OPMODS.WITHIN);

    const testFunction = OPERATOR_FUNCTIONS[baseOp as BaseOps];

    // Validate that the operator exists
    if (!testFunction) {
        const validOperators = Object.keys(OPERATOR_FUNCTIONS).join(", ");
        throw new Error(`Unknown operator: "${operator}". Base operator "${baseOp}" not found. Valid base operators are: ${validOperators}`);
    }

    return [testFunction, isGroup, isNegation, isFirstOf, isLastOf];
}
