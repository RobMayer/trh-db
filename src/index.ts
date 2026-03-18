import { TrhCodec } from "./codec/trhCodec";
import { DocumentDB } from "./db/documentDB";

type Resource = {
    name: string;
};

const resources = new DocumentDB<Resource>(new TrhCodec(".dev/resources.trhdb"));

const doTheThing = async () => {
    await resources.load();
    await resources.insert({ name: "Bob" });
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
