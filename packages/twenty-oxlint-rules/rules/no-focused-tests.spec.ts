import { RuleTester } from 'oxlint/plugins-dev';

import { rule, RULE_NAME } from './no-focused-tests';

const ruleTester = new RuleTester();

ruleTester.run(RULE_NAME, rule, {
  valid: [
    { code: "it('runs', () => {});" },
    { code: "test('runs', () => {});" },
    { code: "describe('suite', () => { it('runs', () => {}); });" },
    { code: "it.skip('skipped but not focused', () => {});" },
    { code: "somethingElse.only('not a test runner', () => {});" },
    { code: "it['only']('computed access is not checked', () => {});" },
  ],
  invalid: [
    {
      code: "it.only('focused', () => {});",
      errors: [{ messageId: 'focusedTest' }],
    },
    {
      code: "test.only('focused', () => {});",
      errors: [{ messageId: 'focusedTest' }],
    },
    {
      code: "describe.only('focused', () => {});",
      errors: [{ messageId: 'focusedTest' }],
    },
    {
      code: "fit('focused', () => {});",
      errors: [{ messageId: 'focusedTest' }],
    },
    {
      code: "it.each([[1]]).only('focused table', (value) => {});",
      errors: [{ messageId: 'focusedTest' }],
    },
  ],
});
