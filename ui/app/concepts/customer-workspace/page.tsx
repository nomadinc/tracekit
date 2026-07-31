import type { Metadata } from "next";
import CustomerWorkspaceConcept from "@/components/concepts/customer-workspace/customer-workspace-concept";

export const metadata: Metadata = {
  title: "Customer Workspace Concept · TraceKit",
  description: "An isolated clickable concept for TraceKit's customer workspace.",
};

export default function CustomerWorkspaceConceptPage() {
  return <CustomerWorkspaceConcept />;
}
