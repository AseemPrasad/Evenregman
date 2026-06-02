import { Card, CardContent } from "@/components/ui/card";

type OverviewCardProps = {
  label: string;
  value: number;
  description: string;
};

export function OverviewCard({ label, value, description }: OverviewCardProps) {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardContent className="p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
