import React from "react";

export default function EmptyState({ title, description, icon }: { title?: string; description?: string; icon?: React.ReactNode }) {
  return (
    <div className="empty-state fade-in">
      <div className="mb-4 text-3xl">{icon ?? "📭"}</div>
      <h3 className="mb-2 text-lg font-semibold">{title ?? "No items yet"}</h3>
      <p className="text-sm text-muted-foreground">{description ?? "There are no records to show right now."}</p>
    </div>
  );
}
