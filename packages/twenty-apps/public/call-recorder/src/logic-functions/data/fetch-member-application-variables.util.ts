import { MetadataApiClient } from 'twenty-client-sdk/metadata';

import { fetchWithRateLimitRetry } from 'src/logic-functions/utils/fetch-with-rate-limit-retry.util';

type MemberApplicationVariables = {
  userWorkspaceId: string;
  workspaceMemberId: string;
  variables: { key: string; value: string }[];
};

export const fetchMemberApplicationVariables = async (): Promise<
  MemberApplicationVariables[]
> => {
  // Read as a user, this query only returns that user's own values.
  const metadataClient = new MetadataApiClient({
    fetch: fetchWithRateLimitRetry,
    runAs: 'application',
  });
  const { myUserApplicationVariables } = await metadataClient.query({
    myUserApplicationVariables: {
      userWorkspaceId: true,
      workspaceMemberId: true,
      variables: { key: true, value: true },
    },
  });

  return myUserApplicationVariables;
};
