import { createError, defineEventHandler, readBody } from "h3";
import { query } from "../../utils/database";
import { publicUser, requireUser, type DbUser } from "../../utils/auth";
import { profileSchema, parseInput } from "../../utils/schemas";
export default defineEventHandler(async (event) => {
  const user = requireUser(event),
    input = parseInput(profileSchema, await readBody<unknown>(event));
  try {
    return {
      user: publicUser(
        (
          await query<DbUser>(
            "UPDATE users SET name=$1,email=$2 WHERE id=$3 RETURNING *",
            [input.name, input.email, user.id],
          )
        ).rows[0]!,
      ),
    };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    )
      throw createError({
        statusCode: 409,
        statusMessage: "Email already registered",
        data: { message: "Эта почта уже используется" },
      });
    throw error;
  }
});
