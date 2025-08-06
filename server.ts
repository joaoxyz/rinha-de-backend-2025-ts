import { redis } from "bun";
import type { Payment } from "./types";

if (!process.env.PAYMENT_PROCESSOR_URL_DEFAULT || !process.env.PAYMENT_PROCESSOR_URL_FALLBACK) {
  process.exit(1);
}

const url_default = process.env.PAYMENT_PROCESSOR_URL_DEFAULT;
const url_fallback = process.env.PAYMENT_PROCESSOR_URL_FALLBACK;

async function chooseProcessor(): Promise<string> {
  const defaultHealthData = await redis.hmget("health:default", ["totalRequests", "totalAmount"]);
  const fallbackHealthData = await redis.hmget("health:fallback", ["totalRequests", "totalAmount"]);

  const defaultHealth = {
    failing: defaultHealthData[0],
    minResponseTime: defaultHealthData[1],
  };

  const fallbackHealth = {
    failing: fallbackHealthData[0],
    minResponseTime: fallbackHealthData[1],
  };

  if (defaultHealth.failing) {
    return url_fallback;
  }

  return url_default;
}

Bun.serve({
  port: 3000,
  routes: {
    "/payments": {
      POST: async req => {
        const payment = await req.json() as Payment;
        payment.requestedAt = new Date().toISOString();

        const processor_url = chooseProcessor();

        const response = await fetch(`${processor_url}/payments`, {
          method: "POST",
          body: JSON.stringify(payment),
          headers: { "Content-Type": "application/json" },
        });

        if (response.status == 200) {
          await redis.hincrby("summary:default", "totalRequests", 1);
          await redis.hincrbyfloat("summary:default", "totalAmount", payment.amount);
        }

        return response;
      }
    },
    "/payments-summary": {
      GET: async () => {
        const defaultSummary = await redis.hmget("summary:default", ["totalRequests", "totalAmount"]);
        const fallbackSummary = await redis.hmget("summary:fallback", ["totalRequests", "totalAmount"]);
        return Response.json({
          default: {
            totalRequests: defaultSummary[0],
            totalAmount: defaultSummary[1],
          },
          fallback: {
            totalRequests: fallbackSummary[0],
            totalAmount: fallbackSummary[1],
          }
        });
      }
    },
  },
  error(error) {
    return Response.json({error: error.message}, { status: 500 });
  }
});
