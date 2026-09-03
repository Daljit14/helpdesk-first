import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center sm:px-6 lg:px-8">
      <h1 className="text-6xl font-bold tracking-tight">404</h1>
      <p className="mt-4 text-2xl font-semibold">Page not found</p>
      <p className="mt-2 max-w-md text-muted-foreground">
        We could not find the page you were looking for. Try searching for a
        support issue or return home.
      </p>
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "default" }), "mt-8")}
      >
        Back to home
      </Link>
    </section>
  );
}
