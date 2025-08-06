import { redis } from "bun";
import type { ServiceHealth } from "./types";

if (!process.env.PAYMENT_PROCESSOR_URL_DEFAULT || !process.env.PAYMENT_PROCESSOR_URL_FALLBACK) {
  process.exit(1);
}

const urlDefault = process.env.PAYMENT_PROCESSOR_URL_DEFAULT;
const urlFallback = process.env.PAYMENT_PROCESSOR_URL_FALLBACK;

async function healthCheck(url: string): Promise<ServiceHealth | null> {
  const response = await fetch(`${url}/payments/service-health`);

  if (response.status != 200) {
    return null;
  }

  const serviceHealth = await response.json() as ServiceHealth;
  return serviceHealth;
}

async function saveToRedis() {
  const [healthDefault, healthFallback] = await Promise.all([
    healthCheck(urlDefault),
    healthCheck(urlFallback),
  ]);

  if (healthDefault) {
    await redis.hmset("health:default", [
      "failing",
      healthDefault.failing,
      "minResponseTime",
      healthDefault.minResponseTime.toString(),
    ]);
  }

  if (healthFallback) {
    await redis.hmset("health:fallback", [
      "failing",
      healthFallback.failing,
      "minResponseTime",
      healthFallback.minResponseTime.toString(),
    ]);
  }
}

await saveToRedis();

// setTimeout loop to guarantee request order
// see https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval#usage_notes
(function loop() {
  setTimeout(() => {
    saveToRedis();
    loop();
  }, 5500);
})();
