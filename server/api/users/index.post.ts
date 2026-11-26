import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { requireRole } from "../../utils/auth";
import { saveUser } from "../../utils/catalogs";
import { userSchema, parseInput } from "../../utils/schemas";
export default defineEventHandler(async (event) => {
  requireRole(event, ["Admin"]);
  const input = parseInput(userSchema, await readBody<unknown>(event));
  const data = await saveUser(input);
  setResponseStatus(event, 201);
  return { data };
});
