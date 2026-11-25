/**
 * The per-tool response renderers for the bridge MCP server.
 *
 * Why a module: `executeCatalogTool` carried four special-case branches (the
 * media-preview frame inventory, the frames tool, the image-bearing screenshot
 * tools and the observe components table) that made the dispatcher 125 lines.
 * Each renderer is a self-contained mapping from a bridge response to MCP
 * content; the dispatcher keeps the transport, the default text path and the
 * stale-server note.
 */
import { formatMark } from '../main/marks/format-mark.js';

// Ceiling on tool text: a huge page can neither flood the agent context nor wedge the stdio transport.
const MAX_TEXT_CHARS = 60000;
/** When to use: the dispatcher or a renderer — cap a tool's text so one payload cannot flood the agent context. */
export function clampText(text: string): string {
  if (typeof text !== 'string' || text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n\n... [Hypagon Browser MCP: response truncated at ${MAX_TEXT_CHARS} chars to protect the agent context. Narrow the query (e.g. query_json_data path/projection) for a smaller result.]`;
}

/** When to use: the dispatcher — render a tool result, or null to take the default text path. */
export type ToolRenderer = (tool: any, data: any, args: any) => { content: any[] } | null;

const textOf = (tool: any, data: any, args: any): string =>
  clampText(tool.format ? tool.format(data, args) : JSON.stringify(data, null, 2));

const imagesOf = (data: any): any[] => (Array.isArray(data?.images) ? data.images : []);

/** media_preview: text summary plus one image per visible frame. */
export const renderMediaPreview: ToolRenderer = (tool, data) => {
  const content: any[] = [{ type: 'text', text: textOf(tool, data, {}) }];
  const images = imagesOf(data);
  for (const image of images) {
    if (typeof image?.base64 !== 'string' || image.base64 === '') continue;
    content.push({ type: 'image', data: image.base64, mimeType: image.mimeType || 'image/jpeg' });
  }
  return { content };
};

/** frames: text summary plus one cropped image per child frame. */
export const renderFrames: ToolRenderer = (tool, data, args) => {
  const images = imagesOf(data);
  const content: any[] = [{ type: 'text', text: textOf(tool, data, args) }];
  for (const image of images) {
    const raw = typeof image?.base64Image === 'string' ? image.base64Image.replace(/^data:image\/[a-z]+;base64,/, '') : '';
    if (!raw) continue;
    content.push({
      type: 'text',
      text: `Frame image — ${image.name ? `"${image.name}" ` : ''}${image.url || image.frameId} (${image.width}x${image.height})`,
    });
    content.push({ type: 'image', data: raw, mimeType: image.mimeType || 'image/jpeg' });
  }
  return { content };
};

/** The image-bearing tools (viewport screenshots and Set-of-Marks scans). */
export function renderImageTool(tool: any, data: any, args: any): { content: any[] } {
  const rawBase64 = extractCleanBase64(data);
  const screenshot = data.screenshot || data;
  const filePath = screenshot.filePath || '';
  const w = screenshot.width || 0;
  const h = screenshot.height || 0;
  const marks = Array.isArray(data.marks) ? data.marks : [];
  const withMarks = tool.name !== 'take_screenshot' || args?.marks === true;
  const zoom = screenshot.zoom;
  const zoomNote = zoom
    ? ` Page zoom ${Math.round((zoom.factor || 1) * 100)}% (${zoom.custom ? 'custom' : zoom.mode}); CSS viewport ${zoom.viewport?.css?.width || 0}x${zoom.viewport?.css?.height || 0}; image/CSS scale ${Number(screenshot.coordinateScale || 1).toFixed(3)}.`
    : '';

  let text: string;
  if (withMarks) {
    const marksTable = marks.map((m: any) => formatMark(m)).join('\n');
    const header = filePath
      ? `Set-of-Marks Screenshot saved to ${filePath} (${w}x${h}px). ${marks.length} interactive elements detected.${zoomNote}`
      : `Set-of-Marks text scan (viewport ${w}x${h}px, no image). ${marks.length} interactive elements detected.${zoomNote}`;
    text = clampText(`${header}\n\nInteractive Elements:\n${marksTable}\n\nActuate via act(mark_id, action) — action defaults to "click"; "type" for inputs (text=...), "hover" for menus, "press" for keys.`);
  } else {
    text = filePath
      ? `Screenshot captured and saved to ${filePath} (${w}x${h}px).${zoomNote}`
      : `Screenshot captured (${w}x${h}px).${zoomNote}`;
  }

  const content: any[] = [{ type: 'text', text }];
  if (rawBase64) {
    content.push({
      type: 'image',
      data: rawBase64,
      mimeType: screenshot.mimeType || (filePath.endsWith('.png') ? 'image/png' : 'image/jpeg'),
    });
  }
  return { content };
}

/** observe(as:"components"): the prose projection plus the machine table decide() consumes. */
export function renderComponentsTable(text: string, data: any): { content: any[] } {
  const components = data.components.slice(0, 120).map((c: any) => ({
    id: c.id, role: c.role, name: c.name, actions: c.actions,
  }));
  return {
    content: [
      { type: 'text', text },
      { type: 'text', text: JSON.stringify({ components }) },
    ],
  };
}

function extractCleanBase64(data: any): string {
  const raw = data?.screenshot?.base64Image || data?.base64Image || data?.image || '';
  return typeof raw === 'string' ? raw.replace(/^data:image\/[a-z]+;base64,/, '') : '';
}
