export type SubscriptionFormState =
  | { status: "idle" | "submitting" | "success" }
  | { status: "error"; message: string };

export function subscriptionResult(ok: boolean): SubscriptionFormState {
  return ok
    ? { status: "success" }
    : { status: "error", message: "We couldn't add you right now. Please try again." };
}
