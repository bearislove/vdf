import type { Prisma } from "@prisma/client";
import type { EnrichmentResult } from "./enrichment";

export async function importEnrichment(
  tx: Prisma.TransactionClient,
  episodeId: string,
  filmId: string,
  analysis: EnrichmentResult
) {
  const objects = analysis.objects.filter(
    (object) => object.type === "character" || object.type === "environment"
  );
  const allowedObjectIds = new Set(objects.map((object) => object.id));
  const links = analysis.links
    .map((link) => ({
      ...link,
      object_ids: link.object_ids.filter((id) => allowedObjectIds.has(id)),
    }))
    .filter((link) => link.object_ids.length > 0);

  await tx.scene.deleteMany({ where: { episodeId } });

  const sceneMap = new Map<string, string>();
  const createdSceneIds: string[] = [];
  for (let index = 0; index < analysis.scenes.length; index += 1) {
    const scene = analysis.scenes[index];
    const created = await tx.scene.create({
      data: {
        episodeId,
        order: index,
        title: scene.title,
        promptEn: scene.prompt_en,
        cameraDirection: scene.camera_direction,
        shotType: scene.shot_type.toUpperCase() as
          | "WIDE"
          | "MEDIUM"
          | "CLOSE"
          | "AERIAL"
          | "POV",
        mood: scene.mood,
        lightingNote: scene.lighting_note,
        transitionsTo: [],
        canvasX: index * 200,
        canvasY: 0,
      },
    });
    sceneMap.set(scene.id, created.id);
    createdSceneIds.push(created.id);
  }

  for (let index = 0; index < analysis.scenes.length; index += 1) {
    const scene = analysis.scenes[index];
    const sceneId = sceneMap.get(scene.id);
    if (!sceneId) continue;

    const aiTransitions = scene.transitions_to
      .map((temporaryId) => sceneMap.get(temporaryId))
      .filter((id): id is string => Boolean(id));
    const transitions = aiTransitions.length > 0
      ? aiTransitions
      : createdSceneIds[index + 1]
        ? [createdSceneIds[index + 1]]
        : [];

    if (transitions.length > 0) {
      await tx.scene.update({
        where: { id: sceneId },
        data: { transitionsTo: transitions },
      });
    }
  }

  const existingObjects = await tx.storyObject.findMany({
    where: { filmId },
    select: { id: true, name: true, descriptionEn: true },
  });
  const existingByName = new Map(
    existingObjects.map((object) => [object.name.toLocaleLowerCase(), object])
  );
  const objectMap = new Map<string, string>();

  for (const object of objects) {
    const nameKey = object.name.toLocaleLowerCase();
    const existing = existingByName.get(nameKey);
    let objectId = existing?.id;
    if (existing) {
      if (existing.descriptionEn !== object.description_en) {
        await tx.storyObject.update({
          where: { id: existing.id },
          data: { descriptionEn: object.description_en },
        });
      }
    } else {
      const created = await tx.storyObject.create({
        data: {
          filmId,
          type: object.type.toUpperCase() as "CHARACTER" | "ENVIRONMENT",
          name: object.name,
          descriptionEn: object.description_en,
        },
      });
      objectId = created.id;
      existingByName.set(nameKey, created);
    }
    objectMap.set(object.id, objectId as string);
  }

  for (const link of links) {
    const sceneId = sceneMap.get(link.scene_id);
    if (!sceneId) continue;
    for (const temporaryObjectId of link.object_ids) {
      const objectId = objectMap.get(temporaryObjectId);
      if (!objectId) continue;
      await tx.sceneObjectLink.upsert({
        where: { sceneId_objectId: { sceneId, objectId } },
        create: {
          sceneId,
          objectId,
          role: link.roles?.[temporaryObjectId] ?? "present",
        },
        update: { role: link.roles?.[temporaryObjectId] ?? "present" },
      });
    }
  }

  await tx.episode.update({
    where: { id: episodeId },
    data: {
      storyEnriched: analysis.storyEnriched,
      status: "READY",
      sceneCountHint: analysis.scenes.length,
    },
  });

  return { sceneCount: analysis.scenes.length, objectCount: objects.length };
}
