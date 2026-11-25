import { useEffect, useState } from 'react';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';

import { isInboxEnabled } from 'src/logic-functions/data/is-inbox-enabled.util';

export const useIsInboxEnabled = (): boolean => {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    isInboxEnabled({ metadataClient: new MetadataApiClient() })
      .then((isInboxEnabledForWorkspace) => {
        if (!isCancelled) {
          setIsEnabled(isInboxEnabledForWorkspace);
        }
      })
      // A failed read is treated like Inbox being off.
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, []);

  return isEnabled;
};
