import {
    Query,
    ASTNode,
    PropertyAccessNode,
    IndexAccessNode,
    WildcardAccessNode,
    CollectionModifierChainNode,
    GatherNode,
    CollectionModifier,
    PathStep,
    EvaluationContext,
    CollectionResult,
    UNDEFINED_SENTINEL,
    UNDEFINED_PLACEHOLDER,
    hasProperty,
    isSentinel,
    LogicExpression,
} from "../types";
import { isLogicExpression } from "./logic";
import { CONTEXT_GLYPH } from "./constants";
import { evaluatePredicate, isSublensSortDefinition, evaluateTerminalCallOnItem, setEvaluationFunctions } from "./predicates";
import { createLensBuilder } from "./ast";
import { TrhSymbols } from "@trh/symbols";

// Static Intl.Collator for natural string sorting (handles numeric strings naturally)
// This collator will sort "item2" before "item10" correctly
const naturalCollator = new Intl.Collator(undefined, {
    numeric: true, // Enable numeric sorting for embedded numbers
    sensitivity: "base", // Case-insensitive comparison
});

// Helper function to check if an AST node chain contains wildcards or collection chains
function containsWildcardOrCollection(node: ASTNode | undefined): boolean {
    if (!node) return false;

    if (node.type === "wildcard" || node.type === "collection-chain" || node.type === "gather") {
        return true;
    }

    // Recursively check child nodes
    return containsWildcardOrCollection(node.child);
}

/**
 * Hierarchical AST Evaluation Engine
 *
 * This engine respects scope boundaries and maintains the natural data structure hierarchy.
 * It implements the core principle that collection modifiers operate only within their
 * current scope and never affect data at parent or child levels.
 */

// Main evaluation function that handles both get and update operations
export function evaluateAST(data: any, ast: Query, operation: "get" | "update" | "affects", updateCallback?: (value: any, context: EvaluationContext) => any, mode?: "single" | "multi"): any {
    if (ast === null) {
        // Terminal case - return the current data
        return operation === "get" ? data : data;
    }

    const context: EvaluationContext = {
        data,
        currentPath: [],
        mode: mode || "single",
        parentContext: undefined,
    };

    return evaluateNode(data, ast, context, operation, updateCallback, mode);
}

// Set up the function references to avoid circular import issues
setEvaluationFunctions(evaluateAST, createLensBuilder, evaluateTerminalCallOnItem);

// Recursive node evaluation that maintains hierarchical execution contexts
function evaluateNode(
    currentData: any,
    node: ASTNode,
    context: EvaluationContext,
    operation: "get" | "update" | "affects",
    updateCallback?: (value: any, context: EvaluationContext) => any,
    topLevelMode?: "single" | "multi"
): any {
    // Handle sentinel propagation - but allow wildcards, collection-chains, and collections to handle sentinels specially
    if (isSentinel(currentData) && node.type !== "wildcard" && node.type !== "collection-chain" && node.type !== "gather") {
        return currentData;
    }

    switch (node.type) {
        case "property":
            return evaluatePropertyAccess(currentData, node, context, operation, updateCallback, topLevelMode);
        case "index":
            return evaluateIndexAccess(currentData, node, context, operation, updateCallback, topLevelMode);
        case "wildcard":
            return evaluateWildcardAccess(currentData, node, context, operation, updateCallback, topLevelMode);
        case "collection-chain":
            return evaluateCollectionChain(currentData, node, context, operation, updateCallback, topLevelMode);
        case "gather":
            return evaluateGather(currentData, node, context, operation, updateCallback, topLevelMode);
        default:
            throw new Error(`Unknown node type: ${(node as any).type}`);
    }
}

// Property access evaluation with sentinel handling
function evaluatePropertyAccess(
    currentData: any,
    node: PropertyAccessNode,
    context: EvaluationContext,
    operation: "get" | "update" | "affects",
    updateCallback?: (value: any, context: EvaluationContext) => any,
    topLevelMode?: "single" | "multi"
): any {
    if (currentData === null || currentData === undefined) {
        return UNDEFINED_SENTINEL;
    }

    const hasProperty = Object.prototype.hasOwnProperty.call(currentData, node.property);
    const value = hasProperty ? currentData[node.property] : UNDEFINED_SENTINEL;

    const newPath = [...context.currentPath, node.property];
    const childContext: EvaluationContext = {
        ...context,
        currentPath: newPath,
        parentContext: context,
    };

    if (node.child) {
        return evaluateNode(value, node.child, childContext, operation, updateCallback, topLevelMode);
    } else {
        // Terminal property access
        if (operation === "get") {
            // In multi-mode contexts, preserve sentinels so they can be filtered out by parent operations
            // Only convert to undefined in single-mode contexts
            if (context.mode === "multi" && isSentinel(value)) {
                return value; // Return sentinel to be filtered by parent wildcard/collection
            }
            return isSentinel(value) ? undefined : value;
        } else if (operation === "update" && updateCallback) {
            if (isSentinel(value)) {
                // Handle optional property creation - but only on objects that can have properties
                if (currentData !== null && typeof currentData === "object") {
                    const newValue = updateCallback(undefined, childContext);
                    currentData[node.property] = newValue;
                    return newValue;
                } else {
                    // Can't create properties on primitives - skip this update
                    return UNDEFINED_SENTINEL;
                }
            } else {
                const newValue = updateCallback(value, childContext);
                currentData[node.property] = newValue;
                return newValue;
            }
        } else if (operation === "affects") {
            return [newPath];
        }
    }

    return value;
}

// Index access evaluation with bounds checking
function evaluateIndexAccess(
    currentData: any,
    node: IndexAccessNode,
    context: EvaluationContext,
    operation: "get" | "update" | "affects",
    updateCallback?: (value: any, context: EvaluationContext) => any,
    topLevelMode?: "single" | "multi"
): any {
    if (!Array.isArray(currentData)) {
        return UNDEFINED_SENTINEL;
    }

    const normalizedIndex = normalizeArrayIndex(node.index, currentData.length);
    if (normalizedIndex < 0 || normalizedIndex >= currentData.length) {
        return UNDEFINED_SENTINEL;
    }

    const value = currentData[normalizedIndex];
    const newPath = [...context.currentPath, normalizedIndex];
    const childContext: EvaluationContext = {
        ...context,
        currentPath: newPath,
        parentContext: context,
    };

    if (node.child) {
        return evaluateNode(value, node.child, childContext, operation, updateCallback, topLevelMode);
    } else {
        // Terminal index access
        if (operation === "get") {
            // In multi-mode contexts, preserve sentinels so they can be filtered out by parent operations
            // Only convert to undefined in single-mode contexts
            if (context.mode === "multi" && isSentinel(value)) {
                return value; // Return sentinel to be filtered by parent wildcard/collection
            }
            return isSentinel(value) ? undefined : value;
        } else if (operation === "update" && updateCallback) {
            const newValue = updateCallback(value, childContext);
            currentData[normalizedIndex] = newValue;
            return newValue;
        } else if (operation === "affects") {
            return [newPath];
        }
    }

    return value;
}

// Wildcard access evaluation - transitions to multi mode
function evaluateWildcardAccess(
    currentData: any,
    node: WildcardAccessNode,
    context: EvaluationContext,
    operation: "get" | "update" | "affects",
    updateCallback?: (value: any, context: EvaluationContext) => any,
    topLevelMode?: "single" | "multi"
): any {
    // Handle sentinel input (from broken property access)
    if (isSentinel(currentData)) {
        if (operation === "get" && !node.child) {
            return []; // Terminal wildcard on sentinel returns empty array
        }
        return UNDEFINED_SENTINEL;
    }

    if (!Array.isArray(currentData)) {
        // Check if this is an object with a literal "*" property
        if (currentData !== null && typeof currentData === "object" && hasProperty(currentData, "*")) {
            // Treat as property access to literal "*" key
            const value = currentData["*"];
            if (node.child) {
                const childContext: EvaluationContext = {
                    ...context,
                    currentPath: [...context.currentPath, "*"],
                    mode: context.mode, // Preserve mode for property access
                };
                return evaluateNode(value, node.child, childContext, operation, updateCallback, topLevelMode);
            } else {
                // Terminal property access
                return value;
            }
        }

        // No literal "*" property - treat as failed wildcard
        // For terminal wildcards and multi-mode operations, return empty array
        // For single-mode operations with children, return UNDEFINED_SENTINEL
        if (operation === "get" && !node.child) {
            return []; // Terminal wildcard on non-array returns empty array
        }
        return UNDEFINED_SENTINEL;
    }

    const results: any[] = [];
    const paths: PathStep[][] = [];

    // Multi-mode context for all child evaluations
    const multiContext: EvaluationContext = {
        ...context,
        mode: "multi",
        parentContext: context,
    };

    for (let i = 0; i < currentData.length; i++) {
        const item = currentData[i];
        const itemPath = [...context.currentPath, i];
        const itemContext: EvaluationContext = {
            ...multiContext,
            currentPath: itemPath,
        };

        if (node.child) {
            const result = evaluateNode(item, node.child, itemContext, operation, updateCallback, topLevelMode);

            // Handle different result types from child evaluation
            if (operation === "affects" && Array.isArray(result)) {
                paths.push(...result);
            } else if (operation === "get") {
                // Filter out sentinels for wildcard operations - broken paths should be excluded entirely
                if (!isSentinel(result)) {
                    if (Array.isArray(result) && multiContext.mode === "multi" && containsWildcardOrCollection(node.child)) {
                        // Flatten arrays from child wildcards/collections, but exclude sentinels
                        results.push(...result.filter((item) => !isSentinel(item)));
                    } else {
                        // Non-array result - include only if not sentinel
                        results.push(result);
                    }
                }
            } else {
                // Update/other operations - include all results
                results.push(result);
            }
        } else {
            // Terminal wildcard
            if (operation === "get") {
                // For terminal wildcards, exclude sentinels entirely
                if (!isSentinel(item)) {
                    results.push(item);
                }
            } else if (operation === "update" && updateCallback) {
                const newValue = updateCallback(item, itemContext);
                currentData[i] = newValue;
                results.push(newValue);
            } else if (operation === "affects") {
                paths.push(itemPath);
            }
        }
    }

    return operation === "affects" ? paths : results;
}

// Collection chain evaluation - implements Virtual Accessor semantics
function evaluateCollectionChain(
    currentData: any,
    node: CollectionModifierChainNode,
    context: EvaluationContext,
    operation: "get" | "update" | "affects",
    updateCallback?: (value: any, context: EvaluationContext) => any,
    topLevelMode?: "single" | "multi"
): any {
    // Handle sentinel input (from broken property access)
    if (isSentinel(currentData)) {
        // Check if this is a single-mode collection (like .at(), .first())
        const finalModifier = node.modifiers[node.modifiers.length - 1];
        const isSingleModeModifier =
            finalModifier &&
            (finalModifier.type === "at" ||
                (finalModifier.type === "where" &&
                    typeof finalModifier.predicate === "object" &&
                    "operator" in finalModifier.predicate &&
                    (finalModifier.predicate.operator.startsWith("{") || finalModifier.predicate.operator.endsWith("}"))));

        if (operation === "get") {
            if (isSingleModeModifier) {
                return UNDEFINED_SENTINEL; // Single-mode collections return sentinel for broken paths
            } else {
                return []; // Multi-mode collections return empty array
            }
        }
        return UNDEFINED_SENTINEL;
    }

    if (!Array.isArray(currentData)) {
        // Check if this is a single-mode collection (like .at(), .first())
        const finalModifier = node.modifiers[node.modifiers.length - 1];
        const isSingleModeModifier =
            finalModifier &&
            (finalModifier.type === "at" ||
                (finalModifier.type === "where" &&
                    typeof finalModifier.predicate === "object" &&
                    "operator" in finalModifier.predicate &&
                    (finalModifier.predicate.operator.startsWith("{") || finalModifier.predicate.operator.endsWith("}"))));

        if (operation === "get") {
            if (isSingleModeModifier) {
                return UNDEFINED_SENTINEL; // Single-mode collections return sentinel for broken paths
            } else {
                return []; // Multi-mode collections return empty array
            }
        }
        return UNDEFINED_SENTINEL;
    }

    // Execute collection modifiers in sequence to create virtual selection
    const collectionResult = executeCollectionModifiers(currentData, node.modifiers);

    if (node.child) {
        // Continue evaluation with the filtered/modified collection
        const results: any[] = [];
        const paths: PathStep[][] = [];

        for (let i = 0; i < collectionResult.items.length; i++) {
            const item = collectionResult.items[i];
            const originalIndex = collectionResult.originalIndices[i];
            const itemPath = [...context.currentPath, originalIndex];

            const itemContext: EvaluationContext = {
                ...context,
                currentPath: itemPath,
                mode: context.mode, // Preserve parent context mode
            };

            const result = evaluateNode(item, node.child, itemContext, operation, updateCallback, topLevelMode);

            // Handle different result types from child evaluation
            if (operation === "affects" && Array.isArray(result)) {
                paths.push(...result);
            } else if (operation === "get") {
                if (Array.isArray(result) && context.mode === "multi" && containsWildcardOrCollection(node.child)) {
                    // Flatten arrays from child wildcards/collections, preserving sentinels for later filtering
                    results.push(...result);
                } else {
                    // Non-array result or property array - include all results (sentinels will be filtered by collection modifiers)
                    results.push(result);
                }
            } else {
                // Update/other operations - include all results
                results.push(result);
            }
        }

        // Check if this is a single-mode collection based on the final modifier
        const finalModifier = node.modifiers[node.modifiers.length - 1];
        const isSingleModeModifier =
            finalModifier &&
            (finalModifier.type === "at" ||
                (finalModifier.type === "where" &&
                    typeof finalModifier.predicate === "object" &&
                    "operator" in finalModifier.predicate &&
                    (finalModifier.predicate.operator.startsWith("{") || finalModifier.predicate.operator.endsWith("}"))));

        if (operation === "affects") {
            return paths;
        } else {
            // Return single item for single mode collections, but only if we're in single-mode context
            // In multi-mode context (from parent wildcards), always return arrays to maintain proper flattening
            if (isSingleModeModifier && (topLevelMode === "single" || context.mode === "single")) {
                return results[0];
            }
            return results;
        }
    } else {
        // Terminal collection chain
        if (operation === "get") {
            // Don't convert sentinels here - let the get() function handle it at the API boundary
            const items = collectionResult.items;
            // Check if this is a single-mode collection based on the final modifier
            const finalModifier = node.modifiers[node.modifiers.length - 1];
            const isSingleModeModifier =
                finalModifier &&
                (finalModifier.type === "at" ||
                    (finalModifier.type === "where" &&
                        typeof finalModifier.predicate === "object" &&
                        "operator" in finalModifier.predicate &&
                        (finalModifier.predicate.operator.startsWith("{") || finalModifier.predicate.operator.endsWith("}"))));

            // Return single item for single mode collections, but only if we're in single-mode context
            // In multi-mode context (from parent wildcards), always return arrays to maintain proper flattening
            if (isSingleModeModifier && (topLevelMode === "single" || context.mode === "single")) {
                return items[0];
            }
            return items;
        } else if (operation === "update" && updateCallback) {
            const results: any[] = [];

            for (let i = 0; i < collectionResult.items.length; i++) {
                const item = collectionResult.items[i];
                const originalIndex = collectionResult.originalIndices[i];
                const itemPath = [...context.currentPath, originalIndex];

                const itemContext: EvaluationContext = {
                    ...context,
                    currentPath: itemPath,
                    mode: context.mode,
                };

                const newValue = updateCallback(item, itemContext);
                currentData[originalIndex] = newValue;
                results.push(newValue);
            }

            return results;
        } else if (operation === "affects") {
            return collectionResult.originalIndices.map((index) => [...context.currentPath, index]);
        }
    }

    return collectionResult.items;
}

// Collection evaluation - flattens hierarchical results across scope boundaries
function evaluateGather(
    currentData: any,
    node: GatherNode,
    context: EvaluationContext,
    operation: "get" | "update" | "affects",
    updateCallback?: (value: any, context: EvaluationContext) => any,
    topLevelMode?: "single" | "multi"
): any {
    // Handle sentinel propagation - gather always returns arrays, so convert sentinel to empty array
    if (isSentinel(currentData)) {
        return [];
    }

    // Create a sublens builder for the callback
    const sublensBuilder = createLensBuilder();

    // Execute the sublens callback to get the finalized lens
    const sublens = node.sublensCallback(sublensBuilder);

    // Execute the sublens on the current data to get hierarchical results
    const sublensResult = evaluateAST(currentData, sublens.query, operation, updateCallback, sublens.mode);

    // Handle collection results based on sublens mode
    let flattenedResult: any[];
    if (isSentinel(sublensResult)) {
        // If sublens evaluation failed, return empty array
        flattenedResult = [];
    } else if (sublens.mode === "single") {
        // For single-mode sublens, always wrap the result (even if it's already an array)
        flattenedResult = [sublensResult];
    } else {
        // For multi-mode sublens, the result should already be an array
        flattenedResult = Array.isArray(sublensResult) ? sublensResult : [sublensResult];
    }

    // Continue evaluation with child node if present
    if (node.child) {
        // The gathered result becomes the new context, and we're now in multi-mode
        const newContext: EvaluationContext = {
            ...context,
            data: flattenedResult,
            mode: "multi",
        };

        return evaluateNode(flattenedResult, node.child, newContext, operation, updateCallback, topLevelMode);
    }

    return flattenedResult;
}

// Execute collection modifiers while maintaining original index tracking
function executeCollectionModifiers(data: any[], modifiers: CollectionModifier[]): CollectionResult<any> {
    let items = [...data];
    let indices = data.map((_, i) => i);
    let originalIndices = data.map((_, i) => i);

    for (const modifier of modifiers) {
        const result = executeCollectionModifier(items, indices, originalIndices, modifier);
        items = result.items;
        indices = result.indices;
        originalIndices = result.originalIndices;
    }

    return {
        items,
        indices,
        originalIndices,
        paths: originalIndices.map((index) => [index]),
    };
}

// Execute individual collection modifier
function executeCollectionModifier(items: any[], indices: number[], originalIndices: number[], modifier: CollectionModifier): CollectionResult<any> {
    switch (modifier.type) {
        case "where":
            return executeWhereModifier(items, indices, originalIndices, modifier);
        case "sort":
            return executeSortModifier(items, indices, originalIndices, modifier);
        case "slice":
            return executeSliceModifier(items, indices, originalIndices, modifier);
        case "at":
            return executeAtModifier(items, indices, originalIndices, modifier);
        case "reverse":
            return executeReverseModifier(items, indices, originalIndices);
        case "distinct":
            return executeDistinctModifier(items, indices, originalIndices, modifier);
        default:
            throw new Error(`Unknown modifier type: ${(modifier as any).type}`);
    }
}

// Individual modifier implementations

function executeWhereModifier(items: any[], indices: number[], originalIndices: number[], modifier: any): CollectionResult<any> {
    // Check if this is a directional operator that requires special handling
    let isDirectional = false;
    let isFirstOnly = false;
    let isLastOnly = false;

    // LogicExpression is never directional - it always uses multi-mode
    if (!isLogicExpression(modifier.predicate) && typeof modifier.predicate === "object" && "operator" in modifier.predicate) {
        const operator = modifier.predicate.operator;
        isFirstOnly = operator.startsWith("{");
        isLastOnly = operator.endsWith("}");
        isDirectional = isFirstOnly || isLastOnly;
    }

    if (isDirectional) {
        // For directional operators, find the first or last match
        const matchingIndices: number[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const index = indices[i];
            const originalIndex = originalIndices[i];

            let matches = false;
            if (typeof modifier.predicate === "function") {
                matches = modifier.predicate(item);
            } else {
                const result = evaluatePredicate(modifier.predicate, item, index, originalIndex, items);
                matches = result === true;
            }

            if (matches) {
                matchingIndices.push(i);
            }
        }

        // Return first or last match only
        if (matchingIndices.length === 0) {
            return { items: [], indices: [], originalIndices: [], paths: [] };
        }

        const targetIndex = isFirstOnly ? matchingIndices[0] : matchingIndices[matchingIndices.length - 1];
        return {
            items: [items[targetIndex]],
            indices: [indices[targetIndex]],
            originalIndices: [originalIndices[targetIndex]],
            paths: [],
        };
    } else {
        // Non-directional - collect all matches
        const filteredItems: any[] = [];
        const filteredIndices: number[] = [];
        const filteredOriginalIndices: number[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const index = indices[i];
            const originalIndex = originalIndices[i];

            let matches = false;

            if (typeof modifier.predicate === "function") {
                // Callback predicate
                matches = modifier.predicate(item);
            } else {
                // Predicate definition with field/operator/operand
                const result = evaluatePredicate(modifier.predicate, item, index, originalIndex, items);
                matches = result === true;
            }

            if (matches) {
                filteredItems.push(item);
                filteredIndices.push(filteredItems.length - 1); // Use new current index position (0-based)
                filteredOriginalIndices.push(originalIndex);
            }
        }

        return {
            items: filteredItems,
            indices: filteredIndices,
            originalIndices: filteredOriginalIndices,
            paths: [],
        };
    }
}

function executeSortModifier(items: any[], indices: number[], originalIndices: number[], modifier: any): CollectionResult<any> {
    const { field, config } = modifier;

    // Create array of items with metadata for sorting
    const itemsWithMetadata = items.map((item, i) => ({
        item,
        index: indices[i],
        originalIndex: originalIndices[i],
        sortValue: resolveSortFieldValue(field, item, indices[i], originalIndices[i], items),
    }));

    // Handle undefined values with UNDEFINED_PLACEHOLDER if needed
    const needsPlaceholderHandling = config?.nullish === "first" && itemsWithMetadata.some((meta) => meta.sortValue === undefined);

    if (needsPlaceholderHandling) {
        // Replace undefined with UNDEFINED_PLACEHOLDER for proper sorting
        itemsWithMetadata.forEach((meta) => {
            if (meta.sortValue === undefined) {
                meta.sortValue = UNDEFINED_PLACEHOLDER;
            }
        });
    }

    // Sort the items using our comprehensive comparison strategy
    itemsWithMetadata.sort((a, b) => {
        const comparison = compareValues(a.sortValue, b.sortValue, config?.nullish, config?.direction);
        // Use original index as tiebreaker for stable sorting
        if (comparison === 0) {
            return a.originalIndex - b.originalIndex;
        }
        return comparison;
    });

    // Restore undefined values if we used placeholders
    if (needsPlaceholderHandling) {
        itemsWithMetadata.forEach((meta) => {
            if (meta.sortValue === UNDEFINED_PLACEHOLDER) {
                meta.sortValue = undefined;
            }
        });
    }

    return {
        items: itemsWithMetadata.map((meta) => meta.item),
        indices: itemsWithMetadata.map((_, i) => i), // New current positions after sorting
        originalIndices: itemsWithMetadata.map((meta) => meta.originalIndex),
        paths: [],
    };
}

// Helper function to resolve sort field values including special cases and sublens
function resolveSortFieldValue(field: string | any, item: any, index: number, originalIndex: number, array: any[]): any {
    // Handle sublens sort definition
    if (isSublensSortDefinition(field)) {
        try {
            // Create a lens builder for the current item
            const sublensBuilder = createLensBuilder();

            // Execute the sublens callback to get the finalized lens
            const sublens = field.sublensCallback(sublensBuilder);

            // Execute the sublens on the current item to get the value
            let sublensValue: any;
            if (sublens.terminalCall) {
                // Handle terminal calls (.count(), .size(), .exists())
                sublensValue = evaluateTerminalCallOnItem(item, sublens);
            } else {
                // Regular lens evaluation
                sublensValue = evaluateAST(item, sublens.query, "get");
            }

            // Convert symbols (including UNDEFINED_SENTINEL) to null for sorting
            // Symbols cannot be meaningfully compared in sort operations
            if (typeof sublensValue === "symbol") {
                return null;
            }

            return sublensValue;
        } catch (error) {
            // If sublens evaluation fails, return null (will be handled by sort comparison)
            return null;
        }
    }

    // Handle string field cases
    if (typeof field === "string") {
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
                // Fallback to getNestedProperty for other cases
                return getNestedProperty(item, field);
        }
    }

    return null;
}

// Comprehensive value comparison with fallback chain
function compareValues(aVal: any, bVal: any, nullishHandling?: "first" | "last", direction?: "asc" | "desc"): number {
    // Default nullish handling to "last" if not specified
    const effectiveNullishHandling = nullishHandling || "last";
    // Handle UNDEFINED_PLACEHOLDER
    if (aVal === UNDEFINED_PLACEHOLDER && bVal === UNDEFINED_PLACEHOLDER) return 0;
    if (aVal === UNDEFINED_PLACEHOLDER) return effectiveNullishHandling === "first" ? -1 : 1;
    if (bVal === UNDEFINED_PLACEHOLDER) return effectiveNullishHandling === "first" ? 1 : -1;

    // Handle null and undefined
    const aIsNullish = aVal === null || aVal === undefined;
    const bIsNullish = bVal === null || bVal === undefined;

    if (aIsNullish && bIsNullish) {
        // Both are nullish - for "default" mode, maintain original order (return 0)
        return 0;
    }
    if (aIsNullish) {
        return effectiveNullishHandling === "first" ? -1 : 1;
    }
    if (bIsNullish) {
        return effectiveNullishHandling === "first" ? 1 : -1;
    }

    // Strategy 1: Try TrhSymbols.Compare first (highest priority)
    if (aVal && typeof aVal[TrhSymbols.Compare] === "function") {
        const result = aVal[TrhSymbols.Compare](bVal);
        if (result !== null && !isNaN(result)) {
            return direction === "desc" ? -result : result;
        }
    }

    // Strategy 2: Try numeric comparison
    const numA = Number(aVal);
    const numB = Number(bVal);
    if (!isNaN(numA) && !isNaN(numB)) {
        // Both successfully converted to numbers
        let result = 0;
        if (numA < numB) result = -1;
        else if (numA > numB) result = 1;
        return direction === "desc" ? -result : result;
    }

    // Strategy 3: String comparison with natural sorting
    const strA = convertToMeaningfulString(aVal);
    const strB = convertToMeaningfulString(bVal);

    // Check if either value is non-comparable (couldn't convert to meaningful string)
    const aIsNonComparable = strA === null;
    const bIsNonComparable = strB === null;

    if (aIsNonComparable && bIsNonComparable) {
        // Both are non-comparable - for "default" mode, maintain original order
        return 0;
    }
    if (aIsNonComparable) {
        return nullishHandling === "first" ? -1 : nullishHandling === "last" ? 1 : 0;
    }
    if (bIsNonComparable) {
        return nullishHandling === "first" ? 1 : nullishHandling === "last" ? -1 : 0;
    }

    // Use natural collator for string comparison and apply direction
    const result = naturalCollator.compare(strA, strB);
    return direction === "desc" ? -result : result;
}

// Convert value to meaningful string or null if not possible
function convertToMeaningfulString(value: any): string | null {
    if (value === null || value === undefined) return null;

    switch (typeof value) {
        case "string":
            return value;
        case "number":
        case "bigint":
        case "boolean":
            return String(value);
        case "symbol":
            // Symbols cannot be meaningfully converted to strings for comparison
            return null;
        case "object":
            // Check for custom toString that's not the default Object.prototype.toString
            if (typeof value.toString === "function" && value.toString !== Object.prototype.toString && value.toString !== Array.prototype.toString) {
                const str = value.toString();
                // Avoid "[object Object]" or other generic representations
                if (!str.startsWith("[object ")) {
                    return str;
                }
            }
            // No meaningful string representation for this object
            return null;
        default:
            return null;
    }
}

// Helper function to get nested property value
function getNestedProperty(obj: any, path: string): any {
    if (obj === null || obj === undefined) return undefined;

    const parts = path.split(".");
    let current = obj;

    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }

    return current;
}

function executeSliceModifier(items: any[], indices: number[], originalIndices: number[], modifier: any): CollectionResult<any> {
    const { start, end } = modifier;
    const normalizedStart = start < 0 ? Math.max(0, items.length + start) : Math.min(start, items.length);
    const normalizedEnd = end === undefined ? items.length : end < 0 ? Math.max(0, items.length + end) : Math.min(end, items.length);

    const slicedItems = items.slice(normalizedStart, normalizedEnd);
    const slicedIndices = indices.slice(normalizedStart, normalizedEnd);
    const slicedOriginalIndices = originalIndices.slice(normalizedStart, normalizedEnd);

    return {
        items: slicedItems,
        indices: slicedIndices,
        originalIndices: slicedOriginalIndices,
        paths: [],
    };
}

function executeAtModifier(items: any[], indices: number[], originalIndices: number[], modifier: any): CollectionResult<any> {
    const normalizedIndex = normalizeArrayIndex(modifier.index, items.length);
    if (normalizedIndex < 0 || normalizedIndex >= items.length) {
        return { items: [], indices: [], originalIndices: [], paths: [] };
    }

    return {
        items: [items[normalizedIndex]],
        indices: [indices[normalizedIndex]],
        originalIndices: [originalIndices[normalizedIndex]],
        paths: [],
    };
}

function executeReverseModifier(items: any[], indices: number[], originalIndices: number[]): CollectionResult<any> {
    return {
        items: [...items].reverse(),
        indices: [...indices].reverse(),
        originalIndices: [...originalIndices].reverse(),
        paths: [],
    };
}

function executeDistinctModifier(items: any[], indices: number[], originalIndices: number[], modifier: any): CollectionResult<any> {
    const seenValues: any[] = []; // Store actual values for comparison
    const distinctItems: any[] = [];
    const distinctIndices: number[] = [];
    const distinctOriginalIndices: number[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const index = indices[i];
        const originalIndex = originalIndices[i];

        // Use the same field resolution as sort for consistency
        const distinctValue = modifier.field ? resolveSortFieldValue(modifier.field, item, index, originalIndex, items) : item;

        // For property-based distinct, exclude items where the property is null/undefined
        if (modifier.field && (distinctValue === null || distinctValue === undefined)) {
            continue; // Skip items that don't have the property
        }

        // Check if we've seen an equivalent value using loose comparison logic
        let isDuplicate = false;
        for (const seenValue of seenValues) {
            if (isLooselyEqual(distinctValue, seenValue)) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            seenValues.push(distinctValue);
            distinctItems.push(item);
            distinctIndices.push(index);
            distinctOriginalIndices.push(originalIndex);
        }
    }

    return {
        items: distinctItems,
        indices: distinctIndices,
        originalIndices: distinctOriginalIndices,
        paths: [],
    };
}

// Loose equality comparison for distinct operations
// Uses similar logic to sorting comparison but returns boolean
function isLooselyEqual(a: any, b: any): boolean {
    // Handle null/undefined
    if ((a === null || a === undefined) && (b === null || b === undefined)) {
        return true;
    }
    if (a === null || a === undefined || b === null || b === undefined) {
        return false;
    }

    // Handle identical values (including same object references)
    if (a === b) {
        return true;
    }

    // Strategy 1: Try TrhSymbols.Compare for custom equality
    if (a && typeof a[TrhSymbols.Compare] === "function") {
        const result = a[TrhSymbols.Compare](b);
        if (result !== null && !isNaN(result)) {
            return result === 0;
        }
    }

    // Strategy 2: Try numeric comparison (loose equality like "1" == 1)
    const numA = Number(a);
    const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB)) {
        return numA === numB;
    }

    // Strategy 3: Try string comparison for meaningful strings
    const strA = convertToMeaningfulString(a);
    const strB = convertToMeaningfulString(b);

    if (strA !== null && strB !== null) {
        return strA === strB;
    }

    // Strategy 4: Object comparison using JSON (for deep equality)
    if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch {
            return false;
        }
    }

    // No meaningful comparison possible
    return false;
}

// Utility function to normalize array indices (handle negative indices)
function normalizeArrayIndex(index: number, length: number): number {
    return index < 0 ? length + index : index;
}
