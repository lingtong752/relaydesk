const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim();
}

export function validateCredentials(email: string, password: string): string | null {
  if (!email) {
    return "请输入邮箱地址";
  }

  if (!EMAIL_PATTERN.test(email)) {
    return "请输入有效邮箱地址";
  }

  if (password.length < 6) {
    return "密码至少 6 位";
  }

  return null;
}
