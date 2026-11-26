import { defineEventHandler } from "h3";
import { requireUser } from "../../utils/auth";
import { listUsers } from "../../utils/catalogs";
export default defineEventHandler(async (event) => ({
  data: await listUsers(requireUser(event)),
}));
