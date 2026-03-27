import { data } from "react-router";
import prisma from "../db.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload = await request.json();
  const eventType = payload?.type;
  const streamId = payload?.data?.uid;

  if (!eventType || !streamId) {
    return new Response("Invalid payload", { status: 400 });
  }

  // encontra o vídeo pelo streamId
  const video = await prisma.video.findFirst({
    where: { streamId },
  });

  if (!video) {
    // Cloudflare pode mandar eventos duplicados ou fora de ordem
    return data({ ok: true });
  }

  // processamento concluído
  if (eventType === "video.processing.complete") {
    const duration = Math.floor(payload.data.duration || 0);
    const thumbnailUrl = payload.data.thumbnail;

    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: "READY",
        duration,
        thumbnailUrl,
      },
    });

    // cria analytics se não existir
    await prisma.videoAnalytics.upsert({
      where: { videoId: video.id },
      update: {},
      create: {
        videoId: video.id,
      },
    });
  }

  // processamento falhou
  if (eventType === "video.processing.failed") {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "FAILED" },
    });
  }

  return data({ ok: true });
};
