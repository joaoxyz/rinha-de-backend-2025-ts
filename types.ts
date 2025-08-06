export interface ServiceHealth {
  failing: string,
  minResponseTime: number,
}

export interface Payment {
  correlationId: string,
  amount: number,
  requestedAt?: string,
}
