// Same minimum as the server's account-creation schema (server/src/validators/schemas.js).
export const PASSWORD_MIN = 10;
const PASSWORD_MAX = 72;

/** Returns { password?, confirm? } error messages for a new password and its confirmation. */
export function validateNewPassword(password, confirm) {
  const errors = {};
  if (!password) errors.password = 'Enter a new password';
  else if (password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters`;
  else if (password.length > PASSWORD_MAX) errors.password = `Use at most ${PASSWORD_MAX} characters`;
  if (!errors.password && password !== confirm) errors.confirm = 'Passwords do not match';
  return errors;
}
