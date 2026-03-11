import { LogicBuilder, LogicExpression, PredicateSpec } from "../types";

/**
 * Creates a LogicBuilder instance for constructing OR/AND/XOR/NOT predicate combinations
 */
export function createLogicBuilder(): LogicBuilder {
    const builder: LogicBuilder = {
        and(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression {
            return {
                type: "and",
                predicates: predicates
            };
        },

        or(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression {
            return {
                type: "or", 
                predicates: predicates
            };
        },

        xor(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression {
            return {
                type: "xor",
                predicates: predicates
            };
        },

        not: {
            and(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression {
                return {
                    type: "not-and",
                    predicates: predicates
                };
            },

            or(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression {
                return {
                    type: "not-or",
                    predicates: predicates
                };
            },

            xor(...predicates: (PredicateSpec | LogicExpression)[]): LogicExpression {
                return {
                    type: "not-xor",
                    predicates: predicates
                };
            }
        }
    };

    return builder;
}

/**
 * Type guard to check if a value is a LogicExpression
 */
export function isLogicExpression(predicate: any): predicate is LogicExpression {
    return predicate && typeof predicate === "object" && 
           ["and", "or", "xor", "not-and", "not-or", "not-xor"].includes(predicate.type) &&
           Array.isArray(predicate.predicates);
}

/**
 * Type guard to check if a value is a PredicateSpec
 */
export function isPredicateSpec(spec: any): spec is PredicateSpec {
    return Array.isArray(spec) && spec.length === 3 &&
           typeof spec[1] === "string" && // operator
           spec[2] !== undefined; // operand
}