import type {
  NetworkRecommendationRequestV1,
  evaluateNetworkCandidate,
} from "@fwqgo/core/network-assessment";

export type NetworkRecommendationResponseV1 = {
  resultStatus: "ok" | "insufficient" | "unavailable";
  generatedAt: string;
  normalizedInput: NetworkRecommendationRequestV1;
  formulaVersion: string;
  policyChecksum: string;
  candidates: Array<
    ReturnType<typeof evaluateNetworkCandidate> & {
      slug: string;
      name: string;
      enName: string | null;
    }
  >;
};

export type PublicNetworkRecommendationError = {
  error?: string;
  issues?: Array<{ path: string; code: string }>;
};

export async function requestNetworkRecommendation(
  input: NetworkRecommendationRequestV1,
): Promise<NetworkRecommendationResponseV1> {
  const response = await fetch("/api/network-lines/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as
    | NetworkRecommendationResponseV1
    | PublicNetworkRecommendationError;
  if (!response.ok || !("candidates" in body)) {
    throw new Error(
      "error" in body && body.error ? body.error : "request_failed",
    );
  }
  return body;
}
