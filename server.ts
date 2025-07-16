import { RedisClient } from "bun";

interface Payment {
  correlationId: string,
  amount: number,
  requestedAt?: string
}

const url_default = process.env.PAYMENT_PROCESSOR_URL_DEFAULT
const url_fallback = process.env.PAYMENT_PROCESSOR_URL_FALLBACK

const redis = new RedisClient()

Bun.serve({
  port: 3000,
  routes: {
    "/payments": {
      POST: async req => {
        const payment = await req.json() as Payment
        payment.requestedAt = new Date().toISOString()

        const response = await fetch(`${url_default}/payments`, {
          method: "POST",
          body: JSON.stringify(payment),
          headers: { "Content-Type": "application/json" },
        });

        if (response.status == 200) {
          // totalReq += 1
          // totalAmount += payment.amount
          await redis.hincrby("default", "totalRequests", 1)
          await redis.hincrbyfloat("default", "totalAmount", payment.amount)
        }

        return response
      }
    },
    "/payments-summary": {
      GET: async () => {
        const defaultFields = await redis.hmget("default", ["totalRequests", "totalAmount"]);
        const fallbackFields = await redis.hmget("fallback", ["totalRequests", "totalAmount"]);
        return Response.json({
          default: {
            totalRequests: defaultFields[0],
            totalAmount: defaultFields[1],
          },
          fallback: {
            totalRequests: fallbackFields[0],
            totalAmount: fallbackFields[1],
          }
        })
      }
    },
    "/purge-payments": {
      POST: async () => {
        await redis.hmset("default", [
          "totalRequests",
          "0",
          "totalAmount",
          "0",
        ])
        await redis.hmset("fallback", [
          "totalRequests",
          "0",
          "totalAmount",
          "0",
        ])
        return Response.json({message: "All payments purged"}, {status: 200})
      }
    }
  },
  error(error) {
    // console.error(error);
    return Response.json({error: error.message}, { status: 500 });
  }
});
