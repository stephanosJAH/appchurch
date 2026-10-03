import { Ionicons } from "@expo/vector-icons";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoCard, VideoCardFantasma } from "../components/Predicaciones";
import { Body, Button, Headline, Muted, Screen } from "../components/ui";
import { useVideosCanal } from "../lib/queries/contenido";
import { colors } from "../lib/theme";
import { abrirCanal, hayCanal } from "../lib/youtube";

// Aire entre tarjetas. Un solo número para la lista real y para los fantasmas de
// carga: si divergen, al llegar los datos el contenido salta.
const SEPARACION = 20;

// Estado sin resultados: sirve para el canal sin configurar, el feed vacío y el
// error de red. Cambia el texto y la acción; la silueta es la misma.
function Vacio({
  icono,
  titulo,
  detalle,
  accion,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  detalle: string;
  accion?: { title: string; onPress: () => void };
}) {
  return (
    <View className="items-center gap-3 px-6 py-16">
      <Ionicons name={icono} size={40} color={colors.outline} />
      <Headline className="text-center text-lg">{titulo}</Headline>
      <Body className="text-center">{detalle}</Body>
      {accion && (
        <View className="mt-2 w-full max-w-xs">
          <Button title={accion.title} variant="outline" onPress={accion.onPress} />
        </View>
      )}
    </View>
  );
}

export default function Contenido() {
  const insets = useSafeAreaInsets();
  const { data: videos = [], isLoading, isError, refrescar, isRefetching } = useVideosCanal();

  const encabezado = (
    <View className="mb-5">
      <Muted>
        Las predicaciones y transmisiones del canal de la iglesia. Al tocar una se abre en
        YouTube.
      </Muted>
    </View>
  );

  const pie = hayCanal ? (
    <View className="mt-6 items-center gap-2">
      {/* El RSS de YouTube devuelve solo los últimos 15: el resto del archivo
          histórico está en el canal, no en la app. */}
      <Muted className="text-center text-xs">Mostramos los videos más recientes.</Muted>
      <Button
        title="Ver el canal completo"
        variant="ghost"
        icon="logo-youtube"
        onPress={abrirCanal}
      />
    </View>
  ) : null;

  return (
    <Screen>
      <FlatList
        data={isLoading ? [] : videos}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => <VideoCard video={item} />}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 32,
          flexGrow: 1,
        }}
        ItemSeparatorComponent={() => <View style={{ height: SEPARACION }} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={encabezado}
        ListFooterComponent={videos.length > 0 && !isLoading ? pie : null}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={refrescar}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: SEPARACION }}>
              {[0, 1, 2].map((i) => (
                <VideoCardFantasma key={i} />
              ))}
            </View>
          ) : !hayCanal ? (
            <Vacio
              icono="videocam-off-outline"
              titulo="Canal no configurado"
              detalle="Todavía no está cargado el canal de YouTube de la iglesia."
            />
          ) : isError ? (
            <Vacio
              icono="cloud-offline-outline"
              titulo="No pudimos cargar los videos"
              detalle="Podés verlos igual en el canal de la iglesia, o deslizar hacia abajo para reintentar."
              accion={{ title: "Ir al canal", onPress: abrirCanal }}
            />
          ) : (
            <Vacio
              icono="film-outline"
              titulo="Todavía no hay videos"
              detalle="Cuando se publiquen predicaciones en el canal, van a aparecer acá."
              accion={{ title: "Ver el canal", onPress: abrirCanal }}
            />
          )
        }
      />
    </Screen>
  );
}
