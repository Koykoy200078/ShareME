// Shared type alias so FilesPanel and page.tsx agree on the shape
import type { useFiles } from "../hooks/useFiles";
export type UseFilesReturn = ReturnType<typeof useFiles>;
