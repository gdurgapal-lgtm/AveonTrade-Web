import { Card } from "@/components/ui/Primitives";

const LINKS = [
  { label: "Notices & Addendums", endpoint: "/nontransactional/v1/addendumAndNotices" },
  { label: "GTD Orders", endpoint: "/transactional/v1/gtdOrders" },
  { label: "Margin Info", endpoint: "/transactional/v1/marginInfo/detailed_limit" },
  { label: "Bank Accounts", endpoint: "/transactional/v1/getBankAccList" },
];

export default function MorePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">More</h1>
      <Card>
        <p className="mb-3 text-sm text-aveon-muted">
          Remaining broker endpoints already mapped in{" "}
          <code className="rounded bg-white/10 px-1">src/lib/endpoints.ts</code>, waiting on a screen:
        </p>
        <ul className="space-y-2 text-sm">
          {LINKS.map((l) => (
            <li key={l.endpoint} className="flex items-center justify-between">
              <span>{l.label}</span>
              <code className="text-xs text-aveon-muted">{l.endpoint}</code>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
