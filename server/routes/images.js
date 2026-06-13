export function createImagesRoutes(context) {
  const {
    handleDeleteInputImage,
    handleDeleteOutputHistory,
    handleInputFromUrl,
    handleInputImage,
    handleInputScanFolder,
    handleInputUpload,
    handleOutputImage,
    handleReplaceOutputImage,
    handleSaveColorAdjust,
    handleSaveEditedOutput,
    listInputImages,
    readOutputHistory,
    send
  } = context;

  return async function imageRoutes(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/input-images") {
      const all = await listInputImages();
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10)));
      const start = (page - 1) * limit;
      send(res, 200, {
        images: all.slice(start, start + limit),
        total: all.length,
        page,
        limit
      });
      return true;
    }
    const inputPostRoutes = {
      "/api/input-images": handleInputUpload,
      "/api/input-images/scan-folder": handleInputScanFolder,
      "/api/input-images/from-url": handleInputFromUrl,
      "/api/input-images/delete": handleDeleteInputImage
    };
    if (req.method === "POST" && inputPostRoutes[url.pathname]) {
      await inputPostRoutes[url.pathname](req, res);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/input-image") {
      await handleInputImage(req, res, url);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/output-history") {
      send(res, 200, { history: await readOutputHistory() });
      return true;
    }
    const outputPostRoutes = {
      "/api/output-history/delete": handleDeleteOutputHistory,
      "/api/output-history/edit": handleSaveEditedOutput,
      "/api/output-history/replace-output": handleReplaceOutputImage,
      "/api/output-history/color-adjust": handleSaveColorAdjust
    };
    if (req.method === "POST" && outputPostRoutes[url.pathname]) {
      await outputPostRoutes[url.pathname](req, res);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/output-image") {
      await handleOutputImage(req, res, url);
      return true;
    }
    return false;
  };
}
