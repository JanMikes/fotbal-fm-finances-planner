import type { Metadata } from "next";
import { UiLab } from "./UiLab";

/**
 * Internal style guide of the UI primitives (not linked anywhere). Behind the app login like every non-public
 * route (src/proxy.ts), never indexed. The primitive e2e spec (tests/e2e/ui-primitives.spec.ts) runs against it.
 */
export const metadata: Metadata = {
  title: "UI primitiva | Fotbal FM",
  robots: { index: false, follow: false, nocache: true },
};

export default function UiLabPage() {
  return <UiLab />;
}
