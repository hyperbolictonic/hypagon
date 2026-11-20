/**
 * Guarantee the schema field names MCP clients disagree about.
 *
 * OpenAI/Vercel adapters read `parameters`, Anthropic adapters read `input_schema`, and generic
 * JSON-RPC adapters read `schema`; the protocol field is `inputSchema`. Advertising all four
 * (same object) is what makes one tools/list answer work everywhere.
 */

/** When to use: before a tools/list response leaves the server, or a transport sends it. */
export function withSchemaAliases(tool: any): any {
  const rawSchema = tool.inputSchema || tool.parameters || tool.input_schema || {};
  const schema = {
    ...rawSchema,
    type: 'object',
    properties: rawSchema.properties || {},
    required: Array.isArray(rawSchema.required) ? rawSchema.required : [],
    additionalProperties: true,
  };
  return {
    ...tool,
    inputSchema: schema,
    parameters: schema,
    input_schema: schema,
    schema,
  };
}
