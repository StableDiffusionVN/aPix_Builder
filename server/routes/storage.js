export function createStorageRoutes(context) {
  const {
    handleAppSettings,
    handleOpenDirectory,
    handleStorageSettings
  } = context;

  return async function storageRoutes(req, res, url) {
    if (
      (req.method === "GET" || req.method === "POST")
      && url.pathname === "/api/storage-settings"
    ) {
      await handleStorageSettings(req, res);
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/open-directory") {
      await handleOpenDirectory(req, res);
      return true;
    }
    if (
      (req.method === "GET" || req.method === "POST")
      && url.pathname === "/api/app-settings"
    ) {
      await handleAppSettings(req, res);
      return true;
    }
    return false;
  };
}
