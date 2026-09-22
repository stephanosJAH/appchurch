import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, View } from "react-native";
import { RichTextEditor } from "../components/RichTextEditor";
import { RichTextView } from "../components/RichTextView";
import {
  Body,
  Button,
  Card,
  Chip,
  Field,
  KeyboardScrollView,
  Label,
  Muted,
  SwitchField,
  Title,
} from "../components/ui";
import { useAuth } from "../lib/auth";
import { dateToFecha, fechaLabel, fechaToDate, formatFechaHoraCorta } from "../lib/date";
import {
  useAnuncios,
  useBorrarAnuncio,
  useMarcarAnunciosLeidos,
  useUpsertAnuncio,
} from "../lib/queries/anuncios";
import { useMisMinisterios } from "../lib/queries/ministerios";
import { colors } from "../lib/theme";
import { Anuncio } from "../lib/types";

// Anuncios: el aviso a la gente, in-app (feed + badge). El push al celular con
// la app cerrada quedó fuera de alcance a propósito — necesita salir de Expo Go
// a un development build; ver docs/MINISTERIOS.md.
//
// Un solo listado para los dos alcances: el anuncio general (de toda la
// iglesia, que publica el admin) y el de ministerio (que publica CUALQUIERA de
// sus líderes, y que solo ve su gente). Quién puede publicar qué no se decide
// acá: el backend ya lo corta con la policy `anun_write` (0026); esta pantalla
// solo evita ofrecer lo que iría a fallar.
//
// Abrir la pantalla marca todo como leído (`profiles.anuncios_leidos_hasta`).

// Quien puede publicar y borrar este anuncio: el admin en cualquiera, y
// cualquier líder en los de su ministerio — incluidos los que escribió otro
// líder. No hay un permiso especial para "el autor": eso es deliberado.
function puedeEditar(a: Anuncio, isAdmin: boolean, ministeriosQueLidero: string[]): boolean {
  if (isAdmin) return true;
  return !!a.ministerio_id && ministeriosQueLidero.includes(a.ministerio_id);
}

function AnuncioCard({
  a,
  editable,
  onEditar,
  onBorrar,
}: {
  a: Anuncio;
  editable: boolean;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const vencido = !!a.vence_el && a.vence_el < new Date().toISOString().slice(0, 10);
  return (
    <Card>
      <View className="flex-row items-start gap-2">
        <View className="flex-1">
          <View className="mb-1.5 flex-row flex-wrap items-center gap-2">
            {a.fijado ? <Ionicons name="pin" size={14} color={colors.tertiary} /> : null}
            <Chip tone={a.ministerio_id ? "neutral" : "navy"}>
              {a.ministerio_nombre ?? "Toda la iglesia"}
            </Chip>
            {vencido ? <Chip tone="danger">Vencido</Chip> : null}
          </View>
          <Title className="text-base">{a.titulo}</Title>
        </View>
        {editable && (
          <View className="flex-row gap-1">
            <Pressable onPress={onEditar} hitSlop={8} className="active:opacity-60">
              <Ionicons name="create-outline" size={19} color={colors.outline} />
            </Pressable>
            <Pressable onPress={onBorrar} hitSlop={8} className="active:opacity-60">
              <Ionicons name="trash-outline" size={19} color={colors.error} />
            </Pressable>
          </View>
        )}
      </View>

      <View className="mt-2">
        <RichTextView descripcion={a.cuerpo} />
      </View>

      <View className="mt-3 flex-row items-center gap-1.5 border-t border-black/5 pt-3">
        <Ionicons name="person-outline" size={13} color={colors.outline} />
        <Muted className="flex-1" numberOfLines={1}>
          {a.autor ?? "Sin autor"} · {formatFechaHoraCorta(a.created_at)}
        </Muted>
      </View>
    </Card>
  );
}

export default function Anuncios() {
  const { ministerioId } = useLocalSearchParams<{ ministerioId?: string }>();
  const { profile, session, isAdmin } = useAuth();
  const { data: anuncios = [], isLoading } = useAnuncios();
  const { data: mios = [] } = useMisMinisterios();
  const upsert = useUpsertAnuncio();
  const borrar = useBorrarAnuncio();
  const marcarLeidos = useMarcarAnunciosLeidos();

  const lidero = useMemo(() => mios.filter((m) => m.soy_lider), [mios]);
  const ministeriosQueLidero = useMemo(() => lidero.map((m) => m.id), [lidero]);
  const puedePublicar = isAdmin || lidero.length > 0;

  // Alcances entre los que se puede elegir al publicar: "toda la iglesia" solo
  // para el admin, más un ministerio por cada uno que se lidera.
  const alcances = useMemo(
    () => [
      ...(isAdmin ? [{ id: null as string | null, nombre: "Toda la iglesia" }] : []),
      ...lidero.map((m) => ({ id: m.id as string | null, nombre: m.nombre })),
    ],
    [isAdmin, lidero]
  );

  // Abrir la pantalla es haber leído: se corre la marca de agua una sola vez
  // por visita (el ref evita repetirlo cuando la invalidación del perfil
  // vuelve a renderizar).
  const marcado = useRef(false);
  useEffect(() => {
    const uid = session?.user?.id;
    if (marcado.current || !uid || isLoading) return;
    marcado.current = true;
    marcarLeidos.mutate(uid);
  }, [session?.user?.id, isLoading]);

  const [editando, setEditando] = useState<Anuncio | null>(null);
  const [componiendo, setComponiendo] = useState(false);
  const [alcance, setAlcance] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [fijado, setFijado] = useState(false);
  const [vence, setVence] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Llegar desde el detalle de un ministerio abre el compositor ya apuntado a
  // ese ministerio.
  const preseleccion = useRef(false);
  useEffect(() => {
    if (preseleccion.current || !ministerioId || !ministeriosQueLidero.length) return;
    if (!ministeriosQueLidero.includes(String(ministerioId))) return;
    preseleccion.current = true;
    setAlcance(String(ministerioId));
    setComponiendo(true);
  }, [ministerioId, ministeriosQueLidero]);

  const limpiar = () => {
    setEditando(null);
    setComponiendo(false);
    setTitulo("");
    setCuerpo("");
    setFijado(false);
    setVence(null);
    setAlcance(alcances[0]?.id ?? null);
  };

  const abrirEdicion = (a: Anuncio) => {
    setEditando(a);
    setComponiendo(true);
    setAlcance(a.ministerio_id);
    setTitulo(a.titulo);
    setCuerpo(a.cuerpo);
    setFijado(a.fijado);
    setVence(a.vence_el);
  };

  const guardar = async () => {
    if (!titulo.trim()) {
      Alert.alert("Falta el título", "Ponele un título al anuncio.");
      return;
    }
    if (!cuerpo.trim()) {
      Alert.alert("Falta el mensaje", "Escribí lo que querés avisar.");
      return;
    }
    try {
      await upsert.mutateAsync({
        ...(editando ? { id: editando.id } : {}),
        ministerio_id: alcance,
        titulo: titulo.trim(),
        cuerpo: cuerpo.trim(),
        fijado,
        vence_el: vence,
      });
      limpiar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo publicar el anuncio.");
    }
  };

  const confirmarBorrado = (a: Anuncio) => {
    Alert.alert("Borrar anuncio", `¿Borrar «${a.titulo}»? No se puede deshacer.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: () => borrar.mutate(a.id) },
    ]);
  };

  return (
    <KeyboardScrollView>
      <Stack.Screen options={{ title: "Anuncios" }} />

      {/* {puedePublicar && !componiendo && (
        <View className="mb-5">
          <Button
            title="Publicar un anuncio"
            icon="megaphone-outline"
            onPress={() => {
              setAlcance(alcances[0]?.id ?? null);
              setComponiendo(true);
            }}
          />
        </View>
      )} */}

      {componiendo && (
        <Card className="mb-5">
          <Label className="mb-2">{editando ? "Editar anuncio" : "Nuevo anuncio"}</Label>

          <Label className="mb-1.5">¿A quién le llega?</Label>
          <View className="mb-4 gap-2">
            {alcances.map((op) => {
              const sel = alcance === op.id;
              return (
                <Pressable
                  key={op.id ?? "general"}
                  onPress={() => setAlcance(op.id)}
                  className={`rounded-lg border px-3.5 py-3 ${
                    sel ? "border-navy bg-navy/5" : "border-black/10 bg-surface"
                  }`}
                >
                  <View className="flex-row items-center gap-2.5">
                    <Ionicons
                      name={sel ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={sel ? colors.primary : colors.outlineVariant}
                    />
                    <Body className="flex-1 text-ink">{op.nombre}</Body>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="Título"
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Ej. Cambio de horario del ensayo"
          />

          <RichTextEditor
            label="Mensaje"
            valor={cuerpo}
            onChange={setCuerpo}
            placeholder="Lo que querés avisar…"
          />

          <SwitchField
            label="Fijar arriba"
            description="Queda primero en la lista, por encima de los más recientes."
            value={fijado}
            onValueChange={setFijado}
          />

          <Label className="mb-1.5">Vence el (opcional)</Label>
          <View className="mb-4 flex-row items-center gap-2">
            <Pressable
              onPress={() => setShowPicker(true)}
              className="flex-1 flex-row items-center justify-between rounded-lg border border-black/10 bg-surface px-4 py-3.5 active:opacity-70"
            >
              <Body className="capitalize text-ink">
                {vence ? fechaLabel(vence) : "Sin vencimiento"}
              </Body>
              <Ionicons name="calendar-outline" size={18} color={colors.outline} />
            </Pressable>
            {vence ? (
              <Button title="Quitar" variant="outline" size="sm" onPress={() => setVence(null)} />
            ) : null}
          </View>
          {showPicker && (
            <DateTimePicker
              value={fechaToDate(vence ?? new Date().toISOString().slice(0, 10))}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(event, selected) => {
                if (Platform.OS !== "ios") setShowPicker(false);
                if (event.type === "set" && selected) setVence(dateToFecha(selected));
              }}
            />
          )}
          <Muted className="mb-4">
            Después de esa fecha el anuncio se cae solo del feed. Vos lo seguís
            viendo acá para poder borrarlo.
          </Muted>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button title="Cancelar" variant="outline" size="sm" onPress={limpiar} />
            </View>
            <View className="flex-1">
              <Button
                title={editando ? "Guardar" : "Publicar"}
                size="sm"
                onPress={guardar}
                loading={upsert.isPending}
              />
            </View>
          </View>
        </Card>
      )}

      <Label className="mb-2">Anuncios ({anuncios.length})</Label>

      {isLoading ? (
        <View className="items-center py-6">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : anuncios.length === 0 ? (
        <Card>
          <Muted>
            No hay anuncios por ahora. Acá van a aparecer los avisos de la iglesia y
            los de los ministerios donde participás.
          </Muted>
        </Card>
      ) : (
        <View className="gap-3">
          {anuncios.map((a) => (
            <AnuncioCard
              key={a.id}
              a={a}
              editable={puedeEditar(a, isAdmin, ministeriosQueLidero)}
              onEditar={() => abrirEdicion(a)}
              onBorrar={() => confirmarBorrado(a)}
            />
          ))}
        </View>
      )}

      {profile && !puedePublicar ? (
        <Muted className="mt-5">
          Los anuncios los publican los líderes de cada ministerio y la
          administración de la iglesia.
        </Muted>
      ) : null}
    </KeyboardScrollView>
  );
}
