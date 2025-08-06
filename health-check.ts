import { redis } from "bun";
import type { ServiceHealth } from "./types";

if (!process.env.PAYMENT_PROCESSOR_URL_DEFAULT || !process.env.PAYMENT_PROCESSOR_URL_FALLBACK) {
  process.exit(1);
}

const url_default = process.env.PAYMENT_PROCESSOR_URL_DEFAULT;
const url_fallback = process.env.PAYMENT_PROCESSOR_URL_FALLBACK;

async function healthCheck(url: string): Promise<ServiceHealth | null> {
  const response = await fetch(`${url}/payments/service-health`);

  if (response.status != 200) {
    return null;
  }

  const service_health = await response.json() as ServiceHealth;
  return service_health;
}

async function saveToRedis() {
  const [health_default, health_fallback] = await Promise.all([
    healthCheck(url_default),
    healthCheck(url_fallback),
  ]);

  if (health_default) {
    await redis.hmset("health:default", [
      "failing",
      health_default.failing,
      "minResponseTime",
      health_default.minResponseTime.toString(),
    ]);
  }

  if (health_fallback) {
    await redis.hmset("health:fallback", [
      "failing",
      health_fallback.failing,
      "minResponseTime",
      health_fallback.minResponseTime.toString(),
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
