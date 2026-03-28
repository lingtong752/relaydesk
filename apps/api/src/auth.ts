import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ message: "Unauthorized" });
  }
}

export function getAuthUser(request: FastifyRequest): { userId: string; email: string } {
  return request.user as { userId: string; email: string };
}
