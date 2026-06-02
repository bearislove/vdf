import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";
import type { GenerationStrategy } from "@/types/scene";

export function chooseStrategy(
  scene: Scene,
  objects: StoryObject[]
): GenerationStrategy {
  if (scene.strategyOverride) return scene.strategyOverride;

  const characters = objects.filter((o) => o.type === "CHARACTER");

  // Always use the configured model — don't auto-switch models based on character count.
  // I2V_COMPOSITE / IC_LORA only when user explicitly sets strategyOverride.
  if (characters.length === 0) return "T2V";
  return "I2V_SINGLE";
}
