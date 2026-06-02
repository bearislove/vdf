import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runEnrichment } from "@/lib/ai/enrichment";

export async function POST(
  req: NextRequest,
  { params }: { params: { episodeId: string } }
) {
  const episode = await prisma.episode.findUnique({
    where: { id: params.episodeId },
  });
  if (!episode) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const storyRaw = body.storyRaw ?? episode.storyRaw;

  if (!storyRaw?.trim()) {
    return NextResponse.json({ error: "No story text" }, { status: 400 });
  }

  await prisma.episode.update({
    where: { id: params.episodeId },
    data: { status: "ENRICHING", storyRaw },
  });

  // Load existing objects of this film BEFORE calling AI
  // so the AI can reuse exact names instead of creating duplicates
  const existingFilmObjects = await prisma.storyObject.findMany({
    where: { filmId: episode.filmId },
    select: { name: true, type: true, descriptionEn: true },
  });
  const existingForAI = existingFilmObjects.map((o) => ({
    name: o.name,
    type: o.type.toLowerCase(),
    description_en: o.descriptionEn,
  }));

  try {
    const { storyEnriched, scenes, objects: rawObjects, links } =
      await runEnrichment(storyRaw, existingForAI);

    // Chỉ giữ CHARACTER và ENVIRONMENT — bỏ PROP
    const objects = rawObjects.filter(
      (o) => o.type.toLowerCase() === "character" || o.type.toLowerCase() === "environment"
    );
    const allowedIds = new Set(objects.map((o) => o.id));
    // Cập nhật links để chỉ tham chiếu objects còn lại
    const filteredLinks = links.map((l) => ({
      ...l,
      object_ids: l.object_ids.filter((id) => allowedIds.has(id)),
    })).filter((l) => l.object_ids.length > 0);

    await prisma.$transaction(async (tx) => {
      // Xóa scenes cũ của episode này
      await tx.scene.deleteMany({ where: { episodeId: params.episodeId } });

      // Tạo scenes mới — pass 1: tạo không có transitionsTo (IDs chưa biết)
      const sceneMap: Record<string, string> = {};
      const createdSceneIds: string[] = [];
      for (const s of scenes) {
        const created = await tx.scene.create({
          data: {
            episodeId: params.episodeId,
            order: s.order - 1,
            title: s.title,
            promptEn: s.prompt_en,
            cameraDirection: s.camera_direction,
            shotType: s.shot_type.toUpperCase() as
              | "WIDE"
              | "MEDIUM"
              | "CLOSE"
              | "AERIAL"
              | "POV",
            mood: s.mood,
            lightingNote: s.lighting_note,
            transitionsTo: [],
            canvasX: (s.order - 1) * 200,
            canvasY: 0,
          },
        });
        sceneMap[s.id] = created.id;
        createdSceneIds.push(created.id);
      }

      // Pass 2: gán transitionsTo với real DB IDs
      // Nếu AI có trả transitions → map qua sceneMap
      // Nếu không → auto nối tuần tự (scene[i] → scene[i+1])
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        const dbId = sceneMap[s.id];

        const aiTransitions: string[] = (s.transitions_to ?? [])
          .map((tempId: string) => sceneMap[tempId])
          .filter(Boolean);

        const transitions =
          aiTransitions.length > 0
            ? aiTransitions
            : i < createdSceneIds.length - 1
            ? [createdSceneIds[i + 1]]   // auto sequential
            : [];

        if (transitions.length > 0) {
          await tx.scene.update({
            where: { id: dbId },
            data: { transitionsTo: transitions },
          });
        }
      }

      // Load các object đã có của film để tránh trùng tên
      const existingObjects = await tx.storyObject.findMany({
        where: { filmId: episode.filmId },
        select: { id: true, name: true },
      });
      const existingByName = new Map(existingObjects.map((o) => [o.name.toLowerCase(), o.id]));

      // Tạo object mới nếu chưa tồn tại (theo tên), hoặc dùng lại id cũ
      const objectMap: Record<string, string> = {};
      for (const o of objects) {
        const key = o.name.toLowerCase();
        let dbId = existingByName.get(key);
        if (!dbId) {
          const created = await tx.storyObject.create({
            data: {
              filmId: episode.filmId,
              type: o.type.toUpperCase() as "CHARACTER" | "PROP" | "ENVIRONMENT",
              name: o.name,
              descriptionEn: o.description_en,
            },
          });
          dbId = created.id;
          existingByName.set(key, dbId);
        }
        objectMap[o.id] = dbId;
      }

      // Tạo scene-object links (chỉ cho CHARACTER và ENVIRONMENT)
      for (const link of filteredLinks) {
        const sceneDbId = sceneMap[link.scene_id];
        if (!sceneDbId) continue;
        for (const objTempId of link.object_ids) {
          const objectDbId = objectMap[objTempId];
          if (!objectDbId) continue;
          const role = link.roles?.[objTempId] ?? "present";
          await tx.sceneObjectLink.upsert({
            where: { sceneId_objectId: { sceneId: sceneDbId, objectId: objectDbId } },
            create: { sceneId: sceneDbId, objectId: objectDbId, role },
            update: { role },
          });
        }
      }

      await tx.episode.update({
        where: { id: params.episodeId },
        data: { storyEnriched, status: "READY" },
      });
    });

    return NextResponse.json({ ok: true, sceneCount: scenes.length, objectCount: objects.length });
  } catch (e) {
    await prisma.episode.update({
      where: { id: params.episodeId },
      data: { status: "DRAFT" },
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
