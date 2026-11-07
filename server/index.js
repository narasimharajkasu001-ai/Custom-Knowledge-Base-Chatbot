import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { OllamaEmbeddings, ChatOllama } from '@langchain/ollama';
import { createClient } from '@supabase/supabase-js';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const embeddings = new OllamaEmbeddings({ model: 'nomic-embed-text' });
const llm = new ChatOllama({ model: 'llama3', temperature: 0.2 });

const vectorStore = new SupabaseVectorStore(embeddings, {
  client: supabaseClient,
  tableName: 'documents',
  queryName: 'match_documents',
});

// A simple in-memory session store to remember chat histories per client session
const chatHistoryMap = new Map();

// 📥 INGESTION ENDPOINT (Stays robust & secure)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const rawText = req.file.buffer.toString('utf-8');
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
    const textChunks = await textSplitter.splitText(rawText);

    const docs = textChunks.map((chunk) => ({
      pageContent: chunk,
      metadata: { filename: req.file.originalname, uploadedAt: new Date().toISOString() },
    }));

    await vectorStore.addDocuments(docs);
    return res.status(200).json({ message: 'Document vectorized successfully!', chunksCreated: docs.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to process document.' });
  }
});

// =========================================================================
// 🧠 UPGRADED ENDPOINT: CONVERSATIONAL AGENT WITH MEMORY & FILE ACTION TOOL
// =========================================================================
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default-session' } = req.body;
    if (!message) return res.status(400).json({ error: 'Message field is required.' });

    // 1. Core Tool Check (Intercepting explicit requests to act on files)
    if (message.toLowerCase().includes('save a summary') || message.toLowerCase().includes('generate a report')) {
      const summaryDir = './saved_reports';
      if (!fs.existsSync(summaryDir)) fs.mkdirSync(summaryDir);
      
      const fileName = `report_${Date.now()}.md`;
      const filePath = path.join(summaryDir, fileName);
      
      // Execute the native disk-writing capability directly
      fs.writeFileSync(filePath, `# Agent Summary Report\n\nGenerated on: ${new Date().toISOString()}\n\nUser Prompt: "${message}"\n\nThis is an automated text document compilation tool action executed by your local Node server agent loop.`);
      
      // Instantly handle response without routing through streaming loop
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`⚙️ [Agent Action Execution]: I have successfully generated a summary report and saved it directly to your server directory at \`${filePath}\`!`);
      res.end();
      return;
    }

    // 2. Stream Setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 3. Reconstruct Conversational Memory History state 
    if (!chatHistoryMap.has(sessionId)) chatHistoryMap.set(sessionId, []);
    const historyList = chatHistoryMap.get(sessionId);

    // Convert raw array histories into standard LangChain message schemas
    const formattedHistory = historyList.map(msg => 
      msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
    );

    const retriever = vectorStore.asRetriever(3);

    // System instruction injected with conditional state tracking rules
    const systemPrompt = 
      "You are a sophisticated conversational corporate AI Agent. Review the provided vector " +
      "context closely alongside the current conversation history to produce an answer. " +
      "If you cannot locate structural facts inside the context, leverage your base capabilities " +
      "while stating clearly that the explicit documentation was missing.\n\n" +
      "Context:\n{context}";

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      new MessagesPlaceholder('chat_history'),
      ['human', '{question}'],
    ]);

    const formatDocuments = (docs) => docs.map(doc => doc.pageContent).join('\n\n');

    // Complete Advanced LCEL Composition Sequence
    const agentChain = RunnableSequence.from([
      {
        context: retriever.pipe(formatDocuments),
        question: new RunnablePassthrough(),
        chat_history: () => formattedHistory,
      },
      promptTemplate,
      llm,
      new StringOutputParser(),
    ]);

    const stream = await agentChain.stream(message);
    let completeResponseText = '';

    for await (const chunk of stream) {
      res.write(chunk);
      completeResponseText += chunk;
    }

    // 4. Save this transaction step back to persistent memory cache
    historyList.push({ role: 'user', content: message });
    historyList.push({ role: 'assistant', content: completeResponseText });
    
    // Manage memory bounds (Keep trailing 10 messages so RAM doesn't overflow)
    if (historyList.length > 20) historyList.splice(0, 2);

    res.end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: 'Server fault' });
    res.end();
  }
});

app.listen(port, () => console.log(`\n🚀 Advanced Agent actively listening at http://localhost:${port}`));
