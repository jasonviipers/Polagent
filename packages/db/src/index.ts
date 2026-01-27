import { env } from "@polagent/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

// biome-ignore lint/performance/noNamespaceImport: Drizzle schema requires namespace object
import * as schema from "./schema";

export const db = drizzle(env.DATABASE_URL, { schema });
