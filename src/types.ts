export type CodecData<D> = () => { [id: string]: D };

export type Codec<D extends { id: string; data: any }, M extends DBMeta<any> = DBMeta<null>> = {
    update: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    insert: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    delete: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    struct: (items: D[], data: CodecData<D>, meta: M | null) => Promise<void>;
    load: () => Promise<[data: { [id: string]: D }, meta: M | null]>;
    flush: (data: CodecData<D>, meta: M | null) => Promise<void>;
    setMeta: (value: M | null, data: CodecData<D>) => Promise<void>;
};

export type DBMeta<U> = { user: U; type: string; version: number };

export type ListOf<D> = Set<D> | D[];
export type ListOr<D> = D | ListOf<D>;
export type Updater<T, C> = T | ((prev: T, context: C) => T);
