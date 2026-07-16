import { prisma } from "@/lib/prisma";
import { newestSceneCompositeImage, storageRelative } from "@/lib/storage";

/**
 * Quy tắc duy nhất cho việc mặc định hoá ảnh Initial reference image của scene:
 * ảnh vừa tạo/upload luôn trở thành ảnh đầu vào video tiếp theo.
 * Nếu chưa có ảnh đầu vào thì tự lấy ảnh mới nhất trong thư mục.
 */
export async function ensureCompositeImageSelected(
  scene: { id: string; compositeImagePath: string | null },
  ids: { filmId: string; episodeId: string },
  candidatePath?: string
): Promise<string | null> {
  if (candidatePath) {
    await prisma.scene.update({
      where: { id: scene.id },
      data: { compositeImagePath: candidatePath },
    });
    return candidatePath;
  }

  if (scene.compositeImagePath) return scene.compositeImagePath;

  const fallbackAbsolute = newestSceneCompositeImage(ids.filmId, ids.episodeId, scene.id);
  const selectedPath = fallbackAbsolute ? storageRelative(fallbackAbsolute) : null;
  if (!selectedPath) return null;

  // updateMany + điều kiện null: atomic, không ghi đè lựa chọn có sẵn khi có request song song
  await prisma.scene.updateMany({
    where: { id: scene.id, compositeImagePath: null },
    data: { compositeImagePath: selectedPath },
  });
  return selectedPath;
}
