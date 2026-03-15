import { Codec } from "../types";

type Jsonable = string | number | boolean | null | Jsonable[] | { [key: string]: Jsonable };

// todo
export class JsonCodec<I extends Jsonable, D extends Jsonable> implements Codec<I, D> {
    #file: string;

    constructor(file: string) {
        this.#file = file;
    }

    update: (items: I[], data: D) => Promise<void> = async () => {};
    insert: (items: I[], data: D) => Promise<void> = async () => {};
    delete: (items: I[], data: D) => Promise<void> = async () => {};
    load: () => Promise<D> = async () => {
        return {} as any;
    };
    flush: (data: D) => Promise<void> = async () => {};
}
