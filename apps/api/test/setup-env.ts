// Integration suites send hundreds of requests from one IP. Rate limiting is
// off for them unless a suite opts in (see rate-limit.integration.ts).
process.env.RATE_LIMIT_MULTIPLIER ??= '0';
