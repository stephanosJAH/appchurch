import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useAuth } from "../lib/auth";
import { aTextoPlano } from "../lib/richText";
import { contarNoLeidos, useAnuncios } from "../lib/queries/anuncios";
import { colors } from "../lib/theme";
import { Anuncio } from "../lib/types";
import { Body, Card, Chip, Label, Muted, SkeletonRows, Title } from "./ui";

// Sección de anuncios del feed de Inicio: los últimos avisos de la iglesia y de
// los ministerios donde uno participa. Es un resumen — el cuerpo con formato,
// la edición y el historial completo viven en app/anuncios.tsx.
//
// Los anuncios vencidos no llegan hasta acá: el RPC `anuncios_visibles` ya los
// filtra (ver 0026).

const MAX_EN_FEED = 3;

function AnuncioRow({ a, sinLeer, onPress }: { a: Anuncio; sinLeer: boolean; onPress: () => void }) {
  const resumen = aTextoPlano(a.cuerpo);
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card>
        <View className="flex-row items-center gap-2">
          {a.fijado ? <Ionicons name="pin" size={13} color={colors.tertiary} /> : null}
          <Title className="flex-1 text-base" numberOfLines={1}>
            {a.titulo}
          </Title>
          {sinLeer ? <View className="h-2 w-2 rounded-full bg-gold" /> : null}
        </View>
        {resumen ? (
          <Body className="mt-1" numberOfLines={2}>
            {resumen}
          </Body>
        ) : null}
        <View className="mt-3 flex-row items-center gap-2 border-t border-black/5 pt-3">
          <Chip tone={a.ministerio_id ? "neutral" : "navy"}>
            {a.ministerio_nombre ?? "Toda la iglesia"}
          </Chip>
          <Muted className="flex-1" numberOfLines={1}>
            {a.autor ?? ""}
          </Muted>
        </View>
      </Card>
    </Pressable>
  );
}

export function AnunciosFeed({ className }: { className?: string }) {
  const router = useRouter();
  const { profile } = useAuth();
  const { data: anuncios = [], isLoading } = useAnuncios();

  const leidosHasta = profile?.anuncios_leidos_hasta ?? null;
  const sinLeer = contarNoLeidos(anuncios, leidosHasta);
  const corte = leidosHasta ? new Date(leidosHasta).getTime() : 0;

  // Sin anuncios no se dibuja nada: el feed no muestra secciones vacías.
  if (!isLoading && anuncios.length === 0) return null;

  return (
    <View className={className}>
      <View className="mb-2 flex-row items-center justify-between">
        <Label>Anuncios</Label>
        <Pressable
          onPress={() => router.push("/anuncios")}
          hitSlop={8}
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Muted className="text-navy">
            {sinLeer > 0 ? `${sinLeer} sin leer` : "Ver todos"}
          </Muted>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </Pressable>
      </View>

      {isLoading ? (
        <SkeletonRows count={2} accesorio={40} />
      ) : (
        <View className="gap-3">
          {anuncios.slice(0, MAX_EN_FEED).map((a) => (
            <AnuncioRow
              key={a.id}
              a={a}
              sinLeer={new Date(a.created_at).getTime() > corte}
              onPress={() => router.push("/anuncios")}
            />
          ))}
        </View>
      )}
    </View>
  );
}
