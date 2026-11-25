/**
 * MCP client snippets (Settings -> MCP Clients).
 *
 * Builds the copy-ready config for each supported client from the live
 * connect info, so the bridge URL, token file and runtime path in the snippet
 * cannot drift from the running app.
 */
import type { ElectronAPI } from '../preload/index.js';
import type { ConnectInfo } from '../shared/connect-info.js';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

type ConnectRuntime = 'bundled' | 'node';
type ConnectServer = 'browser' | 'wrap' | 'devlogs' | 'legacy-browser' | 'legacy-wrap';

interface ConnectClient {
  id: string;
  label: string;
  file: (info: ConnectInfo) => string;
  snippet: (info: ConnectInfo, runtime: ConnectRuntime, server: ConnectServer) => string;
  note?: string;
}

const connectClientEl = document.getElementById('connect-client') as HTMLSelectElement | null;
const connectServerEl = document.getElementById('connect-server') as HTMLSelectElement | null;
const connectRuntimeEl = document.getElementById('connect-runtime') as HTMLSelectElement | null;
const connectClientNameEl = document.getElementById('connect-client-name') as HTMLElement | null;
const connectFileEl = document.getElementById('connect-file') as HTMLElement | null;
const connectSnippetEl = document.getElementById('connect-snippet') as HTMLElement | null;
const connectNoteEl = document.getElementById('connect-note') as HTMLElement | null;
const connectCopyEl = document.getElementById('connect-copy') as HTMLButtonElement | null;

let connectInfo: ConnectInfo | null = null;

const serverName = (server: ConnectServer) =>
  server === 'wrap'
    ? 'hb-rest'
    : server === 'devlogs'
      ? 'hb-devlogs'
      : server === 'legacy-wrap'
        ? 'kuang-wrap'
        : server === 'legacy-browser'
          ? 'kuang'
          : 'hb-browser';

const isWrapServer = (server: ConnectServer) => server === 'wrap' || server === 'legacy-wrap';
const isDevlogsServer = (server: ConnectServer) => server === 'devlogs';
const isLegacyServer = (server: ConnectServer) => server === 'legacy-browser' || server === 'legacy-wrap';

function runtimeParts(info: ConnectInfo, runtime: ConnectRuntime, server: ConnectServer) {
  const env: Record<string, string> = {};
  const legacy = isLegacyServer(server);
  if (runtime === 'bundled') env.ELECTRON_RUN_AS_NODE = '1';
  if (!isDevlogsServer(server) && info.bridgePort !== 4111) {
    env[legacy ? 'KUANG_BRIDGE_URL' : 'HB_BRIDGE_URL'] = info.bridgeUrl;
  }
  if (isWrapServer(server)) env[legacy ? 'KUANG_WRAP_TOKEN_FILE' : 'HB_WRAP_TOKEN_FILE'] = info.wrapTokenFile;
  if (isDevlogsServer(server)) {
    env.HB_DEV_LOGS = '1';
    env.HB_DEVLOGS_DIR = info.devlogsDir;
  }
  const serverPath = isDevlogsServer(server)
    ? info.devlogsServerPath
    : isWrapServer(server)
      ? info.wrapServerPath
      : info.serverPath;
  return runtime === 'bundled'
    ? { command: info.runtimePath, args: [serverPath], env }
    : { command: 'node', args: [serverPath], env };
}

const withEnv = (entry: Record<string, any>, env: Record<string, string>) =>
  Object.keys(env).length ? { ...entry, env } : entry;

/** The resolved command/args/env for one client and server choice. */
type RuntimeParts = ReturnType<typeof runtimeParts>;

/**
 * A snippet body over the resolved runtime, so each client entry reads as its own config shape
 * and the destructure lives in one place (five clients used to repeat it).
 */
const snippetFrom =
  (build: (parts: RuntimeParts, server: ConnectServer) => string) =>
  (info: ConnectInfo, runtime: ConnectRuntime, server: ConnectServer): string =>
    build(runtimeParts(info, runtime, server), server);

const claudeStyle = snippetFrom(({ command, args, env }, server) =>
  JSON.stringify({ mcpServers: { [serverName(server)]: withEnv({ command, args }, env) } }, null, 2),
);

const quote = (value: string) => `"${value}"`;

/** Join a home-relative config path with the host separator (display only). */
const hpath = (info: ConnectInfo, ...parts: string[]) =>
  [info.homedir, ...parts].join(info.platform === 'win32' ? '\\' : '/');

const CONNECT_CLIENTS: ConnectClient[] = [
  {
    id: 'opencode',
    label: 'OpenCode',
    file: (info) => `${hpath(info, '.config', 'opencode', 'opencode.json')} (global) · opencode.json (project)`,
    snippet: snippetFrom(({ command, args, env }, server) => {
      const entry: Record<string, any> = { type: 'local', command: [command, ...args], enabled: true };
      if (Object.keys(env).length) entry.environment = env;
      return JSON.stringify(
        { $schema: 'https://opencode.ai/config.json', mcp: { [serverName(server)]: entry } },
        null,
        2
      );
    }),
    note: 'Restart OpenCode after saving. Tools appear under the server name shown in the snippet.',
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    file: (info) =>
      info.platform === 'win32'
        ? `${info.homedir}\\AppData\\Roaming\\Claude\\claude_desktop_config.json`
        : info.platform === 'darwin'
          ? `${info.homedir}/Library/Application Support/Claude/claude_desktop_config.json`
          : `${info.homedir}/.config/Claude/claude_desktop_config.json`,
    snippet: claudeStyle,
    note: 'Quit Claude Desktop completely (tray icon too) and reopen it after saving.',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    file: () => 'Run once in a terminal · or commit .mcp.json to the project',
    snippet: snippetFrom(({ command, args, env }, server) => {
      const parts = ['claude', 'mcp', 'add', serverName(server)];
      for (const [key, value] of Object.entries(env)) parts.push('--env', `${key}=${value}`);
      parts.push('--', quote(command), ...args.map(quote));
      return parts.join(' ');
    }),
    note: 'Use `claude mcp list` to verify. A project .mcp.json with the Claude Desktop shape also works.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    file: (info) => `${hpath(info, '.cursor', 'mcp.json')} (global) · .cursor/mcp.json (project)`,
    snippet: claudeStyle,
    note: 'Cursor → Settings → MCP → refresh after saving.',
  },
  {
    id: 'vscode',
    label: 'VS Code (Copilot)',
    file: () => '.vscode/mcp.json in the workspace',
    snippet: snippetFrom(({ command, args, env }, server) =>
      JSON.stringify(
        { servers: { [serverName(server)]: withEnv({ type: 'stdio', command, args }, env) } },
        null,
        2
      ),
    ),
    note: 'Needs an agent-mode request; run “MCP: List Servers” to start the server.',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    file: (info) => hpath(info, '.codeium', 'windsurf', 'mcp_config.json'),
    snippet: claudeStyle,
    note: 'Cascade → MCP → refresh after saving.',
  },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    file: (info) =>
      `${hpath(info, '.gemini', 'config', 'mcp_config.json')} (global) · .agents/mcp_config.json (workspace)`,
    snippet: claudeStyle,
    note: 'Antigravity rejects a `type` field — this snippet uses only command/args/env.',
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    file: (info) => hpath(info, '.gemini', 'settings.json'),
    snippet: claudeStyle,
    note: 'Merge into the existing settings.json rather than replacing it.',
  },
  {
    id: 'atomic-chat',
    label: 'Atomic Chat',
    file: () => 'Settings → MCP Servers → Add MCP Server → JSON editor',
    snippet: claudeStyle,
    note: 'Paste this into Atomic Chat’s JSON editor, or enter the same command/args in the add-server form.',
  },
  {
    id: 'zed',
    label: 'Zed',
    file: (info) => hpath(info, '.config', 'zed', 'settings.json'),
    snippet: snippetFrom(({ command, args, env }, server) =>
      JSON.stringify(
        {
          context_servers: {
            [serverName(server)]: { source: 'custom', command: { path: command, args, env } },
          },
        },
        null,
        2
      ),
    ),
    note: 'Zed calls them context servers; they appear in the agent panel.',
  },
  {
    id: 'generic',
    label: 'Generic (mcpServers)',
    file: () => 'Any client that accepts command / args / env over stdio',
    snippet: claudeStyle,
    note: 'The standard `mcpServers` wrapper used by most desktop clients.',
  },
];

function populateConnectClients() {
  if (!connectClientEl) return;
  connectClientEl.replaceChildren();
  for (const client of CONNECT_CLIENTS) {
    const option = document.createElement('option');
    option.value = client.id;
    option.textContent = client.label;
    connectClientEl.append(option);
  }
}

function renderConnect() {
  if (!connectInfo || !connectClientEl || !connectSnippetEl) return;
  const client = CONNECT_CLIENTS.find((item) => item.id === connectClientEl.value) || CONNECT_CLIENTS[0];
  const runtime = (connectRuntimeEl?.value === 'node' ? 'node' : 'bundled') as ConnectRuntime;
  const server = (connectServerEl?.value || 'browser') as ConnectServer;

  if (connectClientNameEl) connectClientNameEl.textContent = client.label;
  if (connectFileEl) connectFileEl.textContent = client.file(connectInfo);
  connectSnippetEl.textContent = client.snippet(connectInfo, runtime, server);

  const notes: string[] = [];
  if (client.note) notes.push(client.note);
  if (isWrapServer(server)) {
    notes.push('Hypagon REST exposes only `wrap_*` tools; the Cyberdeck must be running so the bridge can reach the wrapper store.');
  }
  if (isLegacyServer(server)) {
    notes.push('Legacy alias: existing configs keep working, but new configs should use hb-browser or hb-rest.');
  }
  if (isDevlogsServer(server)) {
    notes.push('Development only. Reads allowlisted log files with token redaction; it is not exposed through the remote gateway.');
  }
  notes.push(
    runtime === 'bundled'
      ? 'Runs on this app’s bundled runtime (ELECTRON_RUN_AS_NODE=1), so Node does not need to be installed.'
      : 'Runs with `node` from PATH — Node 20 or newer is required.'
  );
  if (!isDevlogsServer(server)) {
    notes.push(
      connectInfo.bridgePort === 4111
        ? 'The Cyberdeck must already be running; the bridge listens on the default port 4111.'
        : `${isLegacyServer(server) ? 'KUANG' : 'HB'}_BRIDGE_URL=${connectInfo.bridgeUrl} is included because this instance uses port ${connectInfo.bridgePort}.`
    );
  }
  const serverPath = isDevlogsServer(server)
    ? connectInfo.devlogsServerPath
    : isWrapServer(server)
      ? connectInfo.wrapServerPath
      : connectInfo.serverPath;
  const serverExists = isDevlogsServer(server)
    ? connectInfo.devlogsServerExists
    : isWrapServer(server)
      ? connectInfo.wrapServerExists
      : connectInfo.serverExists;
  if (!serverExists) notes.push(`⚠ MCP server not found at ${serverPath} — run npm run build:mcp.`);
  if (connectNoteEl) connectNoteEl.textContent = notes.join(' ');
}

/** Read the connect info (once) and repaint the selected client snippet. */
export async function loadConnectPanel() {
  if (!connectClientEl) return;
  if (!connectClientEl.options.length) populateConnectClients();
  try {
    if (!connectInfo) connectInfo = await api!.getConnectInfo();
    const devlogsOption = connectServerEl?.querySelector('option[value="devlogs"]') as HTMLOptionElement | null;
    if (devlogsOption) devlogsOption.hidden = !connectInfo.devMode;
    if (!connectInfo.devMode && connectServerEl?.value === 'devlogs') connectServerEl.value = 'browser';
    renderConnect();
  } catch (err: any) {
    if (connectSnippetEl) connectSnippetEl.textContent = `Could not read connection info: ${err?.message || err}`;
  }
}


/** Wire the client picker once, after the settings modal markup exists. */
export function initConnectPanel(): void {
  connectClientEl?.addEventListener('change', renderConnect);
  connectServerEl?.addEventListener('change', renderConnect);
  connectRuntimeEl?.addEventListener('change', renderConnect);
  connectCopyEl?.addEventListener('click', async () => {
    const text = connectSnippetEl?.textContent || '';
    if (!text) return;
    await api?.copyToClipboard(text);
    connectCopyEl.textContent = 'COPIED';
    window.setTimeout(() => (connectCopyEl.textContent = 'COPY'), 1500);
  });
  populateConnectClients();
}
