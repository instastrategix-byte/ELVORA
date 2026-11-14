import { redirect } from "next/navigation";
import { requirePageSession } from "@backend/auth/viewer";

export default async function MyProfilePage() {
  const { viewer } = await requirePageSession({ next: "/profile" });
  redirect(`/members/${viewer.handle}`);
}
