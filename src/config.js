import 'dotenv/config';

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return {
    port: Number(env.PORT || 3000),
    // Hops of reverse proxies in front of the API, so rate limiting sees the real client IP.
    trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) : 0,
    corsOrigins: (env.CORS_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    supabase: {
      url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      jwtSecret: env.SUPABASE_JWT_SECRET || null,
    },
    auth: {
      passwordResetRedirectUrl: env.PASSWORD_RESET_REDIRECT_URL || undefined,
      inviteRedirectUrl: env.INVITE_REDIRECT_URL || undefined,
    },
    invoices: {
      bucket: env.INVOICE_BUCKET || 'invoices',
      signedUrlTtl: Number(env.SIGNED_URL_TTL_SECONDS || 600),
      defaultCurrency: env.DEFAULT_CURRENCY || 'USD',
    },
    company: {
      name: env.COMPANY_NAME || 'Company',
      contactName: env.COMPANY_CONTACT_NAME || '',
      // Use '|' to separate address lines.
      addressLines: (env.COMPANY_ADDRESS || '').split('|').map((l) => l.trim()).filter(Boolean),
      email: env.COMPANY_EMAIL || '',
      phone: env.COMPANY_PHONE || '',
      logoPath: env.COMPANY_LOGO_PATH ?? 'assets/logo.png',
      signaturePath: env.COMPANY_SIGNATURE_PATH ?? 'assets/signature.png',
    },
    bank: {
      accountName: env.BANK_ACCOUNT_NAME || '',
      bankName: env.BANK_NAME || '',
      branch: env.BANK_BRANCH || '',
      accountNumber: env.BANK_ACCOUNT_NUMBER || '',
      swiftCode: env.BANK_SWIFT_CODE || '',
      accountType: env.BANK_ACCOUNT_TYPE || '',
    },
    projectInvoices: {
      // Printed before the employee's first name: "Payment for Backend Developer Er. Sachin".
      namePrefix: env.PROJECT_INVOICE_NAME_PREFIX ?? 'Er. ',
      // Decimal places of the per-day rate used for leave deductions (0 = whole units).
      perDayDecimals: Number(env.PROJECT_INVOICE_PER_DAY_DECIMALS ?? 0),
      // Default due date: this day of the month after the issue date.
      dueDayOfNextMonth: Number(env.PROJECT_INVOICE_DUE_DAY ?? 5),
      // Lowest S-number to suggest; after that, the next number is the highest used + 1.
      startNumber: Number(env.PROJECT_INVOICE_START_NUMBER ?? 2535),
    },
  };
}
