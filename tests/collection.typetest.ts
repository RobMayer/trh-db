import { CollectionMemberOf } from "../src/types";
import { CollectionDB, CollectionPipeline } from "../src/db/collectionDB";

// ------------------------------------------------------------
// Test Data Shape
// ------------------------------------------------------------

type User = { name: string; age: number; active: boolean };
declare const db: CollectionDB<User>;

// ------------------------------------------------------------
// Chain Starters
// ------------------------------------------------------------

const byId: CollectionPipeline<User, "single"> = db.select("abc");
const byIds: CollectionPipeline<User, "multi"> = db.select(["a", "b"]);
const filtered: CollectionPipeline<User, "multi"> = db.where(($) => [$("age"), ">", 18]);
const everything: CollectionPipeline<User, "multi"> = db.all();

// ------------------------------------------------------------
// Pipeline Chaining
// ------------------------------------------------------------

const chain: CollectionPipeline<User, "multi"> = db
    .where(($) => [$("active"), "?"])
    .sort(($) => $("name"), "asc")
    .slice(0, 10);

const paginated: CollectionPipeline<User, "multi"> = db.all().paginate(1, 25);
const deduped: CollectionPipeline<User, "multi"> = db.all().distinct();

// ------------------------------------------------------------
// Cardinality Reduction
// ------------------------------------------------------------

const first: CollectionPipeline<User, "single"> = db.where(($) => [$("age"), ">", 18]).first();
const last: CollectionPipeline<User, "single"> = db.all().last();
const atIdx: CollectionPipeline<User, "single"> = db.all().at(3);

// ------------------------------------------------------------
// Read Terminals
// ------------------------------------------------------------

const items: Promise<CollectionMemberOf<User>[]> = db.all().get();
const one: Promise<CollectionMemberOf<User> | undefined> = db.select("abc").get();
const cnt: Promise<number> = db.all().count();
const ex: Promise<boolean> = db.select("abc").exists();
const ids: Promise<string[]> = db.all().id();
const singleId: Promise<string | undefined> = db.select("abc").id();

// ------------------------------------------------------------
// $.ID Meta Accessor
// ------------------------------------------------------------

const byMeta = db.where(($) => [$.ID, "%", "user-"]);

// ------------------------------------------------------------
// Write Terminals — Whole-Data
// ------------------------------------------------------------

// Static value
const updated: Promise<CollectionMemberOf<User> | undefined> = db.select("abc").update({ name: "New", age: 30, active: true });

// Updater function
const updatedFn: Promise<CollectionMemberOf<User>[]> = db.where(($) => [$("active"), "?"]).update((prev, ctx) => ({ ...prev, age: prev.age + 1 }));

// Remove
const removed: Promise<CollectionMemberOf<User>[]> = db.where(($) => [$("active"), "!?"]).remove();
const removedOne: Promise<CollectionMemberOf<User> | undefined> = db.select("abc").remove();

// ------------------------------------------------------------
// Write Terminals — Lens-Targeted
// ------------------------------------------------------------

const lensUpdate: Promise<CollectionMemberOf<User> | undefined> = db.select("abc").update(($) => $("age"), 31);
const lensUpdateFn: Promise<CollectionMemberOf<User> | undefined> = db.select("abc").update(
    ($) => $("age"),
    (prev) => prev + 1,
);

// ------------------------------------------------------------
// Direct Methods
// ------------------------------------------------------------

const getOne: Promise<CollectionMemberOf<User> | undefined> = db.get("abc");
const getMany: Promise<CollectionMemberOf<User>[]> = db.get(["a", "b"]);
const insertOne: Promise<CollectionMemberOf<User>> = db.insert("abc", { name: "Alice", age: 30, active: true });
const insertMany: Promise<CollectionMemberOf<User>[]> = db.insert({ abc: { name: "Alice", age: 30, active: true } });
const removeOne: Promise<CollectionMemberOf<User> | undefined> = db.remove("abc");
const removeMany: Promise<CollectionMemberOf<User>[]> = db.remove(["a", "b"]);
