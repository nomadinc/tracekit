import type { Metadata } from "next";
import OfferWorkspaceReview from "@/components/concepts/offer-workspace/offer-workspace-review";

export const metadata: Metadata = { title: "Offer Workspace Concept · TraceKit", description: "An isolated strategic Offer decision workspace concept using local mock data." };

export default function OfferWorkspaceConceptPage() { return <OfferWorkspaceReview />; }
