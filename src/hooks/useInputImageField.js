import { useCallback, useState } from "react";
import { getFavoriteInputImages, toggleInputImageFavorite } from "../lib/inputImageActions.js";
import { isInputImagesCacheFresh } from "../lib/inputImagesCache.js";

export function useInputImageField({ inputImages = [], refreshInputImages } = {}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryTimeFilter, setLibraryTimeFilter] = useState("all");
  const [libraryFavoritesOnly, setLibraryFavoritesOnly] = useState(false);
  const [libraryMultiSelect, setLibraryMultiSelect] = useState(false);
  const [favoriteInputImages, setFavoriteInputImages] = useState(getFavoriteInputImages);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");

  const reloadInputLibrary = useCallback(async ({ force = false } = {}) => {
    if (!force && inputImages.length > 0 && isInputImagesCacheFresh()) {
      return inputImages;
    }
    setLibraryLoading(true);
    try {
      return await refreshInputImages?.({ force });
    } finally {
      setLibraryLoading(false);
    }
  }, [inputImages, refreshInputImages]);

  const openInputLibrary = useCallback(async ({ force = true } = {}) => {
    setLibraryOpen(true);
    return reloadInputLibrary({ force });
  }, [reloadInputLibrary]);

  const closeInputLibrary = useCallback(() => {
    setLibraryOpen(false);
  }, []);

  const openLightbox = useCallback((image) => {
    if (!image?.url) return;
    setLightboxImage(image);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    setLightboxImage(null);
  }, []);

  const toggleInputFavorite = useCallback((name) => {
    toggleInputImageFavorite(name, setFavoriteInputImages);
  }, []);

  return {
    libraryOpen,
    setLibraryOpen,
    libraryLoading,
    setLibraryLoading,
    libraryTimeFilter,
    setLibraryTimeFilter,
    libraryFavoritesOnly,
    setLibraryFavoritesOnly,
    libraryMultiSelect,
    setLibraryMultiSelect,
    favoriteInputImages,
    setFavoriteInputImages,
    reloadInputLibrary,
    openInputLibrary,
    closeInputLibrary,
    toggleInputFavorite,
    lightboxOpen,
    setLightboxOpen,
    lightboxImage,
    setLightboxImage,
    openLightbox,
    closeLightbox,
    editorOpen,
    setEditorOpen,
    maskEditorOpen,
    setMaskEditorOpen,
    urlInput,
    setUrlInput,
    urlLoading,
    setUrlLoading,
    urlError,
    setUrlError
  };
}
