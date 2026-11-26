import { defineEventHandler, getQuery } from "h3";
import { requireUser } from "../../utils/auth";
import { readRequest, requestId } from "../../utils/requests";
export default defineEventHandler(async (event) => {
  const request = await readRequest(
    requestId(String(getQuery(event).request_id ?? "")),
    requireUser(event),
  );
  return { data: request.data.comments ?? [] };
});
