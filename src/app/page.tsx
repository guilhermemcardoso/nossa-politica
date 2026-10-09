import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">
        Nossa Política
      </h1>
      <p className="text-lg text-muted-foreground">
        Encontre um deputado ou senador e veja, com dados oficiais, quanto ele
        gastou, quantos projetos apresentou, como votou e se compareceu.
      </p>
      <div>
        <Button size="lg" disabled>
          Em breve
        </Button>
      </div>
    </main>
  );
}
