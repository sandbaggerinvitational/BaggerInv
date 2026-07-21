import { redirect } from "next/navigation";

export default async function MatchSimulatorPage({ searchParams }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  });
  redirect(`/war-room${params.size ? `?${params.toString()}` : ""}`);
}
