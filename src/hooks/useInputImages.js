import { useCallback, useState } from "react";
import {
  fetchInputImages,
  getCachedInputImages,
  setCachedInputImages
} from "../lib/inputImagesCache.js";

export function useInputImages() {
  const [inputImages, setInputImagesState] = useState(() => getCachedInputImages());

  const refreshInputImages = useCallback(async (options = {}) => {
    const images = await fetchInputImages(options);
    setInputImagesState(images);
    return images;
  }, []);

  const setInputImages = useCallback((images) => {
    const list = setCachedInputImages(images);
    setInputImagesState(list);
    return list;
  }, []);

  return { inputImages, setInputImages, refreshInputImages };
}
