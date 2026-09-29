import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumbs({
  items,
  label = "Breadcrumb",
}: {
  items: BreadcrumbItem[];
  label?: string;
}) {
  return (
    <nav aria-label={label} className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li
            key={`${item.label}-${index}`}
            className="flex items-center gap-1"
          >
            {index > 0 && <ChevronRight className="h-4 w-4" aria-hidden />}
            {item.href ? (
              <Link href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
