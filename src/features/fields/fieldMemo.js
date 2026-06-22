import { isMenuSub } from "../../lib/template.js";

export function fieldPropsAreEqual(prev, next) {
  return prev.fieldKey === next.fieldKey
    && prev.value === next.value
    && prev.label === next.label
    && prev.description === next.description
    && prev.discoveryLoading === next.discoveryLoading
    && prev.choicesSignature === next.choicesSignature;
}

export function areDynamicFieldPropsEqual(prev, next) {
  if (prev.item?.key !== next.item?.key) return false;
  if (prev.value !== next.value) return false;
  if (prev.discovery !== next.discovery) return false;
  if (prev.discoveryLoading !== next.discoveryLoading) return false;
  if (prev.inputImages !== next.inputImages) return false;
  if (isMenuSub(prev.item) && prev.allValues !== next.allValues) return false;
  return true;
}
