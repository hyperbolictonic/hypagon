/**
 * The tool-schema guarantee every MCP surface must keep: each advertised tool
 * carries the identical schema object under `inputSchema`, `parameters` and
 * `input_schema`, so OpenAI / Vercel AI SDK, Anthropic / Python MCP and generic
 * JSON-RPC adapters all read the same shape.
 *
 * Two copies of this once existed (the server-level tools/list mapping and the
 * stdio transport interceptor) and drifted in one field within days; both now
 * call this one function.
 */

/**
 * When to use: mapping a tool entry for tools/list or a transport send —
 * normalize its schema and attach it under every adapter's expected key.
 */
export function withGuaranteedToolSchema<T extends Record<string, any>>(tool: T, rawSchema?: Record<string, any>): T {
  const schema = {
    ...(rawSchema ?? tool.inputSchema ?? {}),
    type: 'object',
    properties: (rawSchema ?? tool.inputSchema ?? {}).properties || {},
    required: Array.isArray((rawSchema ?? tool.inputSchema ?? {}).required) ? (rawSchema ?? tool.inputSchema ?? {}).required : [],
    additionalProperties: true,
  };
  return {
    ...tool,
    inputSchema: schema,
    parameters: schema,   // Guaranteed for OpenAI / Vercel AI SDK adapters
    input_schema: schema, // Guaranteed for Anthropic Claude adapters
    schema,               // Guaranteed for generic JSON-RPC adapters
  };
}
