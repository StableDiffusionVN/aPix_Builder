import { fetchRhLibraryList, fetchRhLibraryTags } from "../lib/rhLibrary.js";

export function createRhLibraryRoutes(context) {
  const { send } = context;

  return async function rhLibraryRoutes(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/rh-library/tags") {
      try {
        const tags = await fetchRhLibraryTags(url.searchParams.get("kind"));
        send(res, 200, { tags });
      } catch (error) {
        send(res, 502, { error: error.message || String(error) });
      }
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/rh-library/list") {
      try {
        const result = await fetchRhLibraryList({
          kind: url.searchParams.get("kind"),
          search: url.searchParams.get("search") || "",
          sort: url.searchParams.get("sort") || "RECOMMEND",
          days: url.searchParams.get("days"),
          current: url.searchParams.get("page"),
          size: url.searchParams.get("size"),
          tags: (url.searchParams.get("tags") || "")
            .split(",")
            .map(item => item.trim())
            .filter(Boolean)
        });
        send(res, 200, result);
      } catch (error) {
        send(res, 502, { error: error.message || String(error) });
      }
      return true;
    }
    return false;
  };
}
