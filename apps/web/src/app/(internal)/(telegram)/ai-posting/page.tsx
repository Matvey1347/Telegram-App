import { redirect } from "next/navigation";

export default function AiPostingRoute() {
  redirect("/telegram-posts?postView=ai-posting");
}
