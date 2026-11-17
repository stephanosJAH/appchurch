import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FechaBloque } from "./FechaBloque";
import { RichTextEditor } from "./RichTextEditor";
import { RichTextView } from "./RichTextView";
import { BuscadorPersonas, ListaPersonas, PersonaOpcion } from "./SelectorPersonas";
import {
  Body,
  Button,
  Card,
  Chip,
  Field,
  KeyboardScrollView,
  Label,
  Muted,
  Screen,
  SkeletonRows,
  Title,
} from "./ui";
import { dateToFecha, fechaLabel, fechaToDate, formatFechaHoraCorta, todayISO } from "../lib/date";
import { useParticipantesPosibles } from "../lib/queries/reunionesObreros";
import { aTextoPlano, estaVacio } from "../lib/richText";
import { colors, fonts } from "../lib/theme";
import { AsistenciaActa, AsistenciaActaInput, Miembro, ReunionActaListado } from "../lib/types";

// Historial + formulario de las reuniones "con acta": participantes del padrón
// y un resumen de lo tratado, sin ofrenda. Hoy son dos — la reunión de obreros
// (0031) y la reunión general (0041) — con tablas y RPCs propios pero los
// MISMOS campos, así que la pantalla es una sola y cada ruta le pasa sus hooks
// y sus textos (app/admin/reuniones-obreros.tsx, app/admin/reuniones-generales.tsx).
//
// No reusa app/reunion/nueva.tsx: esa es la de los dos libros con ofrenda y
// modalidad por persona; ver docs/REUNION-OBREROS.md. Las pestañas Datos /
// Participantes sí copian su patrón (pager horizontal + raya dorada).
//
// Los hooks llegan por props pero son fijos por ruta: cada pantalla siempre
// pasa los mismos, así que el orden de hooks no cambia entre renders.

export type RegistrarActaInput = {
  reunion_id?: string | null;
  fecha: string; // "YYYY-MM-DD"
  tema: string | null;
  resumen: string | null;
  asistencias: AsistenciaActaInput[];
};

export type TextosActa = {
  nombre: string; // "Reunión de obreros" — título de la pantalla y de las tarjetas sin tema
  nombreCorto: string; // "reunión de obreros" — para "Nueva …" / "Editar …"
  intro: string;
  vacio: string;
  etiquetaResumen: string;
  placeholderResumen: string;
  ayudaResumen: string;
};

type Props = {
  textos: TextosActa;
  useListado: () => UseQueryResult<ReunionActaListado[]>;
  useAsistencias: (reunionId: string | undefined) => UseQueryResult<AsistenciaActa[]>;
  useRegistrar: () => UseMutationResult<string, Error, RegistrarActaInput>;
};

function nombreDe(m: Miembro): string {
  return [m.nombre, m.apellido].filter(Boolean).join(" ");
}

export function ReunionesConActa({ textos, useListado, useAsistencias, useRegistrar }: Props) {
  const { data: reuniones, isLoading } = useListado();
  // null = historial; "nueva" = alta; ReunionActaListado = edición.
  const [form, setForm] = useState<"nueva" | ReunionActaListado | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  if (form) {
    return (
      <FormularioActa
        // La key reinicia estado y pestaña al pasar de una reunión a otra.
        key={form === "nueva" ? "nueva" : form.id}
        textos={textos}
        reunion={form === "nueva" ? null : form}
        reuniones={reuniones ?? []}
        useAsistencias={useAsistencias}
        useRegistrar={useRegistrar}
        onCerrar={() => setForm(null)}
      />
    );
  }

  return (
    <KeyboardScrollView className="px-4 pt-4">
      <Stack.Screen options={{ title: textos.nombre }} />
      <Body className="mb-3">{textos.intro}</Body>

      {/* El layout va en un View que envuelve: `Button` no mergea className. */}
      <View className="mb-5">
        <Button title="Registrar reunión" icon="add" onPress={() => setForm("nueva")} />
      </View>

      {isLoading ? (
        <SkeletonRows count={3} />
      ) : !reuniones?.length ? (
        <Card>
          <Muted>{textos.vacio}</Muted>
        </Card>
      ) : (
        reuniones.map((r) => {
          const estaAbierta = abierta === r.id;
          const vistaPrevia = aTextoPlano(r.resumen);
          return (
            <Card key={r.id} className="mb-3">
              <Pressable
                onPress={() => setAbierta(estaAbierta ? null : r.id)}
                className="flex-row items-start gap-3 active:opacity-60"
              >
                <FechaBloque fecha={r.fecha} />
                <View className="flex-1">
                  <Title numberOfLines={1}>{r.tema || textos.nombre}</Title>
                  <View className="mt-1 flex-row items-center gap-2">
                    <Chip tone="navy">
                      {r.presentes} de {r.total_registrados} presentes
                    </Chip>
                  </View>
                  {!estaAbierta && vistaPrevia !== "" && (
                    <Muted className="mt-1.5" numberOfLines={2}>
                      {vistaPrevia}
                    </Muted>
                  )}
                </View>
                <Ionicons
                  name={estaAbierta ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={colors.onSurfaceVariant}
                />
              </Pressable>

              {estaAbierta && (
                <View className="mt-3 border-t border-outline-variant pt-3">
                  {vistaPrevia === "" ? (
                    <Muted>Esta reunión no tiene resumen cargado.</Muted>
                  ) : (
                    <RichTextView descripcion={r.resumen} />
                  )}

                  <Muted className="mt-3">
                    {r.registrado_por_nombre
                      ? `Registró ${r.registrado_por_nombre}.`
                      : "Sin registro de quién la cargó."}
                    {r.editado_por_nombre && r.editado_en
                      ? ` Última edición de ${r.editado_por_nombre}, ${formatFechaHoraCorta(
                          r.editado_en
                        )}.`
                      : ""}
                  </Muted>

                  <View className="mt-3 self-start">
                    <Button title="Editar" variant="outline" size="sm" onPress={() => setForm(r)} />
                  </View>
                </View>
              )}
            </Card>
          );
        })
      )}
      <View className="h-10" />
    </KeyboardScrollView>
  );
}

/* ============================ Formulario ============================ */

type FormProps = {
  textos: TextosActa;
  reunion: ReunionActaListado | null;
  reuniones: ReunionActaListado[];
  useAsistencias: Props["useAsistencias"];
  useRegistrar: Props["useRegistrar"];
  onCerrar: () => void;
};

function FormularioActa({ textos, reunion, reuniones, useAsistencias, useRegistrar, onCerrar }: FormProps) {
  const editId = reunion?.id ?? null;
  const { data: padron = [] } = useParticipantesPosibles();
  const registrar = useRegistrar();

  const [fecha, setFecha] = useState(reunion?.fecha ?? todayISO());
  const [showPicker, setShowPicker] = useState(false);
  const [tema, setTema] = useState(reunion?.tema ?? "");
  const [resumen, setResumen] = useState(reunion?.resumen ?? "");
  const [busqueda, setBusqueda] = useState("");
  // miembro_id -> presente. Estar en el mapa = participar de la reunión.
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});

  // Al editar, el checklist se precarga con lo que ya está guardado. Una sola
  // vez: un refetch en segundo plano no debe pisar lo que se está marcando.
  const { data: asistenciasGuardadas } = useAsistencias(editId ?? undefined);
  const precargado = useRef(false);
  useEffect(() => {
    if (!editId || !asistenciasGuardadas || precargado.current) return;
    precargado.current = true;
    setSeleccion(Object.fromEntries(asistenciasGuardadas.map((a) => [a.miembro_id, a.presente])));
  }, [editId, asistenciasGuardadas]);

  // Dos pestañas que se deslizan de costado, como en reunion/nueva.tsx: los
  // datos y el acta por un lado, los participantes (lista larga) por otro.
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollViewInstance>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [pestana, setPestana] = useState(0);
  const irA = (i: number) => {
    setPestana(i);
    pager.current?.scrollTo({ x: i * width, animated: true });
  };

  // Sólo una reunión por fecha (unique en la base). Avisamos antes de guardar
  // para que el upsert no sorprenda.
  const fechaPisa = useMemo(
    () => reuniones.some((r) => r.fecha === fecha && r.id !== editId),
    [reuniones, fecha, editId]
  );

  const elegidos = useMemo<PersonaOpcion[]>(
    () => padron.filter((m) => m.id in seleccion).map((m) => ({ id: m.id, nombre: nombreDe(m) })),
    [padron, seleccion]
  );

  const candidatos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return [];
    return padron
      .filter((m) => !(m.id in seleccion) && nombreDe(m).toLowerCase().includes(texto))
      .slice(0, 8)
      .map((m): PersonaOpcion => ({ id: m.id, nombre: nombreDe(m) }));
  }, [padron, busqueda, seleccion]);

  const presentes = elegidos.filter((m) => seleccion[m.id]).length;

  const agregar = (id: string) => {
    setSeleccion((s) => ({ ...s, [id]: true }));
    setBusqueda("");
  };
  const alternar = (id: string) => setSeleccion((s) => ({ ...s, [id]: !s[id] }));
  const quitar = (id: string) =>
    setSeleccion((s) => {
      const { [id]: _fuera, ...resto } = s;
      return resto;
    });

  const guardar = () => {
    const asistencias: AsistenciaActaInput[] = Object.entries(seleccion).map(
      ([miembro_id, presente]) => ({ miembro_id, presente })
    );
    registrar.mutate(
      {
        reunion_id: editId,
        fecha,
        tema: tema.trim() || null,
        resumen: estaVacio(resumen) ? null : resumen,
        asistencias,
      },
      {
        onSuccess: onCerrar,
        onError: (e: unknown) => Alert.alert("No se pudo guardar", (e as Error).message),
      }
    );
  };

  const pestanas = [
    { titulo: "Datos", extra: null as string | null },
    { titulo: "Participantes", extra: elegidos.length ? `${presentes}/${elegidos.length}` : null },
  ];

  return (
    <Screen>
      <Stack.Screen
        options={{ title: editId ? `Editar ${textos.nombreCorto}` : `Nueva ${textos.nombreCorto}` }}
      />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "android" ? "padding" : undefined}>
        {/* Pestañas: tocar salta, deslizar también; la raya dorada sigue al dedo */}
        <View className="border-b border-black/10">
          <View className="flex-row">
            {pestanas.map((t, i) => {
              const activa = pestana === i;
              return (
                <Pressable
                  key={t.titulo}
                  onPress={() => irA(i)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activa }}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:opacity-70"
                >
                  <Text
                    style={{ fontFamily: fonts.sansSemibold }}
                    className={`text-[15px] ${activa ? "text-navy" : "text-ink-muted"}`}
                  >
                    {t.titulo}
                  </Text>
                  {t.extra ? (
                    <Text style={{ fontFamily: fonts.sansSemibold }} className="text-xs text-gold">
                      {t.extra}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {/* Animated.* va con style: NativeWind no le traduce className */}
          <Animated.View
            style={{
              height: 2,
              backgroundColor: colors.tertiary,
              width: width / pestanas.length,
              transform: [{ translateX: Animated.divide(scrollX, pestanas.length) }],
            }}
          />
        </View>

        <Animated.ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
          })}
          onMomentumScrollEnd={(e) => setPestana(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {/* ------------------------------ Datos ------------------------------ */}
          <ScrollView
            style={{ width }}
            contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            <Label className="mb-1.5">Fecha</Label>
            <View className="mb-2 flex-row items-center gap-2">
              <Pressable
                onPress={() => setShowPicker(true)}
                className="flex-1 flex-row items-center gap-2 rounded-lg border border-outline px-3 py-3 active:opacity-60"
              >
                <Ionicons name="calendar-outline" size={18} color={colors.onSurfaceVariant} />
                <Body>{fechaLabel(fecha)}</Body>
              </Pressable>
              <Button title="Hoy" variant="outline" size="sm" onPress={() => setFecha(todayISO())} />
            </View>
            {showPicker && (
              <DateTimePicker
                value={fechaToDate(fecha)}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                onChange={(event, selected) => {
                  // Android cierra el diálogo con cada acción; iOS queda inline.
                  if (Platform.OS !== "ios") setShowPicker(false);
                  if (event.type === "set" && selected) setFecha(dateToFecha(selected));
                }}
              />
            )}

            {fechaPisa && (
              <View className="mb-4 flex-row items-start gap-2 rounded-lg bg-gold-container p-3">
                <Ionicons name="alert-circle-outline" size={16} color={colors.onTertiaryContainer} />
                <Muted className="flex-1" style={{ color: colors.onTertiaryContainer }}>
                  Esa fecha ya tiene una reunión registrada. Si guardás, se actualiza
                  con lo que cargues acá en vez de crear otra.
                </Muted>
              </View>
            )}

            <Field label="Tema" placeholder="Título corto del encuentro" value={tema} onChangeText={setTema} />

            <RichTextEditor
              label={textos.etiquetaResumen}
              valor={resumen}
              onChange={setResumen}
              placeholder={textos.placeholderResumen}
              ayuda={textos.ayudaResumen}
            />
          </ScrollView>

          {/* -------------------------- Participantes -------------------------- */}
          <ScrollView
            style={{ width }}
            contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            <View className="mb-1.5 flex-row items-center justify-between">
              <Label>Participantes</Label>
              {elegidos.length > 0 && (
                <Muted>
                  {presentes} de {elegidos.length} presentes
                </Muted>
              )}
            </View>

            <BuscadorPersonas
              busqueda={busqueda}
              onBusqueda={setBusqueda}
              candidatos={candidatos}
              onAgregar={(p) => agregar(p.id)}
            />

            <ListaPersonas
              personas={elegidos}
              vacio="Todavía no agregaste participantes. Buscalos arriba por nombre."
              marcado={(id) => !!seleccion[id]}
              onAlternar={alternar}
              onQuitar={(p) => quitar(p.id)}
            />

            <Muted>
              Destildar deja a la persona registrada como ausente; la cruz la saca de
              la reunión.
            </Muted>
          </ScrollView>
        </Animated.ScrollView>

        {/* Guardar queda fijo abajo: se llega desde cualquiera de las dos pestañas */}
        <View
          className="flex-row gap-3 border-t border-black/10 bg-cream px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <View className="flex-1">
            <Button
              title={editId ? "Guardar cambios" : "Guardar reunión"}
              onPress={guardar}
              loading={registrar.isPending}
            />
          </View>
          <Button title="Cancelar" variant="outline" onPress={onCerrar} disabled={registrar.isPending} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
