import { Comparable } from "../types";
import { QueryLens, QueryLensOf } from "./lens/types";

// --- Operator catalog ---

// Equality: any type
type EqualityOp = "=" | "!=" | "==" | "!==";

// Ordering: number, bigint, string, or Comparable
type OrderingOp = ">" | "!>" | ">=" | "!>=" | "<" | "!<" | "<=" | "!<=";

// Any-of equality: value matches any/none in array
type EqualityAnyOfOp = "=|" | "!=|";

// Range: 4-member predicates only
type RangeOp = "><" | "!><" | ">=<" | "!>=<";

// String: contains, starts/ends with, case sensitive/insensitive
type StringContainsOp = "%" | "!%" | "%^" | "!%^";
type StringStartsWithOp = "%_" | "!%_" | "%^_" | "!%^_";
type StringEndsWithOp = "_%" | "!_%" | "_%^" | "!_%^";
type StringAnyOfOp = "%|" | "!%|" | "%^|" | "!%^|" | "%_|" | "!%_|" | "_%|" | "!_%|";
type StringAllOfOp = "%&" | "!%&" | "%^&" | "!%^&";
type StringOp = StringContainsOp | StringStartsWithOp | StringEndsWithOp;

// Regex: match against RegExp
type RegexOp = "~" | "!~";
type RegexAnyOfOp = "~|" | "!~|";
type RegexAllOfOp = "~&" | "!~&";

// Array has: array contains element(s)
type HasOp = "#" | "!#";
type HasAnyOfOp = "#|" | "!#|";
type HasAllOfOp = "#&" | "!#&";

// Typeof: runtime type check (RHS is string, not a closed union — users can register custom type descriptors)
type TypeofOp = ":" | "!:";
type TypeofAnyOfOp = ":|" | "!:|";

// --- Operator → type mapping (parameterized by arity) ---

// Unary: no operand (truthiness check)
type UnaryOp = "?" | "!?";

// A = 2: unary ops; A = 3: standard ops; A = 4: range ops only
export type OperatorFor<O, A extends 2 | 3 | 4> = A extends 4
    ? O extends number | bigint | string | Comparable
        ? RangeOp
        : never
    : A extends 2
      ? UnaryOp
      : // A extends 3
            | EqualityOp
            | EqualityAnyOfOp
            | TypeofOp
            | TypeofAnyOfOp
            | (O extends number | bigint | string | Comparable ? OrderingOp : never)
            | (O extends string ? StringOp | StringAnyOfOp | StringAllOfOp | RegexOp | RegexAnyOfOp | RegexAllOfOp : never)
            | (O extends any[] ? HasOp | HasAnyOfOp | HasAllOfOp : never);

// --- Operand type mapping ---

// Ops that take an array of values as RHS (any-of / all-of)
type AnyOfOp = EqualityAnyOfOp | StringAnyOfOp | StringAllOfOp | RegexAnyOfOp | RegexAllOfOp | HasAnyOfOp | HasAllOfOp | TypeofAnyOfOp;

// Map from operator to valid operand type
export type OperandFor<O, Op> =
    // Typeof: RHS is string
    Op extends TypeofOp
        ? string
        : Op extends TypeofAnyOfOp
          ? string[]
          : // Regex: RHS is RegExp
            Op extends RegexOp
            ? RegExp
            : Op extends RegexAnyOfOp | RegexAllOfOp
              ? RegExp[]
              : // Array contains: RHS is element type
                Op extends HasOp
                ? O extends (infer E)[]
                    ? E | QueryLens<E>
                    : never
                : Op extends HasAnyOfOp | HasAllOfOp
                  ? O extends (infer E)[]
                      ? (E | QueryLens<E>)[]
                      : never
                  : // Any-of / all-of: RHS is array of O
                    Op extends AnyOfOp
                    ? (O | QueryLens<O>)[]
                    : // Default: RHS is O
                          O | QueryLens<O>;

// --- The Predicate tuple ---

export type Predicate<O> =
    | [subject: O | QueryLensOf<O>, op: NoInfer<OperatorFor<O, 2>>]
    | [subject: O | QueryLensOf<O>, op: NoInfer<OperatorFor<O, 3>>, operand: NoInfer<OperandFor<O, OperatorFor<O, 3>>> | QueryLensOf<any>]
    | [
          subject: O | QueryLensOf<O>,
          op: NoInfer<OperatorFor<O, 4>>,
          operand1: NoInfer<OperandFor<O, OperatorFor<O, 4>>> | QueryLensOf<any>,
          operand2: NoInfer<OperandFor<O, OperatorFor<O, 4>>> | QueryLensOf<any>,
      ];
