import { defineEventHandler } from "h3";
import { requireUser } from "../../utils/auth";
import { listCustomers } from "../../utils/catalogs";
export default defineEventHandler(async (event) => ({
  data: await listCustomers(requireUser(event)),
}));
