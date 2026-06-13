import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { extname } from 'path';
import { captureEvent, Events } from '../../services/analytics/posthog';
import { usageEnforcer } from '../../services/subscription/usage-enforcer';

const knowledgeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List documents
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const documents = await fastify.prisma.knowledgeDocument.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, type: true, fileType: true, createdAt: true },
    });
    return { success: true, data: documents };
  });

  // Get document
  fastify.get('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const doc = await fastify.prisma.knowledgeDocument.findFirst({ where: { id, userId } });
    if (!doc) return reply.status(404).send({ success: false, error: 'Document not found' });
    return { success: true, data: doc };
  });

  // Create document
  fastify.post('/', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      title: z.string().min(1),
      type: z.enum(['faq', 'product', 'pricing', 'policy', 'script']),
      content: z.string().min(1),
    });
    const body = schema.parse(request.body);

    // Check usage limit
    const sub = await fastify.prisma.subscription.findUnique({ where: { userId } });
    const periodStart = sub?.currentPeriodStart || new Date(0);
    const check = await usageEnforcer.checkLimit(fastify.prisma, userId, 'knowledge_docs', periodStart);
    if (!check.allowed) {
      return reply.status(403).send({ success: false, error: 'Document limit reached. Upgrade to store more documents.' });
    }

    const doc = await fastify.prisma.knowledgeDocument.create({
      data: { userId, ...body },
    });

    // Record usage
    await usageEnforcer.recordUsage(fastify.prisma, userId, 'knowledge_docs');

    captureEvent(userId, Events.KNOWLEDGE_UPLOADED, {
      docId: doc.id,
      docType: body.type,
      method: 'manual',
    });

    return { success: true, data: doc };
  });

  // Update document
  fastify.put('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      title: z.string().optional(),
      type: z.enum(['faq', 'product', 'pricing', 'policy', 'script']).optional(),
      content: z.string().optional(),
    });
    const body = schema.parse(request.body);
    
    const doc = await fastify.prisma.knowledgeDocument.findFirst({ where: { id, userId } });
    if (!doc) return reply.status(404).send({ success: false, error: 'Document not found' });
    
    const updated = await fastify.prisma.knowledgeDocument.update({ where: { id }, data: body });
    return { success: true, data: updated };
  });

  // Delete document
  fastify.delete('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    
    const doc = await fastify.prisma.knowledgeDocument.findFirst({ where: { id, userId } });
    if (!doc) return reply.status(404).send({ success: false, error: 'Document not found' });
    
    await fastify.prisma.knowledgeDocument.delete({ where: { id } });
    return { success: true, data: { deleted: true } };
  });

  // Upload file — accepts multipart file, extracts text content, stores as document
  fastify.post('/upload', async (request, reply) => {
    const { userId } = await (request as any).authenticate();

    let file;
    try {
      file = await request.file();
    } catch (err) {
      return reply.status(400).send({ success: false, error: 'Invalid file upload — please check the file and try again' });
    }
    if (!file) {
      return reply.status(400).send({ success: false, error: 'No file provided' });
    }

    // Check usage limit
    const sub = await fastify.prisma.subscription.findUnique({ where: { userId } });
    const periodStart = sub?.currentPeriodStart || new Date(0);
    const check = await usageEnforcer.checkLimit(fastify.prisma, userId, 'knowledge_docs', periodStart);
    if (!check.allowed) {
      return reply.status(403).send({ success: false, error: 'Document limit reached. Upgrade to store more documents.' });
    }

    const ext = extname(file.filename).toLowerCase();
    const supportedExts = ['.txt', '.md', '.csv', '.json', '.xml', '.html'];
    if (!supportedExts.includes(ext)) {
      // For unsupported file types, store as link-only document
      const doc = await fastify.prisma.knowledgeDocument.create({
        data: {
          userId,
          title: file.filename,
          type: 'faq',
          content: `File: ${file.filename} (${ext} format — content not extractable. Upload as .txt or .md for full processing.)`,
          fileType: ext.slice(1),
        },
      });

      // Record usage
      await usageEnforcer.recordUsage(fastify.prisma, userId, 'knowledge_docs');

      captureEvent(userId, Events.KNOWLEDGE_UPLOADED, {
        docId: doc.id,
        docType: 'faq',
        method: 'upload',
        fileType: ext,
        extracted: false,
      });

      return { success: true, data: doc };
    }

    // Read file content from stream
    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const content = buffer.toString('utf-8').trim();

    if (!content) {
      return reply.status(400).send({ success: false, error: 'File appears to be empty' });
    }

    // Auto-detect type from content/keywords
    const lower = content.toLowerCase();
    let docType = 'faq';
    if (lower.includes('price') || lower.includes('pricing') || lower.includes('cost') || lower.includes('plan')) {
      docType = 'pricing';
    } else if (lower.includes('product') || lower.includes('feature') || lower.includes('service')) {
      docType = 'product';
    } else if (lower.includes('policy') || lower.includes('terms') || lower.includes('refund')) {
      docType = 'policy';
    }

    // Extract title from first line or filename
    const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim();
    const title = firstLine && firstLine.length < 80 ? firstLine : file.filename.replace(ext, '');

    const doc = await fastify.prisma.knowledgeDocument.create({
      data: {
        userId,
        title: title,
        type: docType,
        content: content,
        fileType: ext.slice(1),
      },
    });

    // Record usage
    await usageEnforcer.recordUsage(fastify.prisma, userId, 'knowledge_docs');

    captureEvent(userId, Events.KNOWLEDGE_UPLOADED, {
      docId: doc.id,
      docType,
      method: 'upload',
      fileType: ext,
      extracted: true,
      contentLength: content.length,
    });

    return { success: true, data: doc };
  });
};

export default knowledgeRoutes;
