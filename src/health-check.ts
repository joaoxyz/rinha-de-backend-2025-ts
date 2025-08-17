import { redis } from "bun";
import { ServiceHealth } from "./types";

const config = {
  urls: {
    default: process.env.PAYMENT_PROCESSOR_URL_DEFAULT,
    fallback: process.env.PAYMENT_PROCESSOR_URL_FALLBACK,
  }
};

if (!config.urls.default || !config.urls.fallback) {
  console.error("Missing payment processor URL environment variables.");
  process.exit(1);
}

async function healthCheck(url: string): Promise<ServiceHealth | null> {
  const response = await fetch(`${url}/payments/service-health`);

  if (response.status != 200) {
    return null;
  }

  const serviceHealth = ServiceHealth.parse(await response.json());
  return serviceHealth;
}

async function saveToRedis() {
  const [healthDefault, healthFallback] = await Promise.all([
    healthCheck(config.urls.default),
    healthCheck(config.urls.fallback),
  ]);

  if (healthDefault) {
    await redis.hmset("health:default", [
      "failing",
      healthDefault.failing.toString(),
      "minResponseTime",
      healthDefault.minResponseTime.toString(),
    ]);
  }

  if (healthFallback) {
    await redis.hmset("health:fallback", [
      "failing",
      healthFallback.failing.toString(),
      "minResponseTime",
      healthFallback.minResponseTime.toString(),
    ]);
  }
}

saveToRedis();

// setTimeout loop to guarantee request order
// see https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval#usage_notes
(function loop() {
  setTimeout(() => {
    saveToRedis();
    loop();
  }, 5000);
})();
