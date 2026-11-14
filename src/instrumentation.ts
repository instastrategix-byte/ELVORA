/** Fails fast at server start-up when production configuration is incomplete. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionConfig } = await import("@backend/core/env");
    assertProductionConfig();
  }
}
