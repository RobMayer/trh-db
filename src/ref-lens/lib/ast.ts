import {
    LensBuilderRoot,
    LensBuilder,
    CollectionLensBuilder,
    Query,
    ASTNode,
    PropertyAccessNode,
    IndexAccessNode,
    WildcardAccessNode,
    CollectionModifierChainNode,
    GatherNode,
    CollectionModifier,
    FinalizedLens,
    TerminalCall,
} from "../types";
import { attachCollectionMethods, CollectionMethodConfig } from "./modifiers";
import { createTerminalCallHandler, isSingleModeModifier } from "./finalizers";

// Main factory function for creating lens builders
export const createLensBuilder = <T>(): LensBuilderRoot<T> => {
    return createLensBuilderWithAST<T>(null);
};

// Create a lens builder with an existing AST
function createLensBuilderWithAST<T>(currentAST: Query): LensBuilderRoot<T> {
    const builder = function builderFunction(...args: any[]): any {
        if (args.length === 0) {
            // Terminal call - return finalized lens
            const mode = inferModeFromAST(currentAST);
            return createFinalizedLens<T, typeof mode, "">(currentAST, mode);
        }

        if (args.length === 1) {
            const arg = args[0];

            if (typeof arg === "string") {
                if (arg === "*") {
                    // Wildcard access
                    const wildcardNode: WildcardAccessNode = {
                        type: "wildcard",
                    };
                    const newAST = appendToAST(currentAST, wildcardNode);
                    return createLensBuilderWithAST(newAST);
                } else {
                    // Property access
                    const propertyNode: PropertyAccessNode = {
                        type: "property",
                        property: arg,
                    };
                    const newAST = appendToAST(currentAST, propertyNode);
                    return createLensBuilderWithAST(newAST);
                }
            } else if (typeof arg === "number") {
                // Index access
                const indexNode: IndexAccessNode = {
                    type: "index",
                    index: arg,
                };
                const newAST = appendToAST(currentAST, indexNode);
                return createLensBuilderWithAST(newAST);
            }
        }

        throw new Error(`Invalid lens builder arguments: ${JSON.stringify(args)}`);
    } as LensBuilderRoot<T>;

    // Add collection methods using the shared implementation
    const config: CollectionMethodConfig = {
        currentAST,
        isChainable: false,
        createNextBuilder: (ast: Query, modifiers?: CollectionModifier[]) => {
            if (modifiers) {
                return createCollectionLensBuilder<any, any>(ast, modifiers);
            }
            return createLensBuilderWithAST(ast);
        },
    };

    attachCollectionMethods(builder, config, appendToAST, createLensBuilderWithAST);

    // Add terminal call methods
    const terminalHandlers = createTerminalCallHandler(currentAST, undefined, inferModeFromAST, createFinalizedLens);

    (builder as any).count = terminalHandlers.count;
    (builder as any).size = terminalHandlers.size;
    (builder as any).exists = terminalHandlers.exists;

    // Add gather method - only available on LensBuilderRoot
    (builder as any).gather = function (sublensCallback: (sublens: LensBuilderRoot<T>) => FinalizedLens<any, any, any>): any {
        const gatherNode: GatherNode = {
            type: "gather",
            sublensCallback: sublensCallback,
        };
        const newAST = appendToAST(currentAST, gatherNode);
        // After gather, return a collection lens builder for multi-mode operations
        return createCollectionLensBuilder<any[], any>(newAST, []) as any;
    };

    return builder;
}

// Create a collection lens builder for chaining collection modifiers
export function createCollectionLensBuilder<T, U>(baseAST: Query, modifiers: CollectionModifier[]): CollectionLensBuilder<T, U, any, any> {
    const builder = function builderFunction(...args: any[]): any {
        if (args.length === 0) {
            // Terminal call - return finalized lens with collection modifiers
            const collectionNode: CollectionModifierChainNode = {
                type: "collection-chain",
                modifiers,
            };
            const newAST = appendToAST(baseAST, collectionNode);
            const mode = inferModeFromAST(newAST);
            return createFinalizedLens<any, typeof mode, "">(newAST, mode);
        }

        // Property/index access after collection modifiers
        const collectionNode: CollectionModifierChainNode = {
            type: "collection-chain",
            modifiers,
        };
        const astWithCollection = appendToAST(baseAST, collectionNode);

        if (args.length === 1) {
            const arg = args[0];

            if (typeof arg === "string") {
                if (arg === "*") {
                    const wildcardNode: WildcardAccessNode = { type: "wildcard" };
                    const newAST = appendToAST(astWithCollection, wildcardNode);
                    return createLensBuilderWithAST(newAST);
                } else {
                    const propertyNode: PropertyAccessNode = { type: "property", property: arg };
                    const newAST = appendToAST(astWithCollection, propertyNode);
                    return createLensBuilderWithAST(newAST);
                }
            } else if (typeof arg === "number") {
                const indexNode: IndexAccessNode = { type: "index", index: arg };
                const newAST = appendToAST(astWithCollection, indexNode);
                return createLensBuilderWithAST(newAST);
            }
        }

        throw new Error(`Invalid collection lens builder arguments: ${JSON.stringify(args)}`);
    } as CollectionLensBuilder<T, U, any, any>;

    // Add collection methods using the shared implementation
    const config: CollectionMethodConfig = {
        currentAST: baseAST,
        currentModifiers: modifiers,
        isChainable: true,
        createNextBuilder: (ast: Query, mods?: CollectionModifier[]) => {
            return createCollectionLensBuilder(ast, mods || modifiers);
        },
    };

    attachCollectionMethods(builder, config, appendToAST, createLensBuilderWithAST);

    // Add terminal call methods for collection builders
    // We need to compute these dynamically when called, not when building
    (builder as any).count = function (): any {
        const collectionNode: CollectionModifierChainNode = {
            type: "collection-chain",
            modifiers,
        };
        const newAST = appendToAST(baseAST, collectionNode);
        const mode = inferModeFromAST(newAST);

        const finalModifier = modifiers[modifiers.length - 1];
        const isTerminalModifier = finalModifier && isSingleModeModifier(finalModifier);

        if (mode === "single" || isTerminalModifier) {
            throw new Error("count() is only available in multi-mode");
        }

        const terminalCall: TerminalCall = { type: "count" };
        return createFinalizedLens<number, "single", "computed">(newAST, "single", terminalCall);
    };

    (builder as any).size = function (): any {
        const collectionNode: CollectionModifierChainNode = {
            type: "collection-chain",
            modifiers,
        };
        const newAST = appendToAST(baseAST, collectionNode);
        const mode = inferModeFromAST(newAST);

        const finalModifier = modifiers[modifiers.length - 1];
        const isTerminalModifier = finalModifier && isSingleModeModifier(finalModifier);

        if (mode === "multi" && !isTerminalModifier) {
            throw new Error("size() is only available in single-mode");
        }

        const terminalCall: TerminalCall = { type: "size" };
        return createFinalizedLens<number, "single", "computed">(newAST, "single", terminalCall);
    };

    (builder as any).exists = function (): any {
        const collectionNode: CollectionModifierChainNode = {
            type: "collection-chain",
            modifiers,
        };
        const newAST = appendToAST(baseAST, collectionNode);

        const terminalCall: TerminalCall = { type: "exists" };
        return createFinalizedLens<boolean, "single", "structural">(newAST, "single", terminalCall);
    };

    return builder;
}

// Helper function to append nodes to AST
export function appendToAST(currentAST: Query, newNode: ASTNode): Query {
    if (currentAST === null) {
        return newNode;
    }

    // Find the deepest node in the current AST and attach the new node
    let current = currentAST;
    while (current.child) {
        current = current.child;
    }
    current.child = newNode;

    return currentAST;
}

// Helper function to infer mode from AST
export function inferModeFromAST(ast: Query): "single" | "multi" {
    if (ast === null) return "single";

    // Traverse the AST and determine the final mode using the correct algorithm
    let current: ASTNode | undefined = ast;
    let currentMode: "single" | "multi" = "single";

    while (current) {
        switch (current.type) {
            case "property":
            case "index":
                // Preserve current mode (Rule 2)
                break;

            case "wildcard":
                // One-way transition to multi mode (Rule 3 - irreversible)
                currentMode = "multi";
                break;

            case "collection-chain":
                // Virtual Accessor - mode determined by final modifier (Rule 4)
                const finalModifier = current.modifiers[current.modifiers.length - 1];
                if (finalModifier) {
                    // Apply the correct algorithm from DesignRequirements.md:
                    // currentMode = currentMode === "multi" ? "multi" : isSingleModeModifier(finalModifier) ? "single" : "multi";
                    currentMode = currentMode === "multi" ? "multi" : isSingleModeModifier(finalModifier) ? "single" : "multi";
                }
                break;

            case "gather":
                // Gather (.gather()) is a multi-mode modifier
                // If it's terminal (not followed by collection-chain), it forces multi-mode
                // If it's followed by collection-chain, let the chain determine the final mode
                if (!current.child || current.child.type !== "collection-chain") {
                    // Terminal .gather() - acts as multi-mode modifier
                    currentMode = currentMode === "multi" ? "multi" : "multi";
                }
                // If followed by collection-chain, don't change mode - let the chain handle it
                break;
        }
        current = current.child;
    }

    return currentMode;
}

// Helper function to create finalized lens
function createFinalizedLens<T, Mode extends "single" | "multi", Flags extends string>(ast: Query, mode: Mode, terminalCall?: TerminalCall): FinalizedLens<T, Mode, Flags> {
    return {
        __brand: Symbol() as any,
        __type: undefined as any,
        __flags: undefined as any, // Flags are purely type-level, no runtime value needed
        __mode: mode,
        query: ast,
        mode,
        terminalCall,
    };
}
