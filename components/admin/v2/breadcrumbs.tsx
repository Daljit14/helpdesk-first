import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function AdminBreadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li
            key={`${item.label}-${index}`}
            className="flex items-center gap-1"
          >
            {index > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
            {item.href ? (
              <Link
                href={item.href}
                className="underline-offset-4 hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
