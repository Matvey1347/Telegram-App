export function financeBrandIcon(theme: "light" | "dark") {
  const dev = process.env.NODE_ENV === "development";
  if (theme === "dark") return dev ? "/brand/groshly-dev-dark-icon.png" : "/brand/groshly-dark-icon.png";
  return dev ? "/brand/groshly-dev-icon-transparent.png" : "/brand/groshly-icon-transparent.png";
}
