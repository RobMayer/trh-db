import {
    Query,
    ASTNode,
    CollectionModifier,
    WhereModifier,
    SortModifier,
    SliceModifier,
    AtModifier,
    ReverseModifier,
    DistinctModifier,
    CollectionModifierChainNode,
    LensBuilder,
    CollectionLensBuilder,
    LogicBuilderCallback
} from "../types";
import { createLogicBuilder } from "./logic";

// Shared implementation for collection methods
// This eliminates duplication between addCollectionMethods and addCollectionBuilderMethods

export interface CollectionMethodConfig {
    currentAST: Query;
    currentModifiers?: CollectionModifier[];
    isChainable: boolean;
    createNextBuilder: (ast: Query, modifiers?: CollectionModifier[]) => any;
}

// Create when method implementation (callback predicate)
export function createWhenMethod(config: CollectionMethodConfig) {
    return function (predicate: (item: any) => boolean): any {
        if (typeof predicate !== "function") {
            throw new Error("when() requires a predicate function");
        }
        
        const whereModifier: WhereModifier = { type: "where", predicate };
        
        if (config.isChainable && config.currentModifiers) {
            return config.createNextBuilder(config.currentAST, [...config.currentModifiers, whereModifier]);
        } else {
            return config.createNextBuilder(config.currentAST, [whereModifier]);
        }
    };
}

// Create where method implementation
export function createWhereMethod(config: CollectionMethodConfig) {
    return function (arg1: any, arg2?: any, arg3?: any): any {
        let whereModifier: WhereModifier;

        if (typeof arg1 === "string" && arg2 !== undefined && arg3 !== undefined) {
            // Predicate form - field, operator, operand
            whereModifier = { type: "where", predicate: { field: arg1, operator: arg2, operand: arg3 } };
        } else if (typeof arg1 === "function" && arg2 !== undefined && arg3 !== undefined) {
            // Sublens predicate form - sublensCallback, operator, operand
            whereModifier = { type: "where", predicate: { sublensCallback: arg1, operator: arg2, operand: arg3 } };
        } else if (typeof arg1 === "function" && arg2 === undefined && arg3 === undefined) {
            // Logic expression form - logicBuilderCallback
            const logicBuilder = createLogicBuilder();
            const logicExpression = (arg1 as LogicBuilderCallback)(logicBuilder);
            whereModifier = { type: "where", predicate: logicExpression };
        } else {
            throw new Error("Invalid where arguments. Expected: (field, operator, operand), (sublensCallback, operator, operand), or (logicBuilderCallback)");
        }

        if (config.isChainable && config.currentModifiers) {
            return config.createNextBuilder(config.currentAST, [...config.currentModifiers, whereModifier]);
        } else {
            return config.createNextBuilder(config.currentAST, [whereModifier]);
        }
    };
}

// Create sort method implementation
export function createSortMethod(config: CollectionMethodConfig) {
    return function (arg1: any, arg2?: any): any {
        let sortModifier: SortModifier;
        
        if (typeof arg1 === "function") {
            // Sublens callback form
            sortModifier = {
                type: "sort",
                field: { sublensCallback: arg1 },
                config: arg2,
            };
        } else {
            // String field form
            sortModifier = {
                type: "sort",
                field: arg1,
                config: arg2,
            };
        }
        
        if (config.isChainable && config.currentModifiers) {
            return config.createNextBuilder(config.currentAST, [...config.currentModifiers, sortModifier]);
        } else {
            return config.createNextBuilder(config.currentAST, [sortModifier]);
        }
    };
}

// Create slice method implementation
export function createSliceMethod(config: CollectionMethodConfig) {
    return function (start: number, end?: number): any {
        const sliceModifier: SliceModifier = { type: "slice", start, end };
        
        if (config.isChainable && config.currentModifiers) {
            return config.createNextBuilder(config.currentAST, [...config.currentModifiers, sliceModifier]);
        } else {
            return config.createNextBuilder(config.currentAST, [sliceModifier]);
        }
    };
}

// Create reverse method implementation
export function createReverseMethod(config: CollectionMethodConfig) {
    return function (): any {
        const reverseModifier: ReverseModifier = { type: "reverse" };
        
        if (config.isChainable && config.currentModifiers) {
            return config.createNextBuilder(config.currentAST, [...config.currentModifiers, reverseModifier]);
        } else {
            return config.createNextBuilder(config.currentAST, [reverseModifier]);
        }
    };
}

// Create distinct method implementation
export function createDistinctMethod(config: CollectionMethodConfig) {
    return function (field?: any): any {
        let distinctModifier: DistinctModifier;
        
        if (typeof field === "function") {
            // Sublens callback form
            distinctModifier = {
                type: "distinct",
                field: { sublensCallback: field },
            };
        } else {
            // String field form (or undefined)
            distinctModifier = {
                type: "distinct",
                field: field,
            };
        }
        
        if (config.isChainable && config.currentModifiers) {
            return config.createNextBuilder(config.currentAST, [...config.currentModifiers, distinctModifier]);
        } else {
            return config.createNextBuilder(config.currentAST, [distinctModifier]);
        }
    };
}

// Create terminal modifier methods (at, first, last)
export function createAtMethod(config: CollectionMethodConfig, appendToAST: (ast: Query, node: ASTNode) => Query, createLensBuilder: (ast: Query) => any) {
    return function (index: number): any {
        const atModifier: AtModifier = { type: "at", index };
        
        if (config.isChainable && config.currentModifiers) {
            // For collection builders, we need to finalize the chain
            const allModifiers = [...config.currentModifiers, atModifier];
            const collectionNode: CollectionModifierChainNode = { type: "collection-chain", modifiers: allModifiers };
            const newAST = appendToAST(config.currentAST, collectionNode);
            return createLensBuilder(newAST);
        } else {
            // For regular lens builders
            const collectionNode: CollectionModifierChainNode = { type: "collection-chain", modifiers: [atModifier] };
            const newAST = appendToAST(config.currentAST, collectionNode);
            return createLensBuilder(newAST);
        }
    };
}

// Helper to attach all collection methods to a builder
export function attachCollectionMethods<T>(
    builder: LensBuilder<T> | CollectionLensBuilder<any, any, any, any, any>,
    config: CollectionMethodConfig,
    appendToAST: (ast: Query, node: ASTNode) => Query,
    createLensBuilder: (ast: Query) => any
): void {
    // Main collection methods
    builder.when = createWhenMethod(config);
    builder.where = createWhereMethod(config);
    builder.sort = createSortMethod(config);
    builder.slice = createSliceMethod(config);
    builder.reverse = createReverseMethod(config);
    builder.distinct = createDistinctMethod(config);

    // Convenience aliases
    builder.limit = function (count: number): any {
        return (builder as any).slice(0, count);
    };

    builder.skip = function (count: number): any {
        return (builder as any).slice(count);
    };

    // Terminal modifiers
    builder.at = createAtMethod(config, appendToAST, createLensBuilder);
    
    builder.first = function (): any {
        return (builder as any).at(0);
    };

    builder.last = function (): any {
        return (builder as any).at(-1);
    };
}