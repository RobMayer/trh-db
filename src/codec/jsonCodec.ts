import { Codec } from "../types";

//temporary?

type Parser = (token: any) => any;
type Serializer = (value: any) => any;

const MARKER = "\x01"; // Start of Header

export class JsonCodec implements Codec {
    #transformers: { [sigil: string]: { parser: Parser; serializer: Serializer } } = {};

    constructor() {
        this.#transformers = {};
        this.register<number, boolean>(
            "core.nan",
            () => NaN,
            (value) => (isNaN(value) ? true : undefined),
        );
        this.register<number, -1 | 1>(
            "core.inf",
            (token) => (token === 1 ? Infinity : -Infinity),
            (value) => (typeof value === "number" && !isFinite(value) && !isNaN(value) ? (Math.sign(value) as -1 | 1) : undefined),
        );
        this.register<bigint>(
            "core.bigint",
            (token) => BigInt(token),
            (value) => (typeof value === "bigint" ? `${value}` : undefined),
        );
        this.register<Date>(
            "core.date",
            (token) => new Date(token),
            (value) => (value instanceof Date ? value.toISOString() : undefined),
        );
        this.register<RegExp, { source: string; flags: string }>(
            "core.regex",
            ({ source, flags }) => new RegExp(source, flags),
            (value) => (value instanceof RegExp ? { source: value.source, flags: value.flags } : undefined),
        );
        this.register<Set<unknown>, unknown[]>(
            "core.set",
            (token) => new Set(token),
            (value) => (value instanceof Set ? [...value] : undefined),
        );
        this.register<Map<unknown, unknown>, { key: unknown; value: unknown }[]>(
            "core.map",
            (token) => token.reduce((acc, { key, value }) => acc.set(key, value), new Map()),
            (value) => {
                if (value instanceof Map) {
                    const m: { key: unknown; value: unknown }[] = [];
                    value.forEach((v, k) => {
                        m.push({ key: k, value: v });
                    });
                    return m;
                }
                return undefined;
            },
        );
    }

    register = <S, T = string>(sigil: string, parser: (value: T) => S, serializer: (value: S) => T | undefined) => {
        if (!(sigil in this.#transformers)) {
            this.#transformers[sigil] = {
                parser,
                serializer,
            };
        }
    };

    supported = () => {
        return Object.keys(this.#transformers);
    };

    serialize = (value: unknown) => {
        const t = Object.entries(this.#transformers).reduce<undefined | { [key: string]: unknown }>((acc, [sigil, { serializer }]) => {
            if (acc !== undefined) {
                return acc;
            }
            const v = serializer(value);
            if (v !== undefined) {
                return { [`${MARKER}${sigil}`]: v };
            }
        }, undefined);

        return t !== undefined ? t : value;
    };

    parse = (value: unknown) => {
        if (value === null) {
            return null;
        }
        if (typeof value === "object") {
            const keys = Object.keys(value);
            if (keys.length === 1) {
                const theKey = keys[0];
                const sigil = theKey.slice(1);
                if (theKey.startsWith(MARKER) && sigil in this.#transformers) {
                    const v = value[theKey as keyof typeof value];
                    return this.#transformers[sigil].parser(v) ?? value;
                }
            }
        }
        // handle all your remaining cases
        return value;
    };
}
