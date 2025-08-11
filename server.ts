import { redis } from "bun";
import { ServiceHealth, Payment, Processor } from "./types";

if (!process.env.PAYMENT_PROCESSOR_URL_DEFAULT || !process.env.PAYMENT_PROCESSOR_URL_FALLBACK) {
  process.exit(1);
}

const urlDefault = process.env.PAYMENT_PROCESSOR_URL_DEFAULT;
const urlFallback = process.env.PAYMENT_PROCESSOR_URL_FALLBACK;

async function chooseProcessor(): Promise<Processor> {
  const [defaultHealthData, fallbackHealthData] = await Promise.all([
    redis.hmget("health:default", ["failing", "minResponseTime"]),
    redis.hmget("health:fallback", ["failing", "minResponseTime"]),
  ]);

  const defaultHealth = ServiceHealth.parse({
    failing: (defaultHealthData[0] === "true"),
    minResponseTime: defaultHealthData[1],
  });

  const fallbackHealth = ServiceHealth.parse({
    failing: (fallbackHealthData[0] === "true"),
    minResponseTime: fallbackHealthData[1],
  });

  if (defaultHealth.failing && fallbackHealth.failing) {
    throw new Error("Payment processors unavaliable. Try again later.");
  }

  if (defaultHealth.failing) {
    return Processor.Fallback;
  }

  if (fallbackHealth.minResponseTime <= defaultHealth.minResponseTime/2) {
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

        let processorUrl: string | undefined = undefined;
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
          await redis.hmset("payment", [
            payment.correlationId,
            JSON.stringify({
              amount: payment.amount,
              requestedAt: payment.requestedAt,
              processor: processor,
            })
          ]);
        }

        return response;
      }
    },
    "/payments-summary": {
      GET: async request => {
        const searchParams = new URL(request.url).searchParams;

        const from = searchParams.get("from");
        const to = searchParams.get("to");

        const paymentList = await redis.hgetall("payment");

        if (!paymentList) {
          return Response.json({message: "Could not retrieve payments from database."}, {status: 404});
        }

        const summary = {
          default: {
            totalRequests: 0,
            totalAmount: 0,
          },
          fallback: {
            totalRequests: 0,
            totalAmount: 0,
          }
        };

        for (const rawPaymentData of Object.values(paymentList)) {
          const payment = JSON.parse(rawPaymentData);
          if (!from || Date.parse(from) > Date.parse(payment.requestedAt)) {
            continue;
          }

          if (!to || Date.parse(to) < Date.parse(payment.requestedAt)) {
            continue;
          }

          switch (payment.processor) {
            case Processor.Default:
              summary.default.totalAmount += payment.amount
              summary.default.totalRequests += 1
              break;
            case Processor.Fallback:
              summary.fallback.totalAmount += payment.amount
              summary.fallback.totalRequests += 1
              break;
          }
        }

        return Response.json(summary);
      }
    },
  },
  error(error) {
    return Response.json({error: error.message}, { status: 500 });
  }
});
