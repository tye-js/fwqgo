export function getMissingOfferTransition(input: {
  missingRuns: number;
  threshold: number;
  status: string;
  statusLocked: boolean;
}) {
  const missingRuns = Math.max(0, input.missingRuns) + 1;
  const shouldDiscontinue =
    missingRuns >= input.threshold && !input.statusLocked;
  return {
    missingRuns,
    status: shouldDiscontinue ? "discontinued" : input.status,
    statusChanged: shouldDiscontinue && input.status !== "discontinued",
  };
}

export function canReviewProviderOfferCandidate(status: string) {
  return status === "pending";
}
