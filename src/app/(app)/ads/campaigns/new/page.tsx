import { redirect } from "next/navigation";

/** Campaigns are now created with the Ads Manager wizard. */
export default function NewCampaignPage() {
  redirect("/ads-manager");
}
