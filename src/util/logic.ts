import { Predicate } from "./predicate";

// Result of a combinator expression — opaque marker type
declare const PREDICATE_BRAND: unique symbol;
export type PredicateResult = { readonly [PREDICATE_BRAND]: true };

// Each combinator argument can be a predicate tuple OR a nested PredicateResult
type CombinatorArg<T> = T extends PredicateResult ? T : Predicate<T>;

export type CombinatorFn = {
    or<Tuples extends (Predicate<any> | PredicateResult)[]>(...conditions: { [K in keyof Tuples]: CombinatorArg<Tuples[K]> }): PredicateResult;
    and<Tuples extends (Predicate<any> | PredicateResult)[]>(...conditions: { [K in keyof Tuples]: CombinatorArg<Tuples[K]> }): PredicateResult;
    not<T extends Predicate<any> | PredicateResult>(condition: CombinatorArg<T>): PredicateResult;
    xor<Tuples extends (Predicate<any> | PredicateResult)[]>(...conditions: { [K in keyof Tuples]: CombinatorArg<Tuples[K]> }): PredicateResult;
};
