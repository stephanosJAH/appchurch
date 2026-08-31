import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image, Pressable, View } from "react-native";
import { colors } from "../lib/theme";
import {
  abrirCanal,
  abrirVideo,
  hayCanal,
  publicadoLabel,
  subtituloVideo,
  vistasLabel,
  VideoYoutube,
} from "../lib/youtube";
import { useVideosCanal } from "../lib/queries/contenido";
import { Body, Button, Card, Chip, Label, LinkAction, Muted, Skeleton, Title } from "./ui";

// Menos de una semana: se marca como nuevo en la portada.
function esReciente(iso: string): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t < 7 * 86_400_000;
}

/* ============================ Tarjeta ============================ */

// Portada 16:9 + título + predicador + metadatos. Al tocarla, el video abre en
// YouTube (ver `abrirVideo`). La usan tanto el feed como la pantalla de Contenido.
export function VideoCard({ video }: { video: VideoYoutube }) {
  const vistas = vistasLabel(video.vistas);
  const publicado = publicadoLabel(video.publicado);
  const subtitulo = subtituloVideo(video.descripcion);

  return (
    <Pressable onPress={() => abrirVideo(video.id)} className="active:opacity-90">
      <Card className="overflow-hidden p-0">
        {/* aspectRatio 16/9 + cover: recorta justo las bandas negras que trae
            `hqdefault` (ver comentario en lib/youtube.ts). El fondo navy tapa
            el hueco mientras la miniatura viaja por la red. */}
        <View style={{ aspectRatio: 16 / 9 }} className="bg-navy">
          <Image
            source={{ uri: video.miniatura }}
            resizeMode="cover"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View className="absolute inset-0 items-center justify-center">
            <View
              className="items-center justify-center rounded-full"
              style={{ width: 48, height: 48, backgroundColor: "rgba(4,22,46,0.72)" }}
            >
              {/* Empujado 2px a la derecha: el triángulo del ícono pesa a la
                  izquierda y sin el ajuste se ve descentrado en el círculo. */}
              <Ionicons name="play" size={22} color="#ffffff" style={{ marginLeft: 2 }} />
            </View>
          </View>
          {esReciente(video.publicado) && (
            <View className="absolute left-3 top-3">
              <Chip tone="gold">Nuevo</Chip>
            </View>
          )}
        </View>

        <View className="p-4">
          <Title numberOfLines={2} className="text-base leading-snug">
            {video.titulo}
          </Title>
          {subtitulo && (
            <Body numberOfLines={1} className="mt-1 text-[13px]">
              {subtitulo}
            </Body>
          )}
          <View className="mt-1.5 flex-row items-center gap-1.5">
            <Ionicons name="logo-youtube" size={13} color={colors.outline} />
            <Muted className="text-xs">{[publicado, vistas].filter(Boolean).join(" · ")}</Muted>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export function VideoCardFantasma() {
  return (
    <Card className="overflow-hidden p-0">
      <View style={{ aspectRatio: 16 / 9 }}>
        <Skeleton width="100%" height="100%" radius={0} />
      </View>
      <View className="p-4">
        <Skeleton width="90%" height={15} />
        <Skeleton width="60%" height={12} style={{ marginTop: 9 }} />
        <Skeleton width="45%" height={11} style={{ marginTop: 9 }} />
      </View>
    </Card>
  );
}

// Reemplazo de la tarjeta cuando el feed de YouTube no dio nada — falle la red,
// venga vacío o no haya canal configurado. Mantiene la misma silueta (portada
// 16:9 + texto) para que la sección ocupe siempre el mismo lugar en el feed.
//
// No distingue el motivo a propósito: para quien mira el feed, "no cargó" y "no
// hay nada" se resuelven igual — yendo al canal. Un mensaje de error sin salida
// deja la tarjeta muerta en pantalla.
function TarjetaSinVideo() {
  return (
    <Card className="overflow-hidden p-0">
      <View style={{ aspectRatio: 16 / 9 }} className="items-center justify-center bg-navy">
        <View className="absolute right-4 top-4 opacity-20">
          <Ionicons name="videocam" size={64} color={colors.tertiaryDim} />
        </View>
        <Ionicons name="logo-youtube" size={36} color={colors.inversePrimary} />
      </View>
      <View className="p-4">
        <Title className="text-base leading-snug">Predicaciones en YouTube</Title>
        <Body className="mt-1 text-[13px]">
          Mirá los mensajes en el canal de la iglesia.
        </Body>
        {hayCanal && (
          <View className="mt-3.5">
            <Button title="Ir al canal" icon="logo-youtube" size="sm" onPress={abrirCanal} />
          </View>
        )}
      </View>
    </Card>
  );
}

/* ============================ Sección del feed ============================ */

// La predicación más reciente en el panel "Inicio", con acceso al resto en
// /contenido. Una sola tarjeta a propósito: el feed es un vistazo, no un archivo.
//
// La sección se muestra SIEMPRE, tenga o no datos: es un punto fijo del feed, y
// una tarjeta que aparece y desaparece según cómo venga un servicio de terceros
// mueve todo lo que tiene debajo. Cuando el feed falla o viene vacío se dibuja
// `TarjetaSinVideo` con la misma silueta y una salida hacia el canal.
export function UltimaPredicacion({ className }: { className?: string }) {
  const router = useRouter();
  const { data: videos = [], isLoading } = useVideosCanal();

  const encabezado = (
    <View className="mb-2 flex-row items-end justify-between">
      <Label>Última predicación</Label>
      {videos.length > 0 && (
        <LinkAction title="Ver todas" onPress={() => router.push("/contenido")} />
      )}
    </View>
  );

  // Cualquier camino que no termine en un video muestra la misma tarjeta con el
  // botón al canal (ver TarjetaSinVideo).
  const tarjeta = isLoading ? (
    <VideoCardFantasma />
  ) : videos.length > 0 ? (
    <VideoCard video={videos[0]} />
  ) : (
    <TarjetaSinVideo />
  );

  return (
    <View className={className}>
      {encabezado}
      {tarjeta}
    </View>
  );
}
