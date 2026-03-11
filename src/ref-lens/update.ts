import { FinalizedLens, LensBuilderRoot, PathStep, UpdateContext, EvaluationContext, isSentinel, SafeUpdater, Query } from "./types";
import { createLensBuilder } from "./lib/ast";
import { evaluateAST } from "./lib/evaluation";

type ForbiddenFlags = "computed" | "structural" | "gathered";

type UpdaterFunction<U> = (value: U, context: UpdateContext<U>) => U;

// Helper function to check if an AST contains a GatherNode
function hasGatherNode(query: Query): boolean {
    if (!query) return false;
    if (query.type === "gather") return true;

    // Recursively check child nodes
    if ("child" in query && query.child) {
        return hasGatherNode(query.child);
    }

    return false;
}

function performUpdate<T, U, Mode extends "single" | "multi", Flags extends string>(
    obj: T,
    lens: FinalizedLens<U, Mode, Flags>,
    updater: SafeUpdater<Flags, ForbiddenFlags, UpdaterFunction<U>> | SafeUpdater<Flags, ForbiddenFlags, U>
): PathStep[][] {
    // Check if lens has an aggregation or structural terminal call (count/size/exists)
    // These return computed values and cannot be used for updates
    if (lens.terminalCall && (lens.terminalCall.type === "count" || lens.terminalCall.type === "size" || lens.terminalCall.type === "exists")) {
        // Silently do nothing for aggregation and structural terminal calls
        // These return computed values, not data references that can be updated
        return [];
    }

    // Check if lens contains a gather node (gather operation)
    // Gather operations fundamentally change the data structure and cannot be used for updates
    if (hasGatherNode(lens.query)) {
        // Silently do nothing for gather operations
        // These create flattened views that don't map back to the original structure
        return [];
    }

    const pathsModified: PathStep[][] = [];
    const updateMetadata: UpdateMetadata = {
        totalUpdates: 0,
        currentIndex: 0,
    };

    // First pass: get affected paths for multi-mode context
    if (lens.mode === "multi") {
        const affectedPaths = evaluateAST(obj, lens.query, "affects", undefined, lens.mode);
        if (Array.isArray(affectedPaths)) {
            updateMetadata.totalUpdates = affectedPaths.length;
        }
    }

    // Create update callback that handles both value and function updates
    const updateCallback = (value: any, evalContext: EvaluationContext) => {
        // Convert evaluation context to update context with enhanced information
        const updateContext: UpdateContext<U> = createUpdateContext(value, evalContext, lens.mode, updateMetadata);

        // Track the path that was modified
        pathsModified.push([...evalContext.currentPath]);

        // Handle sentinel-to-undefined conversion at API boundary
        const resolvedValue = isSentinel(value) ? undefined : value;

        // Apply the update
        // If updater is a function, treat it as an updater function
        // Otherwise, treat it as a replacement value
        if (typeof updater === "function") {
            return (updater as UpdaterFunction<U>)(resolvedValue, updateContext);
        } else {
            return updater;
        }
    };

    // Use the hierarchical evaluation engine for updates
    evaluateAST(obj, lens.query, "update", updateCallback, lens.mode);

    return pathsModified;
}

interface UpdateMetadata {
    totalUpdates: number;
    currentIndex: number;
}

// Helper function to create UpdateContext from EvaluationContext
function createUpdateContext<U>(value: any, evalContext: EvaluationContext, mode: "single" | "multi", metadata: UpdateMetadata): UpdateContext<U> {
    const currentIndex = metadata.currentIndex++;

    return {
        path: [...evalContext.currentPath],
        query: null, // Query AST - could be added if needed for debugging
        mode,
        originalPath: [...evalContext.currentPath],
        index: mode === "multi" ? currentIndex : undefined, // Use currentIndex for multi-mode, undefined for single-mode
        totalResults: metadata.totalUpdates > 0 ? metadata.totalUpdates : 1,
        isFirst: currentIndex === 0,
        isLast: currentIndex === metadata.totalUpdates - 1,
        // array context will be provided by parent if available
    };
}

export const update = Object.assign(
    function updateMain<T, U, Mode extends "single" | "multi", Flags extends string = "">(
        obj: T,
        lens: FinalizedLens<U, Mode, Flags> | ((lens: LensBuilderRoot<T>) => FinalizedLens<U, Mode, Flags>),
        updater: SafeUpdater<Flags, ForbiddenFlags, UpdaterFunction<U>> | SafeUpdater<Flags, ForbiddenFlags, U>
    ): T {
        const lensToUse = typeof lens === "function" ? lens(createLensBuilder<T>()) : lens;
        performUpdate<T, U, Mode, Flags>(obj, lensToUse, updater);
        return obj;
    },
    {
        verbose<T, U, Mode extends "single" | "multi", Flags extends string = "">(
            obj: T,
            lens: FinalizedLens<U, Mode, Flags> | ((lens: LensBuilderRoot<T>) => FinalizedLens<U, Mode, Flags>),
            updater: SafeUpdater<Flags, ForbiddenFlags, UpdaterFunction<U>> | SafeUpdater<Flags, ForbiddenFlags, U>
        ): [T, PathStep[][]] {
            const lensToUse = typeof lens === "function" ? lens(createLensBuilder<T>()) : lens;
            const explanation = performUpdate<T, U, Mode, Flags>(obj, lensToUse, updater);
            return [obj, explanation];
        },
    }
);

// UpdateContext is now defined in types.ts
