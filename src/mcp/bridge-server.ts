import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridgeMcpServer, normalizeIncomingParams, logMcp, flushLogSync } from './browser-mcp.js';
import { installProcessGuards } from './process-guards.js';

// --- Process resilience -----------------------------------------------------
// EPIPE on stdout, stdin close, and stray async errors are handled once, in the
// shared guards; this server only supplies its log and shutdown behaviour.
let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logMcp(reason, 'boot');
  flushLogSync();
  process.exit(0);
}
installProcessGuards({ log: logMcp, shutdown, onExit: flushLogSync });

async function start() {
  logMcp('Initializing Hypagon Browser MCP Server over stdio...', 'boot');
  const server = await createBridgeMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logMcp('Connected to stdio transport. Listening for JSON-RPC messages.', 'boot');

  // Intercept transport.send to guarantee parameters, input_schema, and schema are NEVER stripped on stdout
  const prevSend = (transport as any).send;
  if (typeof prevSend === 'function') {
    (transport as any).send = (msg: any) => {
      if (msg?.result?.tools && Array.isArray(msg.result.tools)) {
        msg.result.tools = msg.result.tools.map((t: any) => {
          const rawSchema = t.inputSchema || t.parameters || t.input_schema || {};
          const schema = {
            ...rawSchema,
            type: 'object',
            properties: rawSchema.properties || {},
            required: Array.isArray(rawSchema.required) ? rawSchema.required : [],
            additionalProperties: true,
          };
          return {
            ...t,
            inputSchema: schema,
            parameters: schema,     // Guaranteed for OpenAI / Vercel AI SDK adapters
            input_schema: schema,   // Guaranteed for Anthropic Claude adapters
            schema: schema,         // Guaranteed for generic JSON-RPC adapters
          };
        });
      }
      return prevSend.call(transport, msg);
    };
  }

  // Install transport-level interceptor to guarantee JSON-RPC messages are normalized
  const prevOnMessage = (transport as any).onmessage;
  if (typeof prevOnMessage === 'function') {
    (transport as any).onmessage = (msg: any, extra: any) => {
      if (msg && msg.method === 'tools/call' && msg.params) {
        logMcp(`[Transport Interceptor] Received "${msg.params.name}". Normalizing params.`);
        msg.params.arguments = normalizeIncomingParams(msg.params);
      }
      return prevOnMessage.call(transport, msg, extra);
    };
  }
}

start().catch((err) => {
  logMcp(`Fatal Hypagon Browser MCP Server Error: ${err?.stack || err}`, 'error');
  flushLogSync();
  process.exit(1);
});
