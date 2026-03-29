declare module "bcryptjs";

import type { FastifyReply, FastifyRequest } from "fastify";
import type { Database } from "./db.js";
import type { CliSessionRunner } from "./services/cliSessionRunner.js";
import { StreamRegistry } from "./services/mockStreams.js";
import { TerminalManager } from "./services/terminalManager.js";
import { SessionHub } from "./ws/sessionHub.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    hub: SessionHub;
    cliSessionRunner: CliSessionRunner;
    streamRegistry: StreamRegistry;
    terminalManager: TerminalManager;
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
