import { Predicate } from "./predicate";

// Result of a combinator expression — opaque marker type
declare const PREDICATE_BRAND: unique symbol;
export type PredicateResult = { readonly [PREDICATE_BRAND]: true };

export type LogicalOps = {
    or(...conditions: (Predicate<any> | PredicateResult)[]): PredicateResult;
    and(...conditions: (Predicate<any> | PredicateResult)[]): PredicateResult;
    not(condition: Predicate<any> | PredicateResult): PredicateResult;
    xor(...conditions: (Predicate<any> | PredicateResult)[]): PredicateResult;
};
