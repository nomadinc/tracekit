import { Card } from "@/components/ui/card";
import { GoogleAdsIntegrationPanel } from "@/components/integrations/google-ads-integration-panel";

export default function GoogleAdsIntegrationPage(){
 return <div className="space-y-6"><Card title="Google Ads"><p className="text-sm text-gray-600 dark:text-gray-300">Manage Google Ads authorizations, discovered manager/client accounts, manual synchronization, and source evidence.</p></Card><GoogleAdsIntegrationPanel /></div>;
}
