import { AppShell } from "@/components/AppShell";

/** The whole app is one client-rendered SPA page (auth enforced by src/proxy.ts). */
export default function Home() {
  return <AppShell />;
}
