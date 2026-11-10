import JSZip from "jszip";
import type { ProjectFiles } from "@/lib/react-project";

const BASE_DEPS: Record<string, string> = {
  react: "19.2.0",
  "react-dom": "19.2.0",
  "lucide-react": "0.575.0",
  "@tanstack/react-router": "1.170.41",
};

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "findmit-app";
}

/** Packages FindMit files as a runnable Vite + React project (npm install && npm run dev). */
export async function exportZip(name: string, files: ProjectFiles) {
  const zip = new JSZip();
  let extra: Record<string, string> = {};
  try {
    extra = (JSON.parse(files["/package.json"] ?? "{}") as { dependencies?: Record<string, string> }).dependencies ?? {};
  } catch { /* ignore */ }
  for (const [path, code] of Object.entries(files)) {
    if (path === "/package.json") continue;
    zip.file(`src${path}`, code);
  }
  zip.file("findmit.json", JSON.stringify({ format: "findmit-zip-v1", name }, null, 2));
  zip.file(
    "package.json",
    JSON.stringify(
      {
        name: slug(name),
        private: true,
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: { ...extra, ...BASE_DEPS },
        devDependencies: { "@vitejs/plugin-react": "^5.0.0", typescript: "^5.6.0", vite: "^7.0.0", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" },
      },
      null,
      2,
    ),
  );
  zip.file(
    "index.html",
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<title>${name.replace(/</g, "")}</title>\n<script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body>\n<div id="root"></div>\n<script type="module" src="/src/index.tsx"></script>\n</body>\n</html>\n`,
  );
  zip.file("vite.config.ts", `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({ plugins: [react()] });\n`);
  zip.file(
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx", strict: false, skipLibCheck: true, lib: ["ES2022", "DOM", "DOM.Iterable"] }, include: ["src"] }, null, 2),
  );
  zip.file("README.md", `# ${name}\n\nBuilt with FindMit App Builder.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`);
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(name)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const TEXT = /\.(tsx?|jsx?|css|json|md|html|svg|txt)$/i;

/** Reads a project ZIP (FindMit export or any Vite/React src folder) into FindMit files. */
export async function importZip(file: File): Promise<{ name: string; files: ProjectFiles }> {
  const zip = await JSZip.loadAsync(file);
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p]!.dir && !/(^|\/)(node_modules|\.git|dist)\//.test(p) && TEXT.test(p));
  const appPath = paths.find((p) => /(^|\/)src\/App\.(tsx|jsx)$/.test(p)) ?? paths.find((p) => /(^|\/)App\.(tsx|jsx)$/.test(p));
  if (!appPath) throw new Error("This ZIP has no App.tsx file.");
  const root = appPath.replace(/App\.(tsx|jsx)$/, "");
  let name = file.name.replace(/\.zip$/i, "");
  const files: ProjectFiles = {};
  for (const p of paths) {
    if (/(^|\/)findmit\.json$/.test(p)) {
      try { name = (JSON.parse(await zip.files[p]!.async("string")) as { name?: string }).name ?? name; } catch { /* ignore */ }
      continue;
    }
    if (!p.startsWith(root)) continue;
    files[`/${p.slice(root.length)}`] = await zip.files[p]!.async("string");
  }
  if (!files["/App.tsx"] && files["/App.jsx"]) {
    files["/App.tsx"] = files["/App.jsx"];
    delete files["/App.jsx"];
  }
  const pkgPath = paths.find((p) => p === `${root.replace(/src\/$/, "")}package.json`);
  if (pkgPath) {
    try {
      const deps = (JSON.parse(await zip.files[pkgPath]!.async("string")) as { dependencies?: Record<string, string> }).dependencies ?? {};
      for (const k of Object.keys(BASE_DEPS)) delete deps[k];
      if (Object.keys(deps).length) files["/package.json"] = JSON.stringify({ dependencies: deps }, null, 2);
    } catch { /* ignore */ }
  }
  delete files["/findmit.ts"];
  return { name, files };
}
