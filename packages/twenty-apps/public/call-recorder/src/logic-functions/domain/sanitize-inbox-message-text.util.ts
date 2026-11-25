const OPENING_BRACKET_PATTERN = /\[/g;
const CLOSING_BRACKET_PATTERN = /\]/g;

// Without brackets, text copied from a summary cannot mention a member or hide a link.
export const sanitizeInboxMessageText = (text: string): string =>
  text
    .replace(OPENING_BRACKET_PATTERN, '(')
    .replace(CLOSING_BRACKET_PATTERN, ')');
