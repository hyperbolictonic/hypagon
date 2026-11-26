/**
 * The research error contract: every research surface throws an Error carrying a stable `code`
 * the bridge and the agent can branch on.
 *
 * Why a module: the citation controller, the crawl orchestrator, the LLM stack and the cooldown
 * policy all need it, and keeping it in any one of them made the others import that module.
 */

/** When to use: a research failure an agent should see by code rather than by message. */
export function researchError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
