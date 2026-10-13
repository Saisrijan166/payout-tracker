import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { AppError, isDuplicateKeyError } from '../../lib/errors';
import { UserModel, type Role, type UserRecord } from '../../models/user.model';
import type { LoginInput, SignupInput } from './auth.schemas';
import { signToken } from './auth.tokens';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: UserDTO;
}

export function toUserDTO(
  user: Pick<UserRecord, '_id' | 'name' | 'email' | 'role' | 'createdAt'>,
): UserDTO {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

function issue(user: UserDTO): AuthResult {
  return { token: signToken({ id: user.id, role: user.role }), user };
}

const emailTaken = (): AppError =>
  new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

export async function signup(input: SignupInput): Promise<AuthResult> {
  if (await UserModel.exists({ email: input.email })) {
    throw emailTaken();
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  try {
    const user = await UserModel.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    });
    return issue(toUserDTO(user));
  } catch (err) {
    // Two signups racing past the exists() check: the unique index decides.
    if (isDuplicateKeyError(err)) throw emailTaken();
    throw err;
  }
}

// Comparing against a dummy hash when the email is unknown keeps response times
// similar, so attackers cannot discover which emails are registered.
let dummyHash: Promise<string> | undefined;
const getDummyHash = (): Promise<string> =>
  (dummyHash ??= bcrypt.hash('dummy-password-for-timing', env.BCRYPT_ROUNDS));

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await UserModel.findOne({ email: input.email })
    .select('+passwordHash')
    .lean<UserRecord>();

  const passwordMatches = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? (await getDummyHash()),
  );
  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  return issue(toUserDTO(user));
}

export async function getCurrentUser(userId: string): Promise<UserDTO> {
  const user = await UserModel.findById(userId).lean<UserRecord>();
  if (!user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'This account no longer exists');
  }
  return toUserDTO(user);
}
