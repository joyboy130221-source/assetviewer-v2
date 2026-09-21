/**
 * Central product messaging used by public-facing application surfaces.
 * Keeping copy outside page components makes future branding changes reusable
 * without coupling presentation code to product wording.
 */
export interface ProductMessaging {
  readonly login: {
    readonly headline: string;
    readonly capabilityTagline: string;
    readonly description: string;
  };
}

export const productMessaging: ProductMessaging = {
  login: {
    headline: "Integration and extension, built in one platform.",
    capabilityTagline:
      "Connect → Transform → Automate → Build → Visualize → Govern",
    description:
      "Connect enterprise systems, transform and automate data flows, build integrated experiences, visualize operational insights, and govern everything from one controlled workspace.",
  },
};
