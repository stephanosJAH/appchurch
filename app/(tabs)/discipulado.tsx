import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { AppBar } from "../../components/AppBar";
import { MiGrupoDetalle } from "../../components/MiGrupo";
import { Body, Card, Chip, Label, Muted, Screen, Title } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatHora } from "../../lib/date";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA, MiMinisterio } from "../../lib/types";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useMiGrupo } from "../../lib/queries/miGrupo";
import { useMisMinisterios } from "../../lib/queries/ministerios";
import { nombreDePerfil } from "../../lib/queries/profiles";

// Los dos orígenes —la tabla `discipulados` para lo que uno lidera y el RPC
// `mi_grupo` para lo que uno cursa como discípulo— se normalizan acá para
// pintar una sola tarjeta.
type GrupoItem = {
  id: string;
  titulo: string;
  dia_semana: number;
  hora_inicio: string;
  modalidad: string;
  sexo: string;
  discipulador: string | null;
};

function GrupoCard({ g, onPress }: { g: GrupoItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Title numberOfLines={1}>{g.titulo}</Title>
            <View className="mt-1.5 flex-row items-center gap-1.5">
              <Ionicons name="calendar-outline" size={14} color={colors.tertiary} />
              <Muted className="text-gold">
                {DIAS_SEMANA[g.dia_semana]} · {formatHora(g.hora_inicio)}
              </Muted>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.outline} />
        </View>
        <View className="mt-3 flex-row items-center gap-2 border-t border-black/5 pt-3">
          <Chip tone="neutral">{g.modalidad}</Chip>
          <Chip tone="navy">{g.sexo}</Chip>
        </View>
        <View className="mt-2 flex-row items-center gap-1.5">
          <Ionicons name="person-outline" size={13} color={colors.outline} />
          <Muted>{g.discipulador ?? "Sin discipulador asignado"}</Muted>
        </View>
      </Card>
    </Pressable>
  );
}

// Tarjeta de ministerio: no tiene día ni horario propios (un ministerio que se
// junta todas las semanas es una `actividad`, ver el diferido #1 de
// docs/MINISTERIOS.md), así que muestra el ícono, los líderes y el rol propio.
function MinisterioCard({ m, onPress }: { m: MiMinisterio; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card>
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-gold-container">
            <Ionicons
              name={(m.icono as keyof typeof Ionicons.glyphMap) ?? "sparkles-outline"}
              size={20}
              color={colors.onTertiaryContainer}
            />
          </View>
          <View className="flex-1">
            <Title numberOfLines={1}>{m.nombre}</Title>
            <View className="mt-0.5 flex-row items-center gap-1.5">
              <Ionicons name="person-outline" size={13} color={colors.outline} />
              <Muted numberOfLines={1}>
                {m.lideres.length ? m.lideres.join(" · ") : "Sin líderes asignados"}
              </Muted>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.outline} />
        </View>
        {m.soy_lider && (
          <View className="mt-3 flex-row items-center gap-2 border-t border-black/5 pt-3">
            <Chip tone="gold">Liderás</Chip>
            {m.integrantes != null ? (
              <Muted>
                {m.integrantes} {m.integrantes === 1 ? "integrante" : "integrantes"}
              </Muted>
            ) : null}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

// "Mi grupo" es el hub de pertenencia: los discipulados en los que uno está
// metido —sea liderándolos o cursándolos— y los ministerios donde participa o
// lidera. No se agrega un sexto tab: la barra ya tiene cinco.
//
// El padrón completo de discipulados y ministerios (incluido crear/editar) vive
// en Admin, no acá — un admin ve en esta pantalla lo suyo, igual que cualquier
// otro. Y los ministerios NO se gatean por `esObrero`: un líder de ministerio
// puede ser `miembro` (el poder viene de la asignación, no del rol), así que la
// pregunta se le hace a `mis_ministerios()`.
export default function MiGrupoTab() {
  const router = useRouter();
  const { esObrero, profile } = useAuth();

  // La RLS ya recorta `discipulados` al grupo del obrero, pero al admin le
  // devuelve todos: se filtra por discipulador_id para quedarse con los propios.
  const { data: discipulados = [], isLoading: cargandoLidero } = useDiscipulados({
    enabled: esObrero,
  });
  // Las participaciones van por RPC (la RLS de `discipulados` solo deja pasar
  // al líder y al admin) — ver supabase/migrations/0019_mi_grupo.sql.
  const { data: participaciones = [], isLoading: cargandoParticipo } = useMiGrupo();
  // Ministerios donde participo o lidero (RPC `mis_ministerios`, 0024).
  const { data: ministerios = [], isLoading: cargandoMinisterios } = useMisMinisterios();

  const lidero: GrupoItem[] = discipulados
    .filter((d) => d.discipulador_id === profile?.id)
    .map((d) => ({
      id: d.id,
      titulo: d.nombre ?? d.descripcion_etaria ?? "Discipulado",
      dia_semana: d.dia_semana,
      hora_inicio: d.hora_inicio,
      modalidad: d.modalidad,
      sexo: d.sexo,
      discipulador: nombreDePerfil(d.discipulador) ?? profile?.nombre_completo ?? null,
    }));

  // Si además figura como participante de un grupo que lidera, no se repite:
  // manda la tarjeta de gestión.
  const idsLidero = new Set(lidero.map((g) => g.id));
  const participo: GrupoItem[] = participaciones
    .filter((g) => !idsLidero.has(g.id))
    .map((g) => ({
      id: g.id,
      titulo: g.nombre ?? g.descripcion_etaria ?? "Discipulado",
      dia_semana: g.dia_semana,
      hora_inicio: g.hora_inicio,
      modalidad: g.modalidad,
      sexo: g.sexo,
      discipulador: g.discipulador,
    }));

  const cargando = cargandoLidero || cargandoParticipo || cargandoMinisterios;
  const vacio = lidero.length === 0 && participo.length === 0 && ministerios.length === 0;

  // Caso más común (el miembro de un único grupo y de ningún ministerio): se
  // entra directo al detalle, sin una lista de una sola tarjeta de por medio.
  // Con un ministerio en juego ya hay dos cosas que mostrar, así que el atajo
  // se apaga y se ve el hub.
  if (!cargando && lidero.length === 0 && participo.length === 1 && ministerios.length === 0) {
    return (
      <Screen>
        <AppBar title="Mi grupo" />
        <MiGrupoDetalle grupoId={participo[0].id} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar title="Mi grupo" />
      {cargando ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {vacio ? (
            <Card>
              <Title className="text-base">Todavía no estás en un grupo</Title>
              <Body className="mt-2">
                {esObrero
                  ? "No tenés un grupo a cargo ni participás de uno. Pedile a un admin que te asigne el discipulado que liderás, o que te sume a un ministerio."
                  : "Cuando tu discipulador te sume a su grupo —o el líder de un ministerio te sume al suyo— vas a ver acá las reuniones y los temas compartidos. Consultale a un obrero de la congregación."}
              </Body>
            </Card>
          ) : (
            <>
              {lidero.length > 0 && (
                <View className="mb-5">
                  <Label className="mb-2">
                    {lidero.length === 1 ? "Mi discipulado" : `Mis discipulados (${lidero.length})`}
                  </Label>
                  <View className="gap-3">
                    {lidero.map((g) => (
                      <GrupoCard
                        key={g.id}
                        g={g}
                        onPress={() => router.push(`/discipulado/${g.id}`)}
                      />
                    ))}
                  </View>
                </View>
              )}

              {participo.length > 0 && (
                <View className="mb-5">
                  <Label className="mb-2">Donde participo ({participo.length})</Label>
                  <View className="gap-3">
                    {participo.map((g) => (
                      <GrupoCard
                        key={g.id}
                        g={g}
                        onPress={() => router.push({ pathname: "/mi-grupo/[id]", params: { id: g.id } })}
                      />
                    ))}
                  </View>
                </View>
              )}

              {ministerios.length > 0 && (
                <View>
                  <Label className="mb-2">
                    {ministerios.length === 1
                      ? "Mi ministerio"
                      : `Mis ministerios (${ministerios.length})`}
                  </Label>
                  <View className="gap-3">
                    {ministerios.map((m) => (
                      <MinisterioCard
                        key={m.id}
                        m={m}
                        onPress={() =>
                          router.push({ pathname: "/ministerio/[id]", params: { id: m.id } })
                        }
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
