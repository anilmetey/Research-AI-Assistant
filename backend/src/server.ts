import express, { Express, Request, Response, NextFunction } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import pino from 'pino';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OllamaEmbeddings, ChatOllama } from '@langchain/ollama';
import Queue from 'bull';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Initialize
const app: Express = express();
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const logger = pino({ transport: { target: 'pino-pretty' } });

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json({ limit: '50mb' }));

// Types
interface AuthRequest extends Request {
  userId?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'research_assistant_secret_2024';

// ─────────────────────────────────────
// AUTH ROUTES (public)
// ─────────────────────────────────────

// Register
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, şifre ve isim gerekli' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Bu email zaten kayıtlı' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, password: hashed, name } });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: 'Kayıt başarısız' });
  }
});

// Login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email ve şifre gerekli' });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Email veya şifre hatalı' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Email veya şifre hatalı' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: 'Giriş başarısız' });
  }
});

// JWT Auth Middleware (applied to all routes below)
const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Giriş yapmanız gerekiyor' });
  }
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
  }
};

app.use('/api/conversations', authMiddleware);
app.use('/api/documents', authMiddleware);

// ─────────────────────────────────────
// 1. DOCUMENT UPLOAD & INDEXING
// ─────────────────────────────────────

const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

const embeddings = new OllamaEmbeddings({
  baseUrl: ollamaUrl,
  model: 'gemma3:1b'
});

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '.', ' ', '']
});

const indexQueue = new Queue('document-indexing', {
  redis: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

app.post('/api/documents/upload', async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, fileUrl } = req.body;
    const userId = req.userId!;

    // Create document
    const document = await prisma.document.create({
      data: {
        userId,
        title,
        content,
        fileUrl,
        mimeType: 'text/plain'
      }
    });

    // Queue indexing job (async)
    await indexQueue.add({
      documentId: document.id,
      content
    });

    res.json({
      success: true,
      documentId: document.id,
      message: 'Indexing started...'
    });

  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

indexQueue.process(async (job) => {
  const { documentId, content } = job.data;
  logger.info(`Indexing document: ${documentId}`);

  try {
    const chunks = await textSplitter.splitText(content);
    
    // Process chunks sequentially or in small batches to avoid overwhelming local Ollama
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await embeddings.embedQuery(chunk);
      
      const chunkData = {
        documentId,
        chunkIndex: i,
        content: chunk,
        embedding: JSON.stringify(embedding),
        tokenCount: Math.ceil(chunk.length / 4)
      };

      await prisma.documentChunk.create({ data: chunkData });
      
      const cacheKey = `embedding:${documentId}:${i}`;
      await redis.setex(cacheKey, 86400, JSON.stringify(embedding));
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { chunkCount: chunks.length, indexedAt: new Date() }
    });

    logger.info(`Document indexed: ${documentId} (${chunks.length} chunks)`);
  } catch (err) {
    logger.error({ err }, `Error indexing document ${documentId}:`);
    throw err;
  }
});

// ─────────────────────────────────────
// 2. SEMANTIC SEARCH + RAG
// ─────────────────────────────────────

interface RAGResult {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
}

async function semanticSearch(
  query: string,
  documentIds: string[],
  topK: number = 5
): Promise<RAGResult[]> {
  const queryEmbedding = await embeddings.embedQuery(query);

  const results = await prisma.$queryRaw<RAGResult[]>`
    SELECT 
      dc.id,
      dc.document_id,
      dc.chunk_index,
      dc.content,
      1 - (dc.embedding::vector <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM "DocumentChunk" dc
    WHERE dc.document_id::text = ANY(${documentIds})
    ORDER BY similarity DESC
    LIMIT ${topK};
  `;

  return results;
}

// ─────────────────────────────────────
// 3. STREAMING Q&A WITH RAG
// ─────────────────────────────────────

const ollama = new ChatOllama({
  baseUrl: ollamaUrl,
  model: 'gemma3:4b',
  temperature: 0.3,
  numPredict: 512,
});

app.post('/api/conversations/:conversationId/ask', async (req: AuthRequest, res: Response) => {
  console.log("HIT /ask route for conversation:", req.params.conversationId);
  try {
    const { conversationId } = req.params;
    const { question } = req.body;
    const userId = req.userId!;

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId as string, userId },
      include: {
        documents: true,
        messages: { take: 10, orderBy: { createdAt: 'asc' } }
      }
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const documentIds = (conversation as any).documents.map((d: any) => d.id);
    let relevantChunks: any[] = [];
    if (documentIds.length > 0) {
      console.log("Running semantic search...");
      relevantChunks = await semanticSearch(question, documentIds, 5);
      console.log("Semantic search done.");
    }

    const context = relevantChunks
      .map(chunk => `[From ${chunk.document_id}] ${chunk.content}`)
      .join('\n\n');

    const history = (conversation as any).messages
      .map((msg: any) => `${msg.role}: ${msg.content}`)
      .join('\n');

    const systemPrompt = `CRITICAL INSTRUCTION: You MUST respond ONLY in Turkish language. Never use Chinese, Japanese, English or any other language. Always Turkish.

Sen profesyonel bir Türkçe konuşan yapay zeka araştırma asistanısın.
- Her zaman sadece ve sadece TÜRKÇE yanıt ver.
- Asla Çince, Japonca, İngilizce veya başka bir dil kullanma.
- Kullanıcı hangi dilde yazarsa yazsın, sen TÜRKÇE cevap ver.
- Sağlanan belgelerden bilgi çıkar ve Türkçe özetle.
- Bilmiyorsan "Bilmiyorum" de, asla uydurma.
- Yanıtların kısa, net ve anlaşılır olsun.

Sağlanan Belgeler:
${context || "Henüz belge yüklenmedi."}

Geçmiş Sohbet:
${history || "Yeni sohbet."}`;

    // Sanitize: strip null bytes and non-printable chars that break PostgreSQL UTF8
    const sanitize = (s: string) => s.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    const safeQuestion = sanitize(question.length > 8000 ? question.slice(0, 8000) + '\n[...metin kesildi]' : question);

    await prisma.message.create({
      data: {
        conversationId: conversationId as string,
        role: 'user',
        content: safeQuestion,
        sources: []
      }
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Send headers immediately to prevent frontend timeout
    console.log("Headers flushed. Prompting Ollama...");

    let fullResponse = '';
    let tokenCount = 0;

    // Fetch stream from fast cloud model
    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        stream: true,
        model: 'openai'
      })
    });

    if (!response.body) throw new Error('No response body from text API');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkStr = decoder.decode(value, { stream: true });
      const lines = chunkStr.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
              const content = parsed.choices[0].delta.content;
              fullResponse += content;
              tokenCount++;
              res.write(`data: ${JSON.stringify({ type: 'content', delta: content })}\n\n`);
            }
          } catch (e) {
            // Ignore parse errors on partial chunks
          }
        }
      }
    }

    await prisma.message.create({
      data: {
        conversationId: conversationId as string,
        role: 'assistant',
        content: fullResponse,
        tokensUsed: tokenCount,
        sources: relevantChunks as any
      }
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error: any) {
    logger.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Q&A failed', details: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', delta: error.message })}\n\n`);
      res.end();
    }
  }
});

// ─────────────────────────────────────
// 4. CONVERSATION MANAGEMENT
// ─────────────────────────────────────
app.post('/api/conversations', async (req: AuthRequest, res: Response) => {
  try {
    const { title, documentIds } = req.body;
    const conversation = await prisma.conversation.create({
      data: {
        userId: req.userId!,
        title: title || 'New Conversation',
        documents: {
          connect: documentIds?.map((id: string) => ({ id })) || []
        }
      }
    });
    res.json(conversation);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Fetch all conversations for the logged in user
app.get('/api/conversations', async (req: AuthRequest, res: Response) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: req.userId! },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(conversations);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/conversations/:conversationId', async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.conversationId as string },
      include: { messages: { orderBy: { createdAt: 'asc' } }, documents: true }
    });
    if (!conversation) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Delete a conversation
app.delete('/api/conversations/:conversationId', async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const userId = req.userId!;

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId }
    });

    if (!conversation) {
      res.status(404).json({ error: 'Sohbet bulunamadı veya yetkiniz yok' });
      return;
    }

    // Delete messages first to prevent foreign key errors
    await prisma.message.deleteMany({
      where: { conversationId }
    });

    // Delete conversation
    await prisma.conversation.delete({
      where: { id: conversationId }
    });

    res.json({ success: true, message: 'Sohbet silindi' });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`🚀 Research Assistant API running on :${PORT}`);
});
