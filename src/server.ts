import { redis } from "bun";
import { Payment, Processor } from "./types";

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

Bun.serve({
  port: 3000,
  routes: {
    "/payments": {
      POST: async request => {
        const payment = Payment.parse(await request.json());

        try {
          await redis.lpush("payment_queue", JSON.stringify(payment));
        } catch (error) {
          return Response.json({message: "Payment could not be processed."}, {status: 500});
        }

        return Response.json(null, { status: 202 });
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
              summary.default.totalAmount += payment.amount;
              summary.default.totalRequests += 1;
              break;
            case Processor.Fallback:
              summary.fallback.totalAmount += payment.amount;
              summary.fallback.totalRequests += 1;
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
