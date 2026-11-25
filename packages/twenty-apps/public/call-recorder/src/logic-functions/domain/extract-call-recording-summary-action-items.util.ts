import { isNonEmptyArray } from '@sniptt/guards';

import { extractCallRecordingSummarySectionLines } from 'src/logic-functions/domain/extract-call-recording-summary-section-lines.util';

// The summary prompt writes "None." when a call has no follow-up.
const NO_ACTION_ITEMS_PATTERN = /^(none|no action items)\b/i;
const LIST_ITEM_PATTERN = /^([-*]|\d+\.)\s/;

export const extractCallRecordingSummaryActionItems = (
  summaryMarkdown: string,
): string | undefined => {
  const actionItemLines = extractCallRecordingSummarySectionLines({
    summaryMarkdown,
    heading: 'Action Items',
  });

  if (
    !isNonEmptyArray(actionItemLines) ||
    (actionItemLines.length === 1 &&
      NO_ACTION_ITEMS_PATTERN.test(actionItemLines[0]))
  ) {
    return undefined;
  }

  // A blank line before each owner keeps it out of the previous owner's list.
  return actionItemLines
    .map((line, index) =>
      index > 0 && !LIST_ITEM_PATTERN.test(line) ? `\n${line}` : line,
    )
    .join('\n');
};
