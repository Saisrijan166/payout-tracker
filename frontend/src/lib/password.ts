// Signup password rules, checked in the browser only (the API itself enforces 8 to 72 characters).
// Drives the live checklist on the signup page and blocks submitting until every rule is met.

export interface PasswordRule {
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { label: '8 to 72 characters', test: (value) => value.length >= 8 && value.length <= 72 },
  { label: 'An uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { label: 'A lowercase letter', test: (value) => /[a-z]/.test(value) },
  { label: 'A number', test: (value) => /\d/.test(value) },
  { label: 'A special character (! @ # $ …)', test: (value) => /[^A-Za-z0-9\s]/.test(value) },
  { label: 'No spaces', test: (value) => !/\s/.test(value) },
];

/** Labels of the rules the password does not meet yet. */
export const unmetPasswordRules = (value: string): string[] =>
  PASSWORD_RULES.filter((rule) => !rule.test(value)).map((rule) => rule.label);
