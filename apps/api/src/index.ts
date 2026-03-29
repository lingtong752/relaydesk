import { env } from "./env.js";
import { createApp } from "./app.js";

const app = await createApp();

await app.listen({ host: "0.0.0.0", port: env.PORT });

app.log.info(`API server listening on ${env.PORT}`);
