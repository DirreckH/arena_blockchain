export interface RequesterComparisonSetDeliveryWebhookTransportConfig {
  type: "webhook";
  targetUrl: string;
  credentialKey?: string | null;
}

export type RequesterComparisonSetDeliveryTransportConfig =
  | RequesterComparisonSetDeliveryWebhookTransportConfig;

export interface RequesterComparisonSetDeliveryTransportResult {
  deliveredAt: string;
  statusCode: number;
  authentication: {
    kind: "none" | "bearer";
    credentialKey: string | null;
  };
}
