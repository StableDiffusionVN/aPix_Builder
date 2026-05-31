export const DYNAMIC_FIELD_REGISTRY = {
  checkpoints: {
    label: "checkpoints",
    aliases: ["checkpoint", "ckpt"],
    fields: ["ckpt_name"],
    modelFolder: "checkpoints"
  },
  loras: {
    label: "loras",
    aliases: ["lora"],
    fields: ["lora_name"],
    modelFolder: "loras"
  },
  vae: {
    label: "vae",
    aliases: ["vaes"],
    fields: ["vae_name"],
    modelFolder: "vae"
  },
  controlnets: {
    label: "controlnets",
    aliases: ["controlnet", "control_net"],
    fields: ["control_net_name", "model_name"],
    nodeClasses: ["ControlNetLoader", "DiffControlNetLoader"],
    modelFolder: "controlnet"
  },
  upscale_models: {
    label: "upscale_models",
    aliases: ["upscale_model", "upscalers"],
    fields: ["model_name"],
    nodeClasses: ["UpscaleModelLoader"],
    modelFolder: "upscale_models"
  },
  samplers: {
    label: "samplers",
    aliases: ["sampler"],
    fields: ["sampler_name"]
  },
  schedulers: {
    label: "schedulers",
    aliases: ["scheduler"],
    fields: ["scheduler"]
  },
  unet: {
    label: "unet",
    aliases: ["unets", "diffusion_models", "diffusion_model"],
    fields: ["unet_name"],
    modelFolder: "diffusion_models"
  },
  style_models: {
    label: "style_models",
    aliases: ["style_model"],
    fields: ["style_model_name"],
    modelFolder: "style_models"
  },
  embeddings: {
    label: "embeddings",
    aliases: ["embedding"],
    fields: ["embedding"]
  },
  clip: {
    label: "clip",
    aliases: ["clips", "text_encoders", "text_encoder"],
    fields: ["clip_name"],
    nodeClasses: ["CLIPLoader", "DualCLIPLoader"],
    modelFolder: "text_encoders"
  },
  clip_vision: {
    label: "clip_vision",
    aliases: ["clipvision", "clip_visions"],
    fields: ["clip_name"],
    nodeClasses: ["CLIPVisionLoader"],
    modelFolder: "clip_vision"
  }
};

const DYNAMIC_TYPE_ALIASES = Object.fromEntries(
  Object.entries(DYNAMIC_FIELD_REGISTRY).flatMap(([type, config]) => [
    [type, type],
    [config.label, type],
    ...(config.aliases || []).map(alias => [alias, type])
  ])
);

export const DYNAMIC_FIELD_TYPES = Object.keys(DYNAMIC_FIELD_REGISTRY);

export function canonicalDynamicType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return DYNAMIC_TYPE_ALIASES[normalized] || "";
}

export function isDynamicFieldType(type) {
  return Boolean(canonicalDynamicType(type));
}

export function dynamicFieldChoices(discovery, type) {
  const canonical = canonicalDynamicType(type);
  if (!canonical) return [];
  return discovery?.dynamicChoices?.[canonical] || discovery?.modelLists?.[canonical] || [];
}

export function inferDynamicTypeFromField(field, nodeClass = "") {
  const normalizedField = String(field || "").toLowerCase();
  const normalizedNode = String(nodeClass || "").toLowerCase();
  for (const [type, config] of Object.entries(DYNAMIC_FIELD_REGISTRY)) {
    const matchesField = (config.fields || []).some(item => item.toLowerCase() === normalizedField);
    if (!matchesField) continue;
    const nodeClasses = config.nodeClasses || [];
    if (!nodeClasses.length || nodeClasses.some(item => item.toLowerCase() === normalizedNode)) {
      return type;
    }
  }
  return "";
}
