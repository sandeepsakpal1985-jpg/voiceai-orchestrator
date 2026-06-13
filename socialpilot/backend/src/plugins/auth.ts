import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    authenticate: () => Promise<{ userId: string; email: string }>;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Instance-level preHandler hook — used for route-level authentication
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
  });

  // Request-level decorator — used inside route handlers
  fastify.decorateRequest('authenticate', async function () {
    await this.jwtVerify();
    return { userId: (this as any).user.id, email: (this as any).user.email };
  });
};

export default fp(authPlugin);
