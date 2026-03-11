import { PredicateDefinition, SublensPredicateDefinition, SublensSortDefinition, SublensDistinctDefinition, PredicateOperator, TriState, isSentinel, FinalizedLens, Query, LogicExpression, PredicateSpec } from "../types";
import { isLogicExpression, isPredicateSpec } from "./logic";
import { getOperatorProperties } from "./operators";
import { getNestedProperty } from "./typhelpers";

// Type guards for different predicate types
export function isSublensPredicateDefinition(predicate: any): predicate is SublensPredicateDefinition {
    return predicate && typeof predicate === "object" && typeof predicate.sublensCallback === "function" && typeof predicate.operator === "string" && predicate.operand !== undefined;
}

// Type guard for sublens sort definition
export function isSublensSortDefinition(field: any): field is SublensSortDefinition {
    return field && typeof field === "object" && typeof field.sublensCallback === "function";
}

// Type guard for sublens distinct definition
export function isSublensDistinctDefinition(field: any): field is SublensDistinctDefinition {
    return field && typeof field === "object" && typeof field.sublensCallback === "function";
}

export function isPredicateDefinition(predicate: any): predicate is PredicateDefinition {
    return predicate && typeof predicate === "object" && typeof predicate.field === "string" && typeof predicate.operator === "string" && predicate.operand !== undefined && !predicate.sublensCallback && !isLogicExpression(predicate);
}

import { CONTEXT_GLYPH } from "./constants";

// Resolve field value with support for context symbols
export function resolveFieldValue(field: string, item: any, index: number, originalIndex: number, array: any[]): any {
    switch (field) {
        case CONTEXT_GLYPH:
            return item;
        case `size(${CONTEXT_GLYPH})`:
            if (Array.isArray(item)) return item.length;
            if (typeof item === "string") return item.length;
            if (item && typeof item === "object") return Object.keys(item).length;
            return null;
        case `row(${CONTEXT_GLYPH})`:
            return originalIndex;
        case `index(${CONTEXT_GLYPH})`:
            return index;
        default:
            if (field.startsWith(`size(${CONTEXT_GLYPH}.`) && field.endsWith(")")) {
                // Handle size(@.property) syntax
                const propertyPath = field.substring(`size(${CONTEXT_GLYPH}.`.length, field.length - 1); // Remove "size(@." and ")"
                const propertyValue = getNestedProperty(item, propertyPath);
                if (Array.isArray(propertyValue)) return propertyValue.length;
                if (typeof propertyValue === "string") return propertyValue.length;
                if (propertyValue && typeof propertyValue === "object") return Object.keys(propertyValue).length;
                return null;
            }
            if (field.startsWith(`${CONTEXT_GLYPH}.`)) {
                const propertyPath = field.substring(`${CONTEXT_GLYPH}.`.length);
                return getNestedProperty(item, propertyPath);
            }
            throw new Error(`Unknown field context: ${field}`);
    }
}

// Consolidated operator evaluation logic (removes duplication)
function evaluateOperatorLogic(value: any, operator: PredicateOperator, operand: any): TriState {
    const [testFn, isGroup, isNeg] = getOperatorProperties(operator);

    let result: boolean | null;

    if (isGroup) {
        // Group membership - test against array of operands
        if (!Array.isArray(operand)) {
            throw new Error(`Group operator ${operator} requires array operand`);
        }

        result = operand.some((op) => {
            const subResult = testFn(value, op);
            return subResult === true;
        });

        // If any test returned null, the overall result is null
        if (result === false && operand.some((op) => testFn(value, op) === null)) {
            result = null;
        }
    } else {
        // Single operand test
        result = testFn(value, operand);
    }

    // Apply negation if needed
    if (isNeg && result !== null) {
        result = !result;
    }

    return result;
}

// Main predicate evaluation function
export function evaluatePredicate(predicate: PredicateDefinition | SublensPredicateDefinition | LogicExpression, item: any, index: number, originalIndex: number, array: any[]): TriState {
    // If the item is a sentinel, exclude it from predicate evaluation
    if (isSentinel(item)) {
        return false;
    }

    if (isLogicExpression(predicate)) {
        // Handle logic expressions (AND/OR)
        return evaluateLogicExpression(predicate, item, index, originalIndex, array);
    } else if (isSublensPredicateDefinition(predicate)) {
        // For sublens predicates, we need the evaluation function
        // This will be injected to avoid circular dependencies
        return evaluateSublensPredicateWithCallback(predicate, item, index, originalIndex, array, evaluateASTFunction!, createLensBuilderFunction!);
    } else {
        const value = resolveFieldValue(predicate.field, item, index, originalIndex, array);
        return evaluateOperatorLogic(value, predicate.operator, predicate.operand);
    }
}

// Store references to avoid circular imports
let evaluateASTFunction: ((data: any, ast: Query, operation: "get" | "update" | "affects", updateCallback?: any, mode?: "single" | "multi") => any) | null = null;
let createLensBuilderFunction: (() => any) | null = null;
let evaluateTerminalCallFunction: ((item: any, sublens: FinalizedLens<any, any, any>) => any) | null = null;

// Set the function references (called during initialization)
export function setEvaluationFunctions(
    evaluateAST: (data: any, ast: Query, operation: "get" | "update" | "affects", updateCallback?: any, mode?: "single" | "multi") => any,
    createLensBuilder: () => any,
    evaluateTerminalCall: (item: any, sublens: FinalizedLens<any, any, any>) => any
): void {
    evaluateASTFunction = evaluateAST;
    createLensBuilderFunction = createLensBuilder;
    evaluateTerminalCallFunction = evaluateTerminalCall;
}

// Evaluate sublens predicate (extracted to avoid duplication)
function evaluateSublensPredicateWithCallback(
    predicate: SublensPredicateDefinition,
    item: any,
    index: number,
    originalIndex: number,
    array: any[],
    evaluateAST: (data: any, ast: Query, operation: "get" | "update" | "affects", updateCallback?: any, mode?: "single" | "multi") => any,
    createLensBuilder: () => any
): TriState {
    try {
        // Create a lens builder for the current item
        const sublensBuilder = createLensBuilder();

        // Execute the sublens callback to get the finalized lens
        const sublens = predicate.sublensCallback(sublensBuilder);

        // Execute the sublens on the current item to get the value
        let sublensValue: any;
        if (sublens.terminalCall) {
            // Handle terminal calls (.count(), .size(), .exists())
            sublensValue = evaluateTerminalCallFunction!(item, sublens);
        } else {
            // Regular sublens evaluation - use the hierarchical evaluation engine
            // IMPORTANT: Pass the sublens mode to ensure correct single/multi mode evaluation
            sublensValue = evaluateAST(item, sublens.query, "get", undefined, sublens.mode);
        }

        // Apply the operator to compare sublens result with operand
        return evaluateOperatorLogic(sublensValue, predicate.operator, predicate.operand);
    } catch (error) {
        // If sublens evaluation fails, exclude the item
        return null;
    }
}

// Evaluate logic expressions (AND/OR/XOR/NOT)
function evaluateLogicExpression(logicExpression: LogicExpression, item: any, index: number, originalIndex: number, array: any[]): TriState {
    const { type, predicates } = logicExpression;
    
    // Helper function to evaluate a single predicate
    function evaluateSinglePredicate(predicate: PredicateSpec | LogicExpression): TriState {
        if (isLogicExpression(predicate)) {
            // Recursively evaluate nested logic expressions
            return evaluateLogicExpression(predicate, item, index, originalIndex, array);
        } else if (isPredicateSpec(predicate)) {
            // Handle predicate spec [field, operator, operand] or [sublensCallback, operator, operand]
            const [fieldOrCallback, operator, operand] = predicate;
            
            if (typeof fieldOrCallback === "string") {
                // Field predicate
                const predicateDefinition: PredicateDefinition = {
                    field: fieldOrCallback,
                    operator,
                    operand
                };
                return evaluatePredicate(predicateDefinition, item, index, originalIndex, array);
            } else {
                // Sublens predicate
                const sublensPredicateDefinition: SublensPredicateDefinition = {
                    sublensCallback: fieldOrCallback,
                    operator,
                    operand
                };
                return evaluatePredicate(sublensPredicateDefinition, item, index, originalIndex, array);
            }
        } else {
            // Invalid predicate type
            return null;
        }
    }
    
    // Handle different logic types
    switch (type) {
        case "and": {
            // AND: all must be true
            for (const predicate of predicates) {
                const result = evaluateSinglePredicate(predicate);
                if (result === false || result === null) {
                    return result;
                }
            }
            return true;
        }
        
        case "or": {
            // OR: at least one must be true
            for (const predicate of predicates) {
                const result = evaluateSinglePredicate(predicate);
                if (result === true) {
                    return true;
                }
            }
            return false;
        }
        
        case "xor": {
            // XOR: exactly one must be true
            let trueCount = 0;
            for (const predicate of predicates) {
                const result = evaluateSinglePredicate(predicate);
                if (result === true) {
                    trueCount++;
                    if (trueCount > 1) {
                        return false; // More than one is true
                    }
                }
            }
            return trueCount === 1;
        }
        
        case "not-and": {
            // NOT-AND (NAND): not all are true
            for (const predicate of predicates) {
                const result = evaluateSinglePredicate(predicate);
                if (result === false || result === null) {
                    return true; // At least one is false, so NOT-AND is true
                }
            }
            return false; // All are true, so NOT-AND is false
        }
        
        case "not-or": {
            // NOT-OR (NOR): none are true
            for (const predicate of predicates) {
                const result = evaluateSinglePredicate(predicate);
                if (result === true) {
                    return false; // At least one is true, so NOT-OR is false
                }
            }
            return true; // None are true, so NOT-OR is true
        }
        
        case "not-xor": {
            // NOT-XOR: not exactly one is true (either none or more than one)
            let trueCount = 0;
            for (const predicate of predicates) {
                const result = evaluateSinglePredicate(predicate);
                if (result === true) {
                    trueCount++;
                }
            }
            return trueCount !== 1;
        }
        
        default:
            // Should never reach here
            return null;
    }
}

// Evaluate terminal calls on a specific item
export function evaluateTerminalCallOnItem(item: any, sublens: FinalizedLens<any, any, any>): any {
    if (!sublens.terminalCall) {
        throw new Error("No terminal call to evaluate");
    }

    // First evaluate the base query to get the target data
    let targetData: any;
    if (!evaluateASTFunction) {
        throw new Error("evaluateAST function not set - this is an internal error");
    }

    targetData = evaluateASTFunction(item, sublens.query, "get", undefined, sublens.mode);

    // Apply the terminal call logic
    switch (sublens.terminalCall.type) {
        case "count":
            // count() returns the number of items in multi-mode result
            if (Array.isArray(targetData)) {
                return targetData.length;
            } else if (isSentinel(targetData)) {
                // Sentinel means the path was broken, so count is 0
                return 0;
            } else {
                // Single items count as 1
                return 1;
            }

        case "size":
            // size() returns the length of the single-mode result
            if (isSentinel(targetData)) {
                return undefined;
            }
            if (Array.isArray(targetData)) {
                return targetData.length;
            } else if (typeof targetData === "string") {
                return targetData.length;
            } else if (targetData && typeof targetData === "object") {
                return Object.keys(targetData).length;
            } else {
                return undefined;
            }

        case "exists":
            // exists() returns true if the path exists in the data structure
            // For sublens predicates, we check if the evaluation produced a meaningful result
            if (Array.isArray(targetData)) {
                return targetData.length > 0;
            } else {
                return !isSentinel(targetData) && targetData !== undefined;
            }

        default:
            throw new Error(`Unknown terminal call type: ${sublens.terminalCall.type}`);
    }
}
