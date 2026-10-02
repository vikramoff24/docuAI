/** Provider built from the server-wide OPENAI_API_KEY (fallback for every organization). */
export const AI_PROVIDER_TOKEN = 'AI_PROVIDER';
/** `(apiKey) => AIProvider`, used to build providers for organization-owned keys. */
export const AI_PROVIDER_FACTORY_TOKEN = 'AI_PROVIDER_FACTORY';
/** Verifies an OpenAI key before it is stored (overridden in tests). */
export const OPENAI_KEY_VERIFIER_TOKEN = 'OPENAI_KEY_VERIFIER';
