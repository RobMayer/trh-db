import { get } from "./get";
import { update } from "./update";
import { lensKit } from "./kit";
import { createLensBuilder } from "./lib/ast";

export { get, lensKit, update };
export const lens = createLensBuilder;
