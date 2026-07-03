// Shared provider config for tests that need opencode to talk to a fake LLM
// over a real HTTP endpoint. Registers a single provider `test` with
// deterministic test models, pointed at the URL the caller supplies
// (typically a TestLLMServer instance).
//
// Used by:
//   - test/lib/run-process.ts          (subprocess CLI tests)
//   - test/server/httpapi-sdk.test.ts  (in-process SDK tests)
export const testDeepSeekModelID = "test/deepseek-v4-flash-free"

export function testProviderConfig(llmUrl: string) {
  return {
    formatter: false,
    lsp: false,
    provider: {
      test: {
        name: "Test",
        id: "test",
        env: [],
        npm: "@ai-sdk/openai-compatible",
        models: {
          "test-model": {
            id: "test-model",
            name: "Test Model",
            attachment: false,
            reasoning: false,
            temperature: false,
            tool_call: true,
            release_date: "2025-01-01",
            limit: { context: 100_000, output: 10_000 },
            cost: { input: 0, output: 0 },
            options: {},
          },
          "deepseek-v4-flash-free": {
            id: "deepseek-v4-flash-free",
            name: "DeepSeek V4 Flash Free",
            attachment: false,
            reasoning: true,
            temperature: false,
            tool_call: true,
            release_date: "2026-01-01",
            limit: { context: 128_000, output: 16_000 },
            cost: { input: 0, output: 0 },
            options: {},
          },
        },
        options: { apiKey: "test-key", baseURL: llmUrl },
      },
    },
  }
}
