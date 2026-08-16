import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        HelpDesk First
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
        Foundation for customer support — fast, accessible, and ready for your
        Supabase backend.
      </p>
      <Button className="mt-8" size="lg">
        Get started
      </Button>
    </section>
  );
}
