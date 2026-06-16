import { useState } from "react";
import {
  fetchInputImages,
  getCachedInputImages,
  setCachedInputImages
} from "../lib/inputImagesCache.js";

export function useInputImages() {
  const [inputImages, setInputImagesState] = useState(() => getCachedInputImages());

  async function refreshInputImages(options = {}) {
    const images = await fetchInputImages(options);
    setInputImagesState(images);
    return images;
  }

  function setInputImages(images) {
    const list = setCachedInputImages(images);
    setInputImagesState(list);
    return list;
  }

  return { inputImages, setInputImages, refreshInputImages };
}
