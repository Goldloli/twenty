import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { postCallRecordingToInboxHandler } from 'src/logic-functions/post-call-recording-to-inbox';

const queryMock = vi.hoisted(() => vi.fn());
const metadataQueryMock = vi.hoisted(() => vi.fn());
const sendInboxMessageMock = vi.hoisted(() => vi.fn());
const inboxReferenceRecordMock = vi.hoisted(() => vi.fn());

vi.mock('twenty-client-sdk/core', () => ({
  CoreApiClient: class {
    query = queryMock;
  },
}));

vi.mock('twenty-client-sdk/metadata', () => ({
  MetadataApiClient: class {
    query = metadataQueryMock;
  },
}));

vi.mock('twenty-sdk/logic-function', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendInboxMessage: sendInboxMessageMock,
  inboxReferenceRecord: inboxReferenceRecordMock,
}));

const SUMMARY = '## Gist\nGood call.';
const UNAVAILABLE_SUMMARY = '## Summary unavailable\n\nOnly greetings.';
const MEMBER_CANNOT_RECEIVE_ERROR = {
  errors: [{ extensions: { code: 'NOT_FOUND' } }],
};

const CALL_RECORDING = {
  id: 'call-recording-1',
  calendarEventId: 'calendar-event-1',
  calendarEvent: { title: 'Weekly sync' },
  summary: { markdown: SUMMARY },
  createdBy: { source: 'APPLICATION', name: 'Call Recorder' },
};

type HandlerEvent = Parameters<typeof postCallRecordingToInboxHandler>[0];

const buildSummaryUpdateEvent = ({
  before = null,
  after = SUMMARY,
}: {
  before?: string | null;
  after?: string | null;
} = {}): HandlerEvent => ({
  name: 'callRecording.updated',
  recordId: 'call-recording-1',
  properties: {
    updatedFields: ['summary'],
    diff: {
      summary: { before: { markdown: before }, after: { markdown: after } },
    },
  },
});

const seedWorkspace = ({
  isInboxEnabled = true,
  recapWorkspaceMemberIds = [],
}: {
  isInboxEnabled?: boolean;
  recapWorkspaceMemberIds?: string[];
} = {}) => {
  metadataQueryMock.mockImplementation(async (query: object) =>
    'currentWorkspace' in query
      ? {
          currentWorkspace: {
            featureFlags: [
              { key: 'IS_AI_CHAT_INBOX_ENABLED', value: isInboxEnabled },
              { key: 'IS_MCP_SERVERS_ENABLED', value: true },
            ],
          },
        }
      : {
          myUserApplicationVariables: [
            ...recapWorkspaceMemberIds.map((workspaceMemberId) => ({
              userWorkspaceId: `user-workspace-of-${workspaceMemberId}`,
              workspaceMemberId,
              variables: [
                {
                  key: 'CALL_RECORDER_MEMBER_INBOX_RECAPS_ENABLED',
                  value: 'true',
                },
              ],
            })),
            {
              userWorkspaceId: 'user-workspace-of-member-recaps-off',
              workspaceMemberId: 'member-recaps-off',
              variables: [
                {
                  key: 'CALL_RECORDER_MEMBER_INBOX_RECAPS_ENABLED',
                  value: 'false',
                },
              ],
            },
            {
              userWorkspaceId: 'user-workspace-of-member-nothing-saved',
              workspaceMemberId: 'member-nothing-saved',
              variables: [],
            },
          ],
        },
  );
};

const seedMeeting = ({
  callRecording = CALL_RECORDING,
  workspaceMemberIds = ['member-1', 'member-2'],
}: {
  callRecording?: object;
  workspaceMemberIds?: string[];
} = {}) => {
  queryMock.mockImplementation(async (query: object) =>
    'callRecordings' in query
      ? { callRecordings: { edges: [{ node: callRecording }] } }
      : {
          calendarEventParticipants: {
            pageInfo: { hasNextPage: false, endCursor: null },
            edges: workspaceMemberIds.map((workspaceMemberId) => ({
              node: { workspaceMemberId },
            })),
          },
        },
  );
};

describe('post-call-recording-to-inbox logic function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedWorkspace();
    seedMeeting();
    inboxReferenceRecordMock.mockResolvedValue('[[record:call-recording-1]]');
    sendInboxMessageMock.mockResolvedValue({ threadId: 'thread-1' });
  });

  it('sends each member of the meeting their own conversation', async () => {
    seedMeeting({ workspaceMemberIds: ['member-2', 'member-1', 'member-2'] });

    expect(
      await postCallRecordingToInboxHandler(buildSummaryUpdateEvent()),
    ).toEqual({
      callRecordingId: 'call-recording-1',
      outcome: 'sent',
      workspaceMemberCount: 2,
      recapWorkspaceMemberCount: 0,
      skippedWorkspaceMemberCount: 0,
    });
    expect(sendInboxMessageMock.mock.calls).toEqual([
      [
        expect.objectContaining({
          workspaceMemberIds: ['member-1'],
          threadKey: 'call-recording-ready-member-1',
          idempotencyKey: 'call-recording-ready-member-1',
          text: expect.stringContaining('[[record:call-recording-1]]'),
        }),
      ],
      [
        expect.objectContaining({
          workspaceMemberIds: ['member-2'],
          threadKey: 'call-recording-ready-member-2',
          idempotencyKey: 'call-recording-ready-member-2',
        }),
      ],
    ]);
  });

  it('sends the members who asked for recaps their own conversation per call', async () => {
    seedWorkspace({ recapWorkspaceMemberIds: ['member-1', 'member-3'] });
    seedMeeting({ workspaceMemberIds: ['member-1', 'member-2', 'member-3'] });

    expect(
      await postCallRecordingToInboxHandler(buildSummaryUpdateEvent()),
    ).toMatchObject({ workspaceMemberCount: 3, recapWorkspaceMemberCount: 2 });

    const recap = {
      title: 'Weekly sync',
      text: 'Good call.\n\n[[record:call-recording-1]]',
    };

    expect(sendInboxMessageMock.mock.calls).toEqual([
      [
        {
          ...recap,
          workspaceMemberIds: ['member-1'],
          threadKey: 'call-recording-recap-call-recording-1-member-1',
          idempotencyKey: 'call-recording-recap-call-recording-1-member-1',
        },
      ],
      [
        {
          ...recap,
          workspaceMemberIds: ['member-3'],
          threadKey: 'call-recording-recap-call-recording-1-member-3',
          idempotencyKey: 'call-recording-recap-call-recording-1-member-3',
        },
      ],
      [
        expect.objectContaining({
          workspaceMemberIds: ['member-2'],
          threadKey: 'call-recording-ready-member-2',
        }),
      ],
    ]);
  });

  it('treats recaps switched off or never set as off', async () => {
    seedMeeting({
      workspaceMemberIds: ['member-recaps-off', 'member-nothing-saved'],
    });

    expect(
      await postCallRecordingToInboxHandler(buildSummaryUpdateEvent()),
    ).toMatchObject({ workspaceMemberCount: 2, recapWorkspaceMemberCount: 0 });
    expect(sendInboxMessageMock).toHaveBeenCalledTimes(2);
    expect(sendInboxMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Your call recording is ready' }),
    );
  });

  it('does not show a meeting title that is not shared', async () => {
    seedWorkspace({ recapWorkspaceMemberIds: ['member-1'] });
    seedMeeting({
      callRecording: {
        ...CALL_RECORDING,
        calendarEvent: {
          title: 'FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED',
        },
      },
      workspaceMemberIds: ['member-1'],
    });

    await postCallRecordingToInboxHandler(buildSummaryUpdateEvent());

    expect(sendInboxMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Call recap' }),
    );
  });

  it('sends a recap without a gist when the summary has none', async () => {
    seedWorkspace({ recapWorkspaceMemberIds: ['member-1'] });
    seedMeeting({
      callRecording: {
        ...CALL_RECORDING,
        calendarEvent: null,
        summary: { markdown: '## Overview\nA short sync.' },
      },
      workspaceMemberIds: ['member-1'],
    });

    await postCallRecordingToInboxHandler(buildSummaryUpdateEvent());

    expect(sendInboxMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Call recap',
        text: 'Your call was recorded: [[record:call-recording-1]].',
      }),
    );
  });

  it('sends when a summary replaces an unavailable one', async () => {
    await postCallRecordingToInboxHandler(
      buildSummaryUpdateEvent({ before: UNAVAILABLE_SUMMARY }),
    );

    expect(sendInboxMessageMock).toHaveBeenCalledTimes(2);
  });

  it('reads the stored summary when the event carries no diff', async () => {
    await postCallRecordingToInboxHandler({
      name: 'callRecording.updated',
      recordId: 'call-recording-1',
      properties: { updatedFields: ['summary'] },
    });

    expect(sendInboxMessageMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      case: 'another field changed',
      event: {
        ...buildSummaryUpdateEvent(),
        properties: { updatedFields: ['transcript'] },
      },
    },
    {
      case: 'the summary was edited',
      event: buildSummaryUpdateEvent({
        before: SUMMARY,
        after: '## Gist\nOk.',
      }),
    },
    {
      case: 'the new summary is unavailable',
      event: buildSummaryUpdateEvent({ after: UNAVAILABLE_SUMMARY }),
    },
    {
      case: 'the summary was cleared',
      event: buildSummaryUpdateEvent({ before: SUMMARY, after: null }),
    },
  ])('makes no request when $case', async ({ event }) => {
    expect(await postCallRecordingToInboxHandler(event)).toMatchObject({
      skipped: true,
    });
    expect(metadataQueryMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
    expect(sendInboxMessageMock).not.toHaveBeenCalled();
  });

  it('sends nothing while Inbox is off', async () => {
    seedWorkspace({ isInboxEnabled: false });

    expect(
      await postCallRecordingToInboxHandler(buildSummaryUpdateEvent()),
    ).toMatchObject({ outcome: 'inbox-disabled' });
    expect(queryMock).not.toHaveBeenCalled();
    expect(sendInboxMessageMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      outcome: 'not-app-recording',
      meeting: {
        callRecording: {
          ...CALL_RECORDING,
          createdBy: { source: 'MANUAL', name: 'Ada' },
        },
      },
    },
    {
      outcome: 'no-summary',
      meeting: {
        callRecording: { ...CALL_RECORDING, summary: { markdown: null } },
      },
    },
    { outcome: 'no-workspace-members', meeting: { workspaceMemberIds: [] } },
  ])(
    'sends nothing when the outcome is $outcome',
    async ({ outcome, meeting }) => {
      seedMeeting(meeting);

      expect(
        await postCallRecordingToInboxHandler(buildSummaryUpdateEvent()),
      ).toMatchObject({ outcome });
      expect(sendInboxMessageMock).not.toHaveBeenCalled();
    },
  );

  it('skips a member who cannot receive it and sends to the others', async () => {
    sendInboxMessageMock.mockRejectedValueOnce(MEMBER_CANNOT_RECEIVE_ERROR);

    expect(
      await postCallRecordingToInboxHandler(buildSummaryUpdateEvent()),
    ).toMatchObject({
      outcome: 'sent',
      workspaceMemberCount: 2,
      skippedWorkspaceMemberCount: 1,
    });
    expect(sendInboxMessageMock).toHaveBeenCalledTimes(2);
  });

  it('asks for a retry when a send fails, after trying every member', async () => {
    sendInboxMessageMock.mockRejectedValueOnce(new Error('503'));

    await expect(
      postCallRecordingToInboxHandler(buildSummaryUpdateEvent()),
    ).rejects.toBeInstanceOf(RetryableLogicFunctionError);
    expect(sendInboxMessageMock).toHaveBeenCalledTimes(2);
  });
});
