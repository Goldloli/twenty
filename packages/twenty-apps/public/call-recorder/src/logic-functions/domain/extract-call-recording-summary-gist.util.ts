import { isNonEmptyArray } from '@sniptt/guards';

import { extractCallRecordingSummarySectionLines } from 'src/logic-functions/domain/extract-call-recording-summary-section-lines.util';

export const extractCallRecordingSummaryGist = (
  summaryMarkdown: string,
): string | undefined => {
  const gistLines = extractCallRecordingSummarySectionLines({
    summaryMarkdown,
    heading: 'Gist',
  });

  return isNonEmptyArray(gistLines) ? gistLines.join(' ') : undefined;
};
