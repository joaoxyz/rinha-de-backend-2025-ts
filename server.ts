import { redis } from "bun";
import { ServiceHealth, Payment, Processor } from "./types";

if (!process.env.PAYMENT_PROCESSOR_URL_DEFAULT || !process.env.PAYMENT_PROCESSOR_URL_FALLBACK) {
  process.exit(1);
}

const urlDefault = process.env.PAYMENT_PROCESSOR_URL_DEFAULT;
const urlFallback = process.env.PAYMENT_PROCESSOR_URL_FALLBACK;

// TODO: improve logic for chosing processor
async function chooseProcessor(): Promise<Processor> {
  const defaultHealthData = await redis.hmget("health:default", ["failing", "minResponseTime"]);
  const fallbackHealthData = await redis.hmget("health:fallback", ["failing", "minResponseTime"]);

  const defaultHealth = ServiceHealth.parse({
    failing: (defaultHealthData[0] === "true"),
    minResponseTime: defaultHealthData[1],
  });

  const fallbackHealth = ServiceHealth.parse({
    failing: (fallbackHealthData[0] === "true"),
    minResponseTime: fallbackHealthData[1],
  });

  if (defaultHealth.failing) {
    return Processor.Fallback;
  }

  return Processor.Default;
}

Bun.serve({
  port: 3000,
  routes: {
    "/payments": {
      POST: async request => {
        const payment = Payment.parse(await request.json());
        const processor = await chooseProcessor();

        let processorUrl : string | undefined = undefined;
        switch (processor) {
          case Processor.Default:
            processorUrl = urlDefault;
            break;
          case Processor.Fallback:
            processorUrl = urlFallback;
            break;
          default:
            processorUrl = undefined as never;
        }

        // Add timestamp to request body
        payment.requestedAt = new Date().toISOString();
        const response = await fetch(`${processorUrl}/payments`, {
          method: "POST",
          body: JSON.stringify(payment),
          headers: { "Content-Type": "application/json" },
        });

        if (response.status == 200) {
          await redis.hincrby(`summary:${processor}`, "totalRequests", 1);
          await redis.hincrbyfloat(`summary:${processor}`, "totalAmount", payment.amount);
        }

        return response;
      }
    },
    "/payments-summary": {
      GET: async request => {
        const searchParams = new URL(request.url).searchParams;

        // TODO: check if keys exist
        const from = searchParams.get("from");
        const to = searchParams.get("to");

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
