import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import WorkspaceBar from "@/components/layout/WorkspaceBar";
import { SharedOrderEntryProvider } from "@/components/market/SharedOrderEntryProvider";
import TradingDataProvider from "@/components/market/TradingDataProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SharedOrderEntryProvider>
    <TradingDataProvider />
    <div className="flex h-screen min-h-0 min-w-0 max-w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto p-6">{children}</main>
        <WorkspaceBar />
      </div>
    </div>
    </SharedOrderEntryProvider>
  );
}
