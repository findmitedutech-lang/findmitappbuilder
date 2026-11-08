import { useMemo } from "react";
import { SandpackPreview, SandpackProvider } from "@codesandbox/sandpack-react";
import type { ProjectFiles } from "@/lib/react-project";

const dependencies = {
  react: "19.2.0",
  "react-dom": "19.2.0",
  "lucide-react": "0.575.0",
  "@tanstack/react-router": "1.170.41",
};

export default function ReactAppRunner({ files }: { files: ProjectFiles }) {
  const sandpackFiles = useMemo(
    () => Object.fromEntries(Object.entries(files).map(([path, code]) => [path, { code }])),
    [files],
  );
  const packageDependencies = useMemo(() => {
    try {
      const pkg = JSON.parse(files["/package.json"] ?? "{}") as { dependencies?: Record<string, string> };
      return pkg.dependencies ?? {};
    } catch {
      return {};
    }
  }, [files]);

  return (
    <div className="h-full min-h-0 w-full overflow-hidden rounded-xl border border-border bg-card [&_.sp-loading]:hidden">
      <SandpackProvider
        template="react-ts"
        files={sandpackFiles}
        customSetup={{ dependencies: { ...packageDependencies, ...dependencies } }}
        options={{
          externalResources: ["https://cdn.tailwindcss.com"],
          recompileMode: "delayed",
          recompileDelay: 500,
        }}
      >
        <SandpackPreview
          showRefreshButton
          showOpenInCodeSandbox={false}
          showSandpackErrorOverlay
          style={{ height: "100%", minHeight: 420 }}
        />
      </SandpackProvider>
    </div>
  );
}
