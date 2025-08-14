import { redis } from "bun";
import { Payment, Processor, ServiceHealth } from "./types";

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

  if (defaultHealth.minResponseTime <= 200) {
    return Processor.Default;
  }

  if (fallbackHealth.minResponseTime <= defaultHealth.minResponseTime/2) {
    return Processor.Fallback;
  }

  return Processor.Default;
}

async function processPaymentJob(payment: Payment): Promise<boolean> {
  const processor = await chooseProcessor();
  let processorUrl: string | undefined = undefined;
  switch (processor) {
    case Processor.Default:
      processorUrl = config.urls.default;
      break;
    case Processor.Fallback:
      processorUrl = config.urls.fallback;
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

  if (response.ok) {
    await redis.hmset("payment", [
      payment.correlationId,
      JSON.stringify({
        amount: payment.amount,
        requestedAt: payment.requestedAt,
        processor: processor,
      })
    ]);
    return true;
  } else {
    return false;
  }
}

async function startWorker() {
  while (true) {
    try {
      const result = await redis.send("brpop", ["payment_queue", "0"]);

      if (result) {
        const [_, rawJob] = result;
        const payment = Payment.parse(JSON.parse(rawJob));

        const success = await processPaymentJob(payment);
        if (!success) {
          await redis.lpush("payment_queue", rawJob);
        }
      }
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

startWorker();
