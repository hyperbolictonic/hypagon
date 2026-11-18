/** When to use: labelling what a human pointed at (element, region, text, point). */
export type CollaborationTargetKind =
  | 'element'
  | 'text'
  | 'frame'
  | 'console'
  | 'network'
  | 'region'
  | 'style'
  | 'page';

/** When to use: addressing the element or region a thread is about (marks and selectors). */
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

/** When to use: distinguishing comments, questions, choices, answers and status notes. */
export type CollaborationMessageKind = 'comment' | 'question' | 'choice' | 'answer' | 'status';

/** When to use: reading or appending one message in a thread. */
export interface CollaborationMessage {
  id: string;
  author: 'human' | 'agent';
  kind: CollaborationMessageKind;
  text: string;
  choices?: string[];
  answer?: string;
  createdAt: number;
}

/** When to use: filtering or rendering threads by their lifecycle state. */
export type CollaborationThreadStatus = 'open' | 'answered' | 'resolved' | 'stale';

/** When to use: listing a thread with its target, messages and status. */
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

/** When to use: loading threads for a page, target or status in the deck. */
export interface CollaborationFilter {
  url?: string;
  status?: CollaborationThreadStatus;
  tabId?: string;
  limit?: number;
}

/** When to use: returning a thread mutation (ok, thread, errors) over the bridge. */
export interface CollaborationResult {
  ok: boolean;
  thread?: CollaborationThread;
  threads?: CollaborationThread[];
  error?: string;
}
