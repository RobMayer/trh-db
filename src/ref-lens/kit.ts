import { LensBuilder, FinalizedLens, Query, PathStep, ASTNode, PropertyAccessNode, IndexAccessNode, CollectionModifierChainNode, CollectionModifier, GatherNode, WhereModifier, LogicExpression, PredicateDefinition, SublensPredicateDefinition } from "./types";
import { createLensBuilder } from "./lib/ast";
import { typeOf } from "./lib/typhelpers";
import { evaluateAST } from "./lib/evaluation";
import { isLogicExpression, isPredicateSpec } from "./lib/logic";
import { isSublensPredicateDefinition, isPredicateDefinition } from "./lib/predicates";
import { CONTEXT_GLYPH } from "./lib/constants";

// Public wrapper for utility functions
export const lensKit = <T>() => {
    return {
        // Enhanced type detection with TrhSymbols integration
        typeOf: (value: any): string => {
            return typeOf(value);
        },

        create: (): LensBuilder<T> => {
            return createLensBuilder<T>();
        },

        // Inspect lens structure with comprehensive analysis
        inspect: <U, Mode extends "single" | "multi", Flags extends string = "">(lens: FinalizedLens<U, Mode, Flags>) => {
            const analysis = analyzeLensStructure(lens.query);
            return {
                query: lens.query,
                mode: lens.mode,
                flags: (lens as any).__flags || "",
                terminalCall: lens.terminalCall,
                // Merge analysis results directly into inspect
                depth: analysis.depth,
                hasWildcards: analysis.hasWildcards,
                hasCollectionModifiers: analysis.hasCollectionModifiers,
                hasGather: analysis.hasGather,
                hasLogicExpressions: analysis.hasLogicExpressions,
                hasSublensPredicates: analysis.hasSublensPredicates,
                modifierTypes: analysis.modifierTypes,
                accessPattern: analysis.accessPattern,
                estimatedComplexity: analysis.estimatedComplexity,
            };
        },

        // Get human-readable description of a lens
        describe: <U, Mode extends "single" | "multi", Flags extends string = "">(lens: FinalizedLens<U, Mode, Flags>): string => {
            const baseDescription = describeLens(lens.query);
            const terminalDesc = lens.terminalCall ? ` → ${lens.terminalCall.type}()` : "";
            const flagsDesc = (lens as any).__flags && (lens as any).__flags !== "" ? ` [flags: ${(lens as any).__flags}]` : "";
            const modeDesc = ` [mode: ${lens.mode}]`;
            return baseDescription + terminalDesc + modeDesc + flagsDesc;
        },

        // Get paths that would be affected by an update
        affects: <U, Mode extends "single" | "multi">(obj: T, lens: FinalizedLens<U, Mode>): PathStep[][] => {
            const result = evaluateAST(obj, lens.query, "affects", undefined, lens.mode);

            // Normalize result to always return array of paths
            if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
                return result;
            } else if (Array.isArray(result)) {
                return [result];
            } else {
                return [];
            }
        },

        // Check if a lens would match any data in an object (returns true even for empty results)
        matches: <U, Mode extends "single" | "multi">(obj: T, lens: FinalizedLens<U, Mode>): boolean => {
            try {
                // Try to execute the lens - if it doesn't throw, it's a valid match
                evaluateAST(obj, lens.query, "get", undefined, lens.mode);
                return true;
            } catch {
                return false;
            }
        },
    };
};

// Helper function to analyze lens structure
function analyzeLensStructure(query: Query): LensAnalysis {
    if (!query) {
        return {
            depth: 0,
            hasWildcards: false,
            hasCollectionModifiers: false,
            hasGather: false,
            hasLogicExpressions: false,
            hasSublensPredicates: false,
            modifierTypes: [],
            accessPattern: [],
            estimatedComplexity: "simple",
        };
    }

    let depth = 0;
    let maxDepth = 0;
    let hasWildcards = false;
    let hasCollectionModifiers = false;
    let hasGather = false;
    let hasLogicExpressions = false;
    let hasSublensPredicates = false;
    const modifierTypes: string[] = [];
    const accessPattern: string[] = [];

    function traverse(node: ASTNode, currentDepth: number = 1): void {
        maxDepth = Math.max(maxDepth, currentDepth);

        switch (node.type) {
            case "property":
                accessPattern.push(`property:${(node as PropertyAccessNode).property}`);
                break;
            case "index":
                accessPattern.push(`index:${(node as IndexAccessNode).index}`);
                break;
            case "wildcard":
                hasWildcards = true;
                accessPattern.push("wildcard");
                break;
            case "gather":
                hasGather = true;
                accessPattern.push("gather");
                // Don't traverse the sublens callback, just note it exists
                break;
            case "collection-chain":
                hasCollectionModifiers = true;
                const chainNode = node as CollectionModifierChainNode;
                chainNode.modifiers.forEach((mod) => {
                    modifierTypes.push(mod.type);
                    accessPattern.push(`modifier:${mod.type}`);
                    
                    // Check for logic expressions and sublens predicates in where modifiers
                    if (mod.type === "where") {
                        const whereMod = mod as WhereModifier;
                        if (isLogicExpression(whereMod.predicate)) {
                            hasLogicExpressions = true;
                        } else if (isSublensPredicateDefinition(whereMod.predicate)) {
                            hasSublensPredicates = true;
                        }
                    }
                });
                break;
        }

        if (node.child) {
            traverse(node.child, currentDepth + 1);
        }
    }

    traverse(query);
    depth = maxDepth;

    return {
        depth,
        hasWildcards,
        hasCollectionModifiers,
        hasGather,
        hasLogicExpressions,
        hasSublensPredicates,
        modifierTypes,
        accessPattern,
        estimatedComplexity: determineComplexity(depth, hasWildcards, hasCollectionModifiers, modifierTypes.length, hasGather, hasLogicExpressions),
    };
}

// Helper function to create human-readable lens description
function describeLens(query: Query): string {
    if (!query) {
        return "Empty lens (root access)";
    }

    const parts: string[] = [];

    function traverse(node: ASTNode): void {
        switch (node.type) {
            case "property":
                parts.push(`access property "${(node as PropertyAccessNode).property}"`);
                break;
            case "index":
                parts.push(`access index ${(node as IndexAccessNode).index}`);
                break;
            case "wildcard":
                parts.push("access all elements (wildcard)");
                break;
            case "gather":
                parts.push("gather from sublens");
                break;
            case "collection-chain":
                const chainNode = node as CollectionModifierChainNode;
                const modifierDescriptions = chainNode.modifiers.map(describeModifier);
                parts.push(`apply collection modifiers: ${modifierDescriptions.join(", ")}`);
                break;
        }

        if (node.child) {
            parts.push("→");
            traverse(node.child);
        }
    }

    traverse(query);

    return parts.join(" ");
}

// Helper function to describe individual collection modifiers
function describeModifier(modifier: CollectionModifier): string {
    switch (modifier.type) {
        case "where":
            const whereMod = modifier as WhereModifier;
            return describeWherePredicate(whereMod.predicate);
        case "sort":
            const sortField = (modifier as any).field;
            const sortConfig = (modifier as any).config;
            if (typeof sortField === "object" && sortField.sublensCallback) {
                return `sort by sublens${sortConfig ? ` (${sortConfig.direction || 'asc'})` : ''}`;
            }
            return `sort by ${sortField}${sortConfig ? ` (${sortConfig.direction || 'asc'})` : ''}`;
        case "slice":
            const sliceMod = modifier as any;
            return `slice from ${sliceMod.start}${sliceMod.end !== undefined ? ` to ${sliceMod.end}` : ""}`;
        case "at":
            const atIndex = (modifier as any).index;
            if (atIndex === 0) return "first";
            if (atIndex === -1) return "last";
            return `select index ${atIndex}`;
        case "reverse":
            return "reverse order";
        case "distinct":
            const distinctMod = modifier as any;
            if (typeof distinctMod.field === "object" && distinctMod.field?.sublensCallback) {
                return "distinct by sublens";
            }
            return `distinct${distinctMod.field ? ` by ${distinctMod.field}` : ""}`;
        default:
            return (modifier as any).type;
    }
}

// Helper function to describe where predicates
function describeWherePredicate(predicate: any): string {
    if (isLogicExpression(predicate)) {
        return describeLogicExpression(predicate);
    } else if (isSublensPredicateDefinition(predicate)) {
        return `filter where sublens ${predicate.operator} ${JSON.stringify(predicate.operand)}`;
    } else if (isPredicateDefinition(predicate)) {
        return `filter where ${predicate.field} ${predicate.operator} ${JSON.stringify(predicate.operand)}`;
    } else if (typeof predicate === "function") {
        return "filter with custom function";
    } else {
        return "filter with unknown predicate";
    }
}

// Helper function to describe logic expressions
function describeLogicExpression(expr: LogicExpression): string {
    const { type, predicates } = expr;
    const predicateDescs = predicates.map(pred => {
        if (isLogicExpression(pred)) {
            return `(${describeLogicExpression(pred)})`;
        } else if (isPredicateSpec(pred)) {
            const [fieldOrCallback, operator, operand] = pred;
            if (typeof fieldOrCallback === "string") {
                return `${fieldOrCallback} ${operator} ${JSON.stringify(operand)}`;
            } else {
                return `sublens ${operator} ${JSON.stringify(operand)}`;
            }
        }
        return "unknown predicate";
    });
    
    switch (type) {
        case "and":
            return `filter where (${predicateDescs.join(" AND ")})`;
        case "or":
            return `filter where (${predicateDescs.join(" OR ")})`;
        case "xor":
            return `filter where exactly one of (${predicateDescs.join(", ")})`;
        case "not-and":
            return `filter where NOT all of (${predicateDescs.join(" AND ")})`;
        case "not-or":
            return `filter where NONE of (${predicateDescs.join(" OR ")})`;
        case "not-xor":
            return `filter where NOT exactly one of (${predicateDescs.join(", ")})`;
        default:
            return `filter with ${type} logic`;
    }
}

// Helper function to determine complexity
function determineComplexity(
    depth: number, 
    hasWildcards: boolean, 
    hasCollectionModifiers: boolean, 
    modifierCount: number,
    hasGather: boolean = false,
    hasLogicExpressions: boolean = false
): "simple" | "moderate" | "complex" {
    // Gather or logic expressions automatically make it at least moderate
    if (hasGather || hasLogicExpressions) {
        return depth > 4 || modifierCount > 3 ? "complex" : "moderate";
    }
    
    if (depth <= 2 && !hasWildcards && !hasCollectionModifiers) {
        return "simple";
    }

    if (depth <= 4 && modifierCount <= 2) {
        return "moderate";
    }

    return "complex";
}

// Types for lens analysis
interface LensAnalysis {
    depth: number;
    hasWildcards: boolean;
    hasCollectionModifiers: boolean;
    hasGather: boolean;
    hasLogicExpressions: boolean;
    hasSublensPredicates: boolean;
    modifierTypes: string[];
    accessPattern: string[];
    estimatedComplexity: "simple" | "moderate" | "complex";
}
