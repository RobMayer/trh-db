import { DocumentDB, DocumentOf, DocumentPipeline } from "../src/db/documentDB";

// ------------------------------------------------------------
// Test Data Shape
// ------------------------------------------------------------

type User = { name: string; age: number; active: boolean };
declare const db: DocumentDB<User>;

// ------------------------------------------------------------
// Chain Starters
// ------------------------------------------------------------

const byId: DocumentPipeline<User, "single"> = db.select("abc");
const byIds: DocumentPipeline<User, "multi"> = db.select(["a", "b"]);
const filtered: DocumentPipeline<User, "multi"> = db.where(($) => [$("age"), ">", 18]);
const everything: DocumentPipeline<User, "multi"> = db.all();

// ------------------------------------------------------------
// Pipeline Chaining
// ------------------------------------------------------------

const chain: DocumentPipeline<User, "multi"> = db
    .where(($) => [$("active"), "?"])
    .sort(($) => $("name"), "asc")
    .slice(0, 10);

const paginated: DocumentPipeline<User, "multi"> = db.all().paginate(1, 25);
const deduped: DocumentPipeline<User, "multi"> = db.all().distinct();

// ------------------------------------------------------------
// Cardinality Reduction
// ------------------------------------------------------------

const first: DocumentPipeline<User, "single"> = db.where(($) => [$("age"), ">", 18]).first();
const last: DocumentPipeline<User, "single"> = db.all().last();
const atIdx: DocumentPipeline<User, "single"> = db.all().at(3);

// ------------------------------------------------------------
// Read Terminals
// ------------------------------------------------------------

const items: Promise<DocumentOf<User>[]> = db.all().get();
const one: Promise<DocumentOf<User> | undefined> = db.select("abc").get();
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
const updated: Promise<DocumentOf<User> | undefined> = db.select("abc").update({ name: "New", age: 30, active: true });

// Updater function
const updatedFn: Promise<DocumentOf<User>[]> = db.where(($) => [$("active"), "?"]).update((prev, ctx) => ({ ...prev, age: prev.age + 1 }));

// Remove
const removed: Promise<DocumentOf<User>[]> = db.where(($) => [$("active"), "!?"]).remove();
const removedOne: Promise<DocumentOf<User> | undefined> = db.select("abc").remove();

// ------------------------------------------------------------
// Write Terminals — Lens-Targeted
// ------------------------------------------------------------

const lensUpdate: Promise<DocumentOf<User> | undefined> = db.select("abc").update(($) => $("age"), 31);
const lensUpdateFn: Promise<DocumentOf<User> | undefined> = db.select("abc").update(
    ($) => $("age"),
    (prev) => prev + 1,
);

// ------------------------------------------------------------
// Direct Methods
// ------------------------------------------------------------

const getOne: DocumentOf<User> | undefined = db.get("abc");
const getMany: DocumentOf<User>[] = db.get(["a", "b"]);
const insertOne: Promise<void> = db.insert("abc", { name: "Alice", age: 30, active: true });
const insertMany: Promise<void> = db.insert({ abc: { name: "Alice", age: 30, active: true } });
const removeOne: Promise<void> = db.remove("abc");
const removeMany: Promise<void> = db.remove(["a", "b"]);
