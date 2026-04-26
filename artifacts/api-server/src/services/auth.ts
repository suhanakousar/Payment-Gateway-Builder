import bcrypt from "bcryptjs";
import * as merchantsRepo from "../repositories/merchants";
import { signAuthToken, type AuthMerchant } from "../middlewares/auth";

const BCRYPT_ROUNDS = 12;

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function validatePassword(pw: string): void {
  if (pw.length < 8) throw new AuthError("Password must be at least 8 characters");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    throw new AuthError("Password must contain a letter and a digit");
  }
}

export async function signup(input: {
  name: string;
  email: string;
  password: string;
  businessName: string;
}): Promise<{ merchant: AuthMerchant; token: string }> {
  validatePassword(input.password);
  const email = input.email.toLowerCase().trim();
  const existing = await merchantsRepo.findByEmail(email);
  if (existing) throw new AuthError("Email already registered", 409);

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const merchant = await merchantsRepo.insertMerchant({
    name: input.name.trim(),
    email,
    passwordHash,
    businessName: input.businessName.trim(),
  });
  const auth = { id: merchant.id, email: merchant.email };
  return { merchant: auth, token: signAuthToken(auth) };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ merchant: AuthMerchant; token: string }> {
  const email = input.email.toLowerCase().trim();
  const found = await merchantsRepo.findByEmail(email);
  if (!found) throw new AuthError("Invalid email or password", 401);
  const ok = await bcrypt.compare(input.password, found.passwordHash);
  if (!ok) throw new AuthError("Invalid email or password", 401);
  const auth = { id: found.id, email: found.email };
  return { merchant: auth, token: signAuthToken(auth) };
}
