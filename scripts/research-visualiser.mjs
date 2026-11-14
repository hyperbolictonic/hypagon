// Terminal visualiser for a research run (proves the event stream before the UI exists).
//
// Run: node scripts/research-visualiser.mjs "your query"
import { Researcher } from '../src/main/research/researcher.ts';

const query = process.argv.slice(2).join(' ') || 'example query';
const useColour = process.stdout.isTTY;
const paint = (code, text) => (useColour ? `\u001b[${code}m${text}\u001b[0m` : text);
const dim = (text) => paint('2', text);
const green = (text) => paint('32', text);
const yellow = (text) => paint('33', text);
const red = (text) => paint('31', text);
const cyan = (text) => paint('36', text);

const started = Date.now();
const clock = () => dim(`+${((Date.now() - started) / 1000).toFixed(1)}s`);

function render(event) {
  switch (event.type) {
    case 'run-start':
      console.log(`${clock()} ${cyan('run-start')}  ${event.query}  ${dim(`max=${event.maxSources}`)}`);
      break;
    case 'search-done':
      console.log(
        `${clock()} ${cyan('search')}     ${event.engine ?? '?'}  ${event.results} result(s)` +
          (event.blocked ? `  ${yellow('provider blocked')}` : ''),
      );
      break;
    case 'source-start':
      console.log(`${clock()} ${dim(`  #${event.rank}`)} ${event.url}`);
      break;
    case 'source-done': {
      const via = event.via === 'render' ? yellow(event.via) : green(event.via);
      const escalation = event.escalation
        ? `  ${red(`ESCALATED: ${event.escalation.reason}`)}`
        : '';
      const error = event.error ? `  ${red(`error: ${event.error}`)}` : '';
      console.log(
        `${clock()} ${dim('   →')} ${via}  ${event.bytes}B${event.indexed ? '  indexed' : ''}${escalation}${error}`,
      );
      break;
    }
    case 'human-needed':
      console.log(`${clock()} ${red('human-needed')}  ${event.url}  (${event.reason})`);
      break;
    case 'run-done':
      console.log(
        `${clock()} ${cyan('run-done')}   ${event.sources} source(s), ${event.indexed} indexed, ` +
          `${event.escalations} escalation(s)  ${dim(`${event.elapsedMs}ms`)}`,
      );
      break;
    case 'run-error':
      console.log(`${clock()} ${red('run-error')}  ${event.message}`);
      break;
  }
}

// Fixture harness: two sources, one of which escalates from static to render.
const researcher = new Researcher({
  search: async () => ({
    engine: 'fixture',
    results: [
      { rank: 1, title: 'Static article', url: 'https://a.test/article', snippet: 'a' },
      { rank: 2, title: 'Protected article', url: 'https://b.test/protected', snippet: 'b' },
    ],
    attempts: [{ engine: 'fixture', status: 'ok' }],
    blocked: false,
  }),
  crawl: async (opts) => {
    const escalated = opts.startUrl.includes('b.test');
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      startUrl: opts.startUrl,
      pages: [
        {
          url: opts.startUrl,
          title: 'Fixture',
          depth: 0,
          via: escalated ? 'render' : 'static',
          bytes: escalated ? 48210 : 3120,
          links: 0,
          indexed: true,
          escalation: escalated
            ? { from: 'static', to: 'render', reason: 'challenge page (403)' }
            : undefined,
          excerpt: 'Fixture content about widgets. '.repeat(6),
        },
      ],
      pageCount: 1,
      depthReached: 0,
      cortexIndexed: 1,
      sameOrigin: true,
      truncated: false,
      notes: [],
    };
  },
  events: render,
  log: () => {},
});

await researcher.research({ query, maxSources: 2 });
