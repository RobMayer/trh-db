import { Query, TerminalCall, FinalizedLens, CollectionModifier, isSentinel, hasProperty } from "../types";
import { OPMODS } from "./constants";

// Check if a modifier is single-mode
export function isSingleModeModifier(modifier: CollectionModifier): boolean {
    switch (modifier.type) {
        case "at":
            return true;
        case "where":
            // Check if it's a directional operator (uses { or })
            if (typeof modifier.predicate === "object" && "operator" in modifier.predicate) {
                const op = modifier.predicate.operator;
                return op.startsWith(OPMODS.FIRSTOF) || op.endsWith(OPMODS.LASTOF);
            }
            return false;
        case "sort":
        case "slice":
        case "reverse":
        case "distinct":
        default:
            return false;
    }
}

// Create terminal call methods for builders
export function createTerminalCallHandler(
    currentAST: Query,
    modifiers: CollectionModifier[] | undefined,
    inferModeFromAST: (ast: Query) => "single" | "multi",
    createFinalizedLens: <T, Mode extends "single" | "multi", Flags extends string>(ast: Query, mode: Mode, terminalCall?: TerminalCall) => FinalizedLens<T, Mode, Flags>
) {
    const mode = inferModeFromAST(currentAST);
    const finalModifier = modifiers?.[modifiers.length - 1];
    const isTerminalModifier = finalModifier && isSingleModeModifier(finalModifier);

    return {
        count: function (): any {
            // count() is only available in multi-mode
            if (mode === "single" && !isTerminalModifier) {
                throw new Error("count() is only available in multi-mode");
            }

            if (isTerminalModifier) {
                throw new Error("count() is only available in multi-mode");
            }

            const terminalCall: TerminalCall = { type: "count" };
            return createFinalizedLens<number, "single", "computed">(currentAST, "single", terminalCall);
        },

        size: function (): any {
            // size() is only available in single-mode
            if (mode === "multi" && !isTerminalModifier) {
                throw new Error("size() is only available in single-mode");
            }

            if (!isTerminalModifier && mode === "multi") {
                throw new Error("size() is only available in single-mode");
            }

            const terminalCall: TerminalCall = { type: "size" };
            return createFinalizedLens<number, "single", "computed">(currentAST, "single", terminalCall);
        },

        exists: function (): any {
            // exists() is always available
            const terminalCall: TerminalCall = { type: "exists" };
            return createFinalizedLens<boolean, "single", "structural">(currentAST, "single", terminalCall);
        },
    };
}

// Execute terminal call at runtime (used in get.ts)
export function executeTerminalCall(terminalCallType: "count" | "size" | "exists", result: any, data: any, query: Query): any {
    switch (terminalCallType) {
        case "count":
            // count() returns the number of items in multi-mode result
            if (Array.isArray(result)) {
                return result.length;
            } else if (isSentinel(result)) {
                // Sentinel means the path was broken, so count is 0
                return 0;
            } else {
                // Single items count as 1
                return 1;
            }

        case "size":
            // size() returns the length of the single-mode result
            if (isSentinel(result)) {
                return undefined;
            }
            if (Array.isArray(result)) {
                return result.length;
            } else if (typeof result === "string") {
                return result.length;
            } else if (result && typeof result === "object") {
                return Object.keys(result).length;
            } else {
                return undefined;
            }

        case "exists":
            // For collection modifiers, check if evaluation produces a result
            if (hasCollectionModifiers(query)) {
                if (Array.isArray(result)) {
                    return result.length > 0;
                } else {
                    return result !== undefined;
                }
            } else {
                // Simple path existence check
                return checkPathExists(data, query);
            }

        default:
            throw new Error(`Unknown terminal call type: ${terminalCallType}`);
    }
}

// Helper function to check if a query contains collection modifiers
function hasCollectionModifiers(query: Query): boolean {
    if (query === null) {
        return false;
    }

    let node = query;
    while (node) {
        if (node.type === "collection-chain") {
            return true;
        }
        node = node.child as any;
    }
    return false;
}

// Helper function to check if a path exists in the data structure

function checkPathExists(data: any, query: Query): boolean {
    if (query === null) {
        return true; // Root path always exists
    }

    let current = data;
    let node = query;

    while (node) {
        switch (node.type) {
            case "property":
                if (current === null || current === undefined) {
                    return false;
                }
                if (!hasProperty(current, (node as any).property)) {
                    return false;
                }
                current = current[(node as any).property];
                break;

            case "index":
                if (!Array.isArray(current)) {
                    return false;
                }
                const index = (node as any).index;
                const normalizedIndex = index < 0 ? current.length + index : index;
                if (normalizedIndex < 0 || normalizedIndex >= current.length) {
                    return false;
                }
                current = current[normalizedIndex];
                break;

            case "wildcard":
            case "collection-chain":
                // These shouldn't be reachable in single-mode exists()
                return false;

            default:
                return false;
        }
        node = (node as any).child;
    }

    return true;
}
