import { api, jsonInit } from "../../../services/api";

export type PasswordPolicy = { minLength: number; minCharacterClasses: number };

export type LoginResponse = {
  message: string;
  mustChangePassword?: boolean;
};

export const authApi = {
  login: (login: string, password: string) =>
    api<LoginResponse>(
      "/api/auth/login",
      jsonInit("POST", { login, password }),
    ),
  logout: () => api("/api/auth/logout", { method: "POST" }),
  passwordPolicy: () =>
    api<{ policy: PasswordPolicy }>("/api/auth/change-password", {
      cache: "no-store",
    }).then((x) => x.policy),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ message: string }>(
      "/api/auth/change-password",
      jsonInit("POST", { currentPassword, newPassword }),
    ),
};

/** Client-side mirror of the server policy, for instant feedback only. */
export function passwordProblems(
  password: string,
  policy: PasswordPolicy,
): string[] {
  const problems: string[] = [];
  if (password.length < policy.minLength)
    problems.push(`At least ${policy.minLength} characters`);
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;
  if (classes < policy.minCharacterClasses)
    problems.push(
      `At least ${policy.minCharacterClasses} of: lowercase, uppercase, number, symbol`,
    );
  return problems;
}
