import { isUndefined } from '@sniptt/guards';
import { type CoreApiClient } from 'twenty-client-sdk/core';

import { TWENTY_PAGE_SIZE } from 'src/logic-functions/constants/twenty-page-size';
import {
  fetchAllNodes,
  type ConnectionPage,
} from 'src/logic-functions/data/fetch-all-nodes.util';
import { getUniqueSortedIds } from 'src/logic-functions/utils/get-unique-sorted-ids.util';

type CalendarEventParticipantNode = { workspaceMemberId?: string | null };

export const fetchWorkspaceMemberIdsForCalendarEvent = async ({
  client,
  calendarEventId,
}: {
  client: Pick<CoreApiClient, 'query'>;
  calendarEventId: string;
}): Promise<string[]> => {
  const calendarEventParticipantNodes =
    await fetchAllNodes<CalendarEventParticipantNode>(async (afterCursor) => {
      const queryResult = await client.query({
        calendarEventParticipants: {
          __args: {
            filter: {
              calendarEventId: { eq: calendarEventId },
              workspaceMemberId: { is: 'NOT_NULL' },
            },
            first: TWENTY_PAGE_SIZE,
            ...(isUndefined(afterCursor) ? {} : { after: afterCursor }),
          },
          pageInfo: {
            hasNextPage: true,
            endCursor: true,
          },
          edges: {
            node: {
              workspaceMemberId: true,
            },
          },
        },
      });

      return queryResult.calendarEventParticipants as
        ConnectionPage<CalendarEventParticipantNode> | undefined;
    });

  return getUniqueSortedIds(
    calendarEventParticipantNodes.map(
      ({ workspaceMemberId }) => workspaceMemberId,
    ),
  );
};
