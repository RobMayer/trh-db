import { FinalizedLens, LensBuilderRoot, LensResult, isSentinel } from "./types";
import { createLensBuilder } from "./lib/ast";
import { evaluateAST } from "./lib/evaluation";
import { executeTerminalCall } from "./lib/finalizers";

export const get = <D, T, Mode extends "single" | "multi", Flags extends string = any>(
    data: D,
    lens: ((l: LensBuilderRoot<D>) => FinalizedLens<T, Mode, Flags>) | FinalizedLens<T, Mode, Flags>
): LensResult<FinalizedLens<T, Mode, Flags>> => {
    const lensToUse = typeof lens === "function" ? lens(createLensBuilder<D>()) : lens;

    // Use the hierarchical evaluation engine to execute the lens query
    const result = evaluateAST(data, lensToUse.query, "get", undefined, lensToUse.mode);

    // Handle terminal calls if present
    if (lensToUse.terminalCall) {
        return executeTerminalCall(lensToUse.terminalCall.type, result, data, lensToUse.query) as LensResult<FinalizedLens<T, Mode>>;
    }

    // Handle mode-specific return type behavior
    if (lensToUse.mode === "single") {
        // Single mode: return the target value directly, converting sentinels to undefined
        return (isSentinel(result) ? undefined : result) as LensResult<FinalizedLens<T, Mode>>;
    } else {
        // Multi mode: return array of target values, converting any sentinels to undefined
        if (Array.isArray(result)) {
            return result.map((item) => (isSentinel(item) ? undefined : item)) as LensResult<FinalizedLens<T, Mode>>;
        } else {
            // Fallback: if somehow we don't get an array in multi mode, wrap in array
            return [isSentinel(result) ? undefined : result] as LensResult<FinalizedLens<T, Mode>>;
        }
    }
};
