import { JsonCodec } from "./codec/jsonCodec";
import { CollectionDB } from "./db/collectionDB";

type Resource = {
    name: string;
};

const resources = new CollectionDB<Resource>(new JsonCodec(".dev/resources.json"));

const doTheThing = async () => {
    await resources.load();
    await resources.insert("abc123", { name: "Bob" });
    const bob = await resources.where(($) => [$("name"), "=", "Bob"]).get();

    console.log(bob);
};

doTheThing()
    .then(() => {
        console.log("done");
    })
    .catch((e) => {
        console.error(e);
    });
