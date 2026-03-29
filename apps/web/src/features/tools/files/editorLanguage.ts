export function getFileExtension(filePath: string): string {
  const fileName = filePath.split("/").filter(Boolean).at(-1) ?? filePath;
  const extension = fileName.includes(".") ? fileName.split(".").at(-1) ?? "" : "";
  return extension.toLowerCase();
}

export function getLanguageModeKey(filePath: string): string {
  const extension = getFileExtension(filePath);

  if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(extension)) {
    return "javascript";
  }

  if (extension === "json") {
    return "json";
  }

  if (["md", "mdx"].includes(extension)) {
    return "markdown";
  }

  if (["html", "htm"].includes(extension)) {
    return "html";
  }

  if (["css", "scss", "sass", "less"].includes(extension)) {
    return "css";
  }

  if (["xml", "svg"].includes(extension)) {
    return "xml";
  }

  if (extension === "py") {
    return "python";
  }

  return "plain";
}
