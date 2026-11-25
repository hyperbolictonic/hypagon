/** When to use: recording what a note is attached to — an element, text, frame, console line, request, region, style or the page. */
export type CollaborationTargetKind =
  | 'element'
  | 'text'
  | 'frame'
  | 'console'
  | 'network'
  | 'region'
  | 'style'
  | 'page';

/** When to use: the anchor stored on a thread — the url, tab/frame, mark id or selector that survives a reload. */
export interface CollaborationTarget {
  kind: CollaborationTargetKind;
  url: string;
  tabId?: string;
  frameId?: string;
  revision?: number;
  markId?: number;
  selector?: string;
  role?: string;
  name?: string;
  text?: string;
  rect?: { x: number; y: number; width: number; height: number };
  reference?: string;
}

/** When to use: rendering a thread message — a comment, question, choice, answer or status line. */
export type CollaborationMessageKind = 'comment' | 'question' | 'choice' | 'answer' | 'status';

/** When to use: one human or agent message inside a collaboration thread. */
export interface CollaborationMessage {
  id: string;
  author: 'human' | 'agent';
  kind: CollaborationMessageKind;
  text: string;
  choices?: string[];
  answer?: string;
  createdAt: number;
}

/** When to use: filtering or resolving threads — open, answered, resolved or stale. */
export type CollaborationThreadStatus = 'open' | 'answered' | 'resolved' | 'stale';

/** When to use: the `collaborate` read/list actions — one target, its messages and its resolution. */
export interface CollaborationThread {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: CollaborationThreadStatus;
  target: CollaborationTarget;
  intent?: string;
  tags: string[];
  messages: CollaborationMessage[];
  resolution?: string;
}

/** When to use: `listCollaborationThreads` — narrow by url, status, tab or count. */
export interface CollaborationFilter {
  url?: string;
  status?: CollaborationThreadStatus;
  tabId?: string;
  limit?: number;
}

/** When to use: the collaboration tool reply — one thread, many, or the error. */
export interface CollaborationResult {
  ok: boolean;
  thread?: CollaborationThread;
  threads?: CollaborationThread[];
  error?: string;
}
