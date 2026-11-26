import { defineRule } from '@oxlint/plugins';

import { getCalledMethodName } from '../utils/getCalledMethodName';
import { getRootIdentifierName } from '../utils/getRootIdentifierName';

export const RULE_NAME = 'no-focused-tests';

const FOCUSABLE_TEST_METHODS = ['describe', 'it', 'test'];

// it.each([[1]]).only() chains call expressions before .only
const getRootIdentifierThroughCalls = (node: any): string | undefined => {
  let current = node;
  while (current?.type === 'CallExpression') {
    current = current.callee;
  }
  return getRootIdentifierName(current);
};

export const rule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow focused tests (describe.only, it.only, test.only, fit)',
    },
    messages: {
      focusedTest: 'Unexpected focused test.',
    },
    schema: [],
  },
  create: (context) => {
    return {
      CallExpression: (node: any) => {
        const callee = node.callee;

        const isMemberFocused =
          getCalledMethodName(callee) === 'only' &&
          FOCUSABLE_TEST_METHODS.includes(
            getRootIdentifierThroughCalls(callee?.object) ?? '',
          );

        const isFitAlias =
          callee?.type === 'Identifier' && callee.name === 'fit';

        if (isMemberFocused || isFitAlias) {
          context.report({ node, messageId: 'focusedTest' });
        }
      },
    };
  },
});
