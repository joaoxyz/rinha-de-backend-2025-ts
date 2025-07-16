interface Payment {
  correlationId: string,
  amount: number,
  requestedAt?: string
}

const url_default = process.env.PAYMENT_PROCESSOR_URL_DEFAULT
const url_fallback = process.env.PAYMENT_PROCESSOR_URL_FALLBACK

let totalReq = 0;
let totalAmount = 0;

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
          totalReq += 1
          totalAmount += payment.amount
        }

        return response
      }
    },
    "/payments-summary": {
      GET: () => {
        return Response.json({
          default: {
            totalAmount: totalAmount,
            totalRequests: totalReq
          },
          fallback: {
            totalAmount: 0,
            totalRequests: 0
          }
        })
      }
    },
    "/purge-payments": {
      POST: () => {
        totalReq = 0
        totalAmount = 0
        return Response.json({message: "All payments purged"}, {status: 200})
      }
    }
  },
  error(error) {
    // console.error(error);
    return Response.json({error: error.message}, { status: 500 });
  }
});
