export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (!path) {
    return path;
  }

  try {
    const url = new URL(path);

    if (url.protocol !== 'caremate:') {
      return path;
    }

    const routePath =
      url.pathname && url.pathname !== '/'
        ? url.pathname
        : url.host
          ? `/${url.host}`
          : '/';

    return `${routePath}${url.search}`;
  } catch {
    return path;
  }
}
