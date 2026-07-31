import type { Metadata } from "next";
import OrderWorkspaceConcept from "@/components/concepts/order-workspace/order-workspace-concept";

export const metadata: Metadata = {
  title: "Order Workspace Concept · TraceKit",
  description: "An isolated Order Profit Investigation Workspace concept using local mock Evidence.",
};

export default function OrderWorkspaceConceptPage() {
  return <OrderWorkspaceConcept />;
}
