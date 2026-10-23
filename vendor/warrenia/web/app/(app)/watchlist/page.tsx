import { redirect } from "next/navigation";

export default function WatchlistPage() {
  redirect("/radar?preset=watch");
}
