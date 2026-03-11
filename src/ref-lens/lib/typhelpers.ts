import { TrhSymbols } from "@trh/symbols";
import { TriState } from "../types";

// Enhanced type detection with TrhSymbols integration
export const typeOf = (thing: any): string => {
    if (thing === null) {
        return "nullish/null";
    }
    switch (typeof thing) {
        case "bigint":
            return "number/bigint";
        case "number":
            return "number/native";
        case "boolean":
            return "boolean";
        case "string":
            return "string";
        case "symbol":
            return "symbol";
        case "undefined":
            return "nullish/undefined";
        // fall through to function | object handling...
    }
    if (typeof thing === "function") {
        if (thing.constructor?.name === "GeneratorFunction") return "function/generator";
        if (thing.constructor?.name === "AsyncFunction") return "function/async";
        return "function/plain";
    }
    if (Array.isArray(thing)) return "array";
    if (thing instanceof Date) return "date";
    if (thing instanceof Set) return "set";
    if (thing instanceof Map) return "map";
    if (thing instanceof RegExp) return "regexp";
    if (thing instanceof WeakSet) return "weakset";
    if (thing instanceof WeakMap) return "weakmap";
    if (thing instanceof Promise) return "promise";
    if (thing instanceof Error) return "error";
    if (thing instanceof ArrayBuffer) return "arraybuffer";
    if (thing instanceof Int8Array) return "typedarray/int8";
    if (thing instanceof Uint8Array) return "typedarray/uint8";
    if (thing instanceof Int16Array) return "typedarray/int16";
    if (thing instanceof Uint16Array) return "typedarray/uint16";
    if (thing instanceof Int32Array) return "typedarray/int32";
    if (thing instanceof Uint32Array) return "typedarray/uint32";
    if (thing instanceof Float32Array) return "typedarray/float32";
    if (thing instanceof Float64Array) return "typedarray/float64";
    if (thing instanceof DataView) return "dataview";
    if (thing instanceof SharedArrayBuffer) return "sharedarraybuffer";

    if ((globalThis as any)?.HTMLElement && thing instanceof (globalThis as any)?.HTMLElement) {
        return `dom/${thing.tagName.toLowerCase()}`;
    }
    if ((globalThis as any)?.Node && thing instanceof (globalThis as any)?.Node) {
        return "dom/node";
    }
    if (typeof thing?.[TrhSymbols.TypeOf] === "function") {
        const strType = thing[TrhSymbols.TypeOf]();
        if (typeof strType === "string") {
            return strType;
        }
    }
    if (typeof thing?.typeOf === "function") {
        const strType = thing?.typeOf();
        if (typeof strType === "string") {
            return strType.toLowerCase();
        }
    }
    const strTag = thing?.[Symbol.toStringTag];
    if (typeof strTag === "string") {
        return strTag.toLowerCase();
    }

    const proto = Object.getPrototypeOf(thing);
    if (proto === null || Object.prototype === proto || Object.getPrototypeOf(proto) === null) {
        return "object/plain";
    }
    // anything else
    return "unknown";
};

// Tri-state logic utilities for handling type exclusions
export function applyTriStateFilter(items: any[], results: TriState[]): { included: any[]; excluded: any[] } {
    const included: any[] = [];
    const excluded: any[] = [];

    for (let i = 0; i < items.length; i++) {
        const result = results[i];
        if (result === true) {
            included.push(items[i]);
        } else if (result === false || result === null) {
            // Both false and null are excluded, but null means "meaningless comparison"
            excluded.push(items[i]);
        }
    }

    return { included, excluded };
}

// Check if a type should be excluded from string operations
export function isExcludedFromStringOps(value: any): boolean {
    if (value === null || value === undefined) return true;

    switch (typeof value) {
        case "string":
        case "number":
        case "bigint":
            return false;
        case "boolean":
            return true; // Booleans are excluded
        case "object":
            if (Array.isArray(value)) return true; // Arrays are excluded

            // Check for custom toString
            if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
                return false; // Custom toString objects are included
            }
            return true; // Objects with default toString are excluded
        default:
            return true;
    }
}

// Apply type exclusion rules for different operator categories
export function shouldExcludeFromOperation(value: any, operatorCategory: string): boolean {
    switch (operatorCategory) {
        case "string":
            return isExcludedFromStringOps(value);
        case "comparison":
            // Comparison operations exclude values that would result in NaN
            return false; // Let the operator function handle NaN detection
        case "array":
            return !Array.isArray(value);
        case "type":
            return false; // Type operations work on all values
        default:
            return false;
    }
}

// Normalize tri-state results for consistent handling
export function normalizeTriState(value: boolean | null | undefined): TriState {
    if (value === null || value === undefined) return null;
    return Boolean(value);
}

// Get nested property value with dot notation support
export function getNestedProperty(obj: any, path: string): any {
    if (obj === null || obj === undefined) return undefined;

    const parts = path.split(".");
    let current = obj;

    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }

    return current;
}

// Helper function to normalize array indices (handles negative indices)
export function normalizeArrayIndex(index: number, length: number): number {
    return index < 0 ? length + index : index;
}