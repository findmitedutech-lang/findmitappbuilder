export const REACT_PROJECT_FORMAT = "findmit-react-v1" as const;

export type ProjectFiles = Record<string, string>;

export type ProjectSource =
  | { kind: "empty" }
  | { kind: "html"; code: string }
  | { kind: "react"; files: ProjectFiles };

type SerializedProject = {
  format: typeof REACT_PROJECT_FORMAT;
  files: ProjectFiles;
};

export function normalizeProjectPath(path: string): string {
  const clean = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = clean.split("/").filter((part) => part && part !== ".");
  if (!parts.length || parts.some((part) => part === "..")) {
    throw new Error("Each generated file needs a valid project path.");
  }
  return `/${parts.join("/")}`;
}

export function serializeProjectFiles(files: ProjectFiles): string {
  const normalized = Object.entries(files).reduce<ProjectFiles>((result, [path, contents]) => {
    result[normalizeProjectPath(path)] = contents;
    return result;
  }, {});
  if (!normalized["/App.tsx"]) throw new Error("A React project must include /App.tsx.");

  const payload: SerializedProject = { format: REACT_PROJECT_FORMAT, files: normalized };
  return JSON.stringify(payload);
}

export function parseProjectSource(source: string): ProjectSource {
  if (!source.trim()) return { kind: "empty" };
  try {
    const parsed = JSON.parse(source) as Partial<SerializedProject>;
    if (parsed.format !== REACT_PROJECT_FORMAT || !parsed.files || typeof parsed.files !== "object") {
      return { kind: "html", code: source };
    }
    const entries = Object.entries(parsed.files);
    if (!entries.length || entries.some(([, contents]) => typeof contents !== "string")) {
      return { kind: "html", code: source };
    }
    const files = entries.reduce<ProjectFiles>((result, [path, contents]) => {
      result[normalizeProjectPath(path)] = contents;
      return result;
    }, {});
    if (!files["/App.tsx"]) return { kind: "html", code: source };
    return { kind: "react", files };
  } catch {
    return { kind: "html", code: source };
  }
}

export function parseGeneratedProject(text: string): { code: string; files: ProjectFiles } {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Gemini returned no project files.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("Gemini returned an incomplete file list. Please try again.");
  }

  if (!parsed || typeof parsed !== "object" || !("files" in parsed)) {
    throw new Error("Gemini returned an invalid project. Please try again.");
  }
  const rawFiles = (parsed as { files: unknown }).files;
  if (!rawFiles || typeof rawFiles !== "object" || Array.isArray(rawFiles)) {
    throw new Error("Gemini returned an invalid file list. Please try again.");
  }
  const entries = Object.entries(rawFiles);
  if (!entries.length || entries.length > 80 || entries.some(([, contents]) => typeof contents !== "string")) {
    throw new Error("Gemini returned an invalid file list. Please try again.");
  }

  const files = entries.reduce<ProjectFiles>((result, [path, contents]) => {
    result[normalizeProjectPath(path)] = contents as string;
    return result;
  }, {});
  const code = serializeProjectFiles(files);
  const source = parseProjectSource(code);
  if (source.kind !== "react") throw new Error("Gemini returned an invalid project. Please try again.");
  return { code, files: source.files };
}
