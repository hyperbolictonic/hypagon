/**
 * Download surface.
 *
 * Owns the download manager and the agent-facing reads over it. The chassis
 * still attaches it to the window session and forwards the completion event,
 * because both are window lifecycle, not download logic.
 */
import { DownloadManager, type DownloadRecord } from './download-manager.js';

/** Dependencies the download surface needs for directive logging. */
export interface DownloadSurfaceDeps {
  log(level: 'info' | 'warn' | 'action', message: string): void;
}

/** The download list and downloaded-document reader. */
export class DownloadSurface {
  /** The manager; the window attaches its session and completion hook. */
  readonly manager = new DownloadManager();

  constructor(private readonly deps: DownloadSurfaceDeps) {}

  list(): DownloadRecord[] {
    return this.manager.getDownloads();
  }

  async readDocument(filenameOrId: string) {
    this.deps.log('action', `MCP Directive: read_download("${filenameOrId}")`);
    return await this.manager.readDocumentContent(filenameOrId);
  }
}
