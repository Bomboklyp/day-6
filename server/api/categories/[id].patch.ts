import { defineEventHandler, readBody, getRouterParam } from "h3";
import { requireRole } from "../../utils/auth";
import { saveCatalog } from "../../utils/catalogs";
import { catalogSchema, parseInput } from "../../utils/schemas";
export default defineEventHandler(async (event) => {
  requireRole(event, ["Admin"]);
  const input = parseInput(catalogSchema, await readBody<unknown>(event));
  const data = await saveCatalog(
    "categories",
    input.name,
    getRouterParam(event, "id"),
  );
  return { data };
});
