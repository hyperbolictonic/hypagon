/**
 * The page-side numbering and drawing pass: reuse sticky anchors, allocate ids under the
 * 99-mark ceiling, stamp data-mark-id, and draw the badge plus outline for each mark.
 *
 * When to use: composed by marksInjectionScript as the final phase.
 */
export function marksAssign(): string {
  return `        // 4. Stable assignment: Reserve numbers for sticky static anchors first
        const usedIds = new Set();
        const assignments = [];
        const newStaticAnchors = {};

        // Pass A: Check existing sticky anchors or previously stamped data-mark-id
        for (const item of items) {
          const label = accName(item.el).slice(0, 50);
          const fp = computeFingerprint(item.el, label);
          let assignedId = null;

          const existingMarkAttr = item.el.getAttribute('data-mark-id');
          if (existingMarkAttr && !isNaN(Number(existingMarkAttr))) {
            assignedId = Number(existingMarkAttr);
            usedIds.add(assignedId);
            if (item.isStatic) newStaticAnchors[fp] = assignedId;
          } else if (item.isStatic && existingAnchors[fp]) {
            assignedId = existingAnchors[fp];
            usedIds.add(assignedId);
            newStaticAnchors[fp] = assignedId;
          }
          assignments.push({ ...item, label, fp, assignedId });
        }

        // Pass B: Allocate IDs for new items sequentially
        let nextSeqId = 1;
        const getNextAvailableId = () => {
          while (usedIds.has(nextSeqId)) {
            nextSeqId++;
          }
          usedIds.add(nextSeqId);
          return nextSeqId;
        };

        const marks = [];
        for (const item of assignments) {
          let markId = item.assignedId;
          if (markId === null) {
            markId = getNextAvailableId();
            if (item.isStatic) {
              newStaticAnchors[item.fp] = markId;
            }
          }

          if (markId > 99) continue; // Respect 99 mark ceiling for token efficiency

          const { el, rect, label } = item;
          const state = stateOf(el);
          const value = valueOf(el);
          const actions = actionsOf(el);
          const { region, regionName } = regionOf(el);
          const disabled = state.split(',').includes('disabled');

          el.setAttribute('data-mark-id', String(markId));

          // Create badge element
          const badge = document.createElement('div');
          badge.className = 'mark-eleven-badge';
          badge.textContent = String(markId);
          badge.style.cssText = \`
            position: fixed;
            top: \${Math.max(0, rect.top)}px;
            left: \${Math.max(0, rect.left)}px;
            background: \${disabled ? '#a1a1aa' : item.isStatic ? '#06b6d4' : '#eab308'};
            color: #09090b;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 11px;
            font-weight: 800;
            line-height: 1;
            padding: 2px 4px;
            border-radius: 3px;
            box-shadow: 0 0 6px rgba(0, 0, 0, 0.9), 0 0 10px \${item.isStatic ? 'rgba(6, 182, 212, 0.6)' : 'rgba(234, 179, 8, 0.6)'};
            border: 1px solid \${disabled ? '#71717a' : item.isStatic ? '#0891b2' : '#ca8a04'};
            pointer-events: none;
            z-index: 2147483647;
          \`;

          // Subtle box outline
          const box = document.createElement('div');
          box.style.cssText = \`
            position: fixed;
            top: \${rect.top}px;
            left: \${rect.left}px;
            width: \${rect.width}px;
            height: \${rect.height}px;
            border: 1px dashed \${disabled ? 'rgba(161, 161, 170, 0.7)' : item.isStatic ? 'rgba(6, 182, 212, 0.7)' : 'rgba(234, 179, 8, 0.7)'};
            pointer-events: none;
            box-sizing: border-box;
            z-index: 2147483646;
          \`;

          container.appendChild(box);
          container.appendChild(badge);

          marks.push({
            id: markId,
            tag: el.tagName.toUpperCase(),
            type: (el.getAttribute('type') || '').toLowerCase() || undefined,
            text: label,
            role: el.getAttribute('role') || undefined,
            state: state || undefined,
            value,
            actions,
            region,
            regionName,
            rect: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            center: {
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            },
            component: kqComponentSurface(el) || undefined,
          });
        }

        return { marks, newStaticAnchors };`;
}
