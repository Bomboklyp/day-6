import { defineEventHandler, getRouterParam } from "h3";
import { requireUser } from "../../utils/auth";
import { readRequest, requestId } from "../../utils/requests";
export default defineEventHandler((event) =>
  readRequest(requestId(getRouterParam(event, "id")), requireUser(event)),
);
