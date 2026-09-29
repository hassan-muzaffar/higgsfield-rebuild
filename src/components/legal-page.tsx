type Props = { title: string; updated: string; children: React.ReactNode };

export function LegalPage({ title, updated, children }: Props) {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-16 text-sm leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-xs">Last updated {updated}</p>
      {children}
    </article>
  );
}
