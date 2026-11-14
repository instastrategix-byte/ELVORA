import { z } from "zod";

export const idParams = z.object({ id: z.uuid({ error: "Invalid id" }) });
export const userIdParams = z.object({ userId: z.uuid({ error: "Invalid id" }) });
