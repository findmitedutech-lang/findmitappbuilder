import { ClientOnly, createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { getPublishedApp } from "@/lib/publish.functions";
import { parseProjectSource } from "@/lib/react-project";

const ReactAppRunner = lazy(() => import("@/components/ReactAppRunner"));

export const Route = createFileRoute("/p/$id")({
  loader: async ({ params }) => {
    const app = await getPublishedApp({ data: { id: params.id } });
    if (!app) throw notFound();
    return app;
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.name} — made with FindMit` : "App — FindMit";
    return {
      meta: [
        { title: t },
        { name: "description", content: "An app built with FindMit App Builder." },
        { property: "og:title", content: t },
        { property: "og:description", content: "An app built with FindMit App Builder." },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: Live,
  notFoundComponent: () => <div className="flex h-screen items-center justify-center bg-background text-foreground">This app hasn't been published.</div>,
  errorComponent: () => <div className="flex h-screen items-center justify-center bg-background text-foreground">Couldn't load this app.</div>,
});

function Live() {
  const app = Route.useLoaderData();
  const source = parseProjectSource(app.code);

  if (source.kind === "react") {
    return (
      <ClientOnly fallback={<div className="flex h-screen items-center justify-center bg-background text-muted-foreground">Starting app…</div>}>
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background text-muted-foreground">Starting app…</div>}>
          <div className="fixed inset-0"><ReactAppRunner files={source.files} apiKey={app.apiKey} /></div>
        </Suspense>
      </ClientOnly>
    );
  }

  return <iframe title={app.name} srcDoc={app.code} sandbox="allow-scripts allow-forms allow-modals allow-popups" className="fixed inset-0 h-full w-full border-0" />;
}
