import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthUser, hashPassword, verifyPassword } from "../auth.js";
import { serializeUser } from "../db.js";

const credentialSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/register", async (request, reply) => {
    const parsed = credentialSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid payload" });
    }

    const existing = await app.db.collections.users.findOne({ email: parsed.data.email });
    if (existing) {
      return reply.code(409).send({ message: "User already exists" });
    }

    const user = {
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      createdAt: new Date()
    };

    const result = await app.db.collections.users.insertOne(user);
    const created = await app.db.collections.users.findOne({ _id: result.insertedId });
    if (!created) {
      return reply.code(500).send({ message: "Failed to create user" });
    }

    const token = await reply.jwtSign({
      userId: created._id.toHexString(),
      email: created.email
    });

    return { token, user: serializeUser(created) };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = credentialSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid payload" });
    }

    const user = await app.db.collections.users.findOne({ email: parsed.data.email });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ message: "Invalid credentials" });
    }

    const token = await reply.jwtSign({
      userId: user._id.toHexString(),
      email: user.email
    });

    return { token, user: serializeUser(user) };
  });

  app.get("/api/auth/me", { preHandler: app.authenticate }, async (request) => {
    const authUser = getAuthUser(request);
    const user = await app.db.collections.users.findOne({ email: authUser.email });
    if (!user) {
      return { user: null };
    }

    return { user: serializeUser(user) };
  });
}
