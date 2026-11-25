import { createBridgeMcpServer, normalizeIncomingParams, logMcp, flushLogSync } from './browser-mcp.js';
import { installProcessGuards } from './process-guard.js';
import { startStdioServer } from './stdio-server.js';
import { withGuaranteedToolSchema } from './tool-schema.js';

installProcessGuards({ log: logMcp, flush: flushLogSync });

void startStdioServer({
  label: 'Hypagon Browser MCP Server',
  create: createBridgeMcpServer,
  log: logMcp,
  flush: flushLogSync,
  intercept: (transport) => {
    // Intercept transport.send to guarantee parameters, input_schema, and schema are NEVER stripped on stdout
    const prevSend = (transport as any).send;
    if (typeof prevSend === 'function') {
      (transport as any).send = (msg: any) => {
        if (msg?.result?.tools && Array.isArray(msg.result.tools)) {
          msg.result.tools = msg.result.tools.map((t: any) => withGuaranteedToolSchema(t, t.inputSchema || t.parameters || t.input_schema));
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
  },
});
