import type { LucideIcon } from "lucide-react";

type Props = { icon: LucideIcon; title: string; description: string; children?: React.ReactNode };

export function EmptyState({ icon: Icon, title, description, children }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-20 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-secondary">
        <Icon className="size-5 text-primary" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
