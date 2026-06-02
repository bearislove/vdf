import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";
import type { GenerationStrategy } from "@/types/scene";

export function chooseStrategy(
  scene: Scene,
  objects: StoryObject[]
): GenerationStrategy {
  if (scene.strategyOverride) return scene.strategyOverride;

  const characters = objects.filter((o) => o.type === "CHARACTER");

  if (characters.length === 0) return "T2V";

  if (characters.length === 1) {
    return characters[0].loraPath ? "IC_LORA" : "I2V_SINGLE";
  }

  return "I2V_COMPOSITE";
}
