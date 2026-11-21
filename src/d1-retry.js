// D1 resource throttling uses a ten-second window. Only idempotent operations
// may use this retry helper, since a response can fail after a write succeeds.
export const D1_RESOURCE_COOLDOWN_MS = 11_000;
export const waitForD1 = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function retryD1Operation(operation, { sleep = waitForD1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 3 || !String(error?.message || error).includes("D1 DB is overloaded"))
        throw error;
      console.warn("Retrying idempotent D1 operation after overload", { attempt: attempt + 1 });
      await sleep(D1_RESOURCE_COOLDOWN_MS * (attempt + 1));
    }
  }
}
