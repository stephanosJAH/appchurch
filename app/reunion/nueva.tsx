import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { RichTextEditor } from "../../components/RichTextEditor";
import { Body, Button, Card, Field, Label, Muted, Screen } from "../../components/ui";
import { dateToFecha, fechaLabel, fechaToDate, formatMoneda, todayISO } from "../../lib/date";
import { estaVacio } from "../../lib/richText";
import { colors, fonts } from "../../lib/theme";
import { AsistenciaInput, Modalidad } from "../../lib/types";
import { useDiscipulado } from "../../lib/queries/discipulados";
import {
  useIntegrantesMinisterio,
  useMinisterio,
  useRegistrarReunionMinisterio,
  useReunionMinisterio,
  useReunionesMinisterio,
} from "../../lib/queries/ministerios";
import { useParticipaciones } from "../../lib/queries/participaciones";
import { useRegistrarReunion, useReunion, useReuniones } from "../../lib/queries/reuniones";

const MODALIDADES: Modalidad[] = ["presencial", "virtual", "ambos"];
// Modalidades posibles por miembro (asistió presencial u online).
type ModalidadMiembro = "presencial" | "virtual";

// Una fila de la lista de asistencia. `enGrupo` es false para quien quedó
// registrado en la reunión pero ya no participa del grupo/ministerio.
type FilaAsistencia = {
  miembro_id: string;
  nombre: string;
  apellido: string | null;
  enGrupo: boolean;
};

type Origen = "discipulado" | "ministerio";

type FiltroAsistencia = "todos" | "presentes" | "ausentes";
const FILTROS: { valor: FiltroAsistencia; titulo: string }[] = [
  { valor: "todos", titulo: "Todos" },
  { valor: "presentes", titulo: "Presentes" },
  { valor: "ausentes", titulo: "Ausentes" },
];

// Para buscar sin que importen mayúsculas ni tildes ("jose" encuentra "José").
const sinTildes = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Formulario de reunión, compartido por los dos orígenes.
//
// La contabilidad está separada en la base — `reuniones` para discipulados,
// `reuniones_ministerio` para ministerios, cada una con su tabla de asistencias
// y su RPC transaccional (decisión de producto, ver 0025). La UI, en cambio, NO
// se duplica: son los mismos campos, así que esta pantalla se comparte y
// ramifica por el parámetro `origen`; lo único que cambia es de dónde sale el
// roster y qué hook de mutación se llama.
//
// Params:
//   * alta       — `origen=discipulado&discipuladoId=…` (el default histórico)
//                  o `origen=ministerio&ministerioId=…`
//   * edición    — `reunionId=…` + `origen`. El grupo/ministerio lo manda la
//                  reunión guardada, no la navegación (ver 0023/0025).
export default function NuevaReunion() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    origen?: string;
    discipuladoId?: string;
    ministerioId?: string;
    reunionId?: string;
  }>();
  const origen: Origen = params.origen === "ministerio" ? "ministerio" : "discipulado";
  const esMinisterio = origen === "ministerio";
  const editandoId = params.reunionId ? String(params.reunionId) : null;

  /* ---------- Datos de la reunión que se edita (uno u otro origen) ---------- */
  const reunionDisc = useReunion(!esMinisterio && editandoId ? editandoId : "");
  const reunionMin = useReunionMinisterio(esMinisterio && editandoId ? editandoId : "");
  const cargandoReunion = esMinisterio ? reunionMin.isLoading : reunionDisc.isLoading;
  const reunion = esMinisterio ? reunionMin.data : reunionDisc.data;

  // Al editar, el dueño de la reunión lo manda la reunión guardada.
  const grupoId = esMinisterio
    ? editandoId
      ? reunionMin.data?.ministerio_id ?? ""
      : String(params.ministerioId ?? "")
    : editandoId
      ? reunionDisc.data?.discipulado_id ?? ""
      : String(params.discipuladoId ?? "");

  /* ---------- Roster ---------- */
  // Discipulado: `participaciones` embebe al miembro (la RLS deja al líder leer
  // su gente). Ministerio: va por RPC, porque un líder de ministerio puede ser
  // `miembro` y la RLS de `miembros` no le deja leer el padrón (0024).
  const participaciones = useParticipaciones(!esMinisterio ? grupoId : "");
  const integrantes = useIntegrantesMinisterio(grupoId, esMinisterio);
  const { data: discipulado } = useDiscipulado(!esMinisterio ? grupoId : "");
  const { data: ministerio } = useMinisterio(esMinisterio ? grupoId : "");

  /* ---------- Fechas ya ocupadas (aviso de pisada) ---------- */
  // El alta hace upsert por (dueño, fecha): cargar una fecha que ya tiene
  // reunión CORRIGE la que estaba en vez de duplicarla. Es el comportamiento
  // deseado —una reunión por día—, pero conviene avisarlo en lugar de pisar en
  // silencio.
  const reunionesDisc = useReuniones(!esMinisterio ? grupoId : "");
  const reunionesMin = useReunionesMinisterio(grupoId, esMinisterio);
  const fechasOcupadas = useMemo(() => {
    const fuente = esMinisterio ? reunionesMin.data ?? [] : reunionesDisc.data ?? [];
    return new Set(fuente.filter((r) => r.id !== editandoId).map((r) => r.fecha));
  }, [esMinisterio, reunionesMin.data, reunionesDisc.data, editandoId]);

  const registrarDisc = useRegistrarReunion();
  const registrarMin = useRegistrarReunionMinisterio();
  const guardando = esMinisterio ? registrarMin.isPending : registrarDisc.isPending;

  const [fecha, setFecha] = useState(todayISO());
  const [showPicker, setShowPicker] = useState(false);
  const [tema, setTema] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad>("presencial");
  // La ofrenda se carga separada (0036): lo que entró en mano y lo que entró
  // por transferencia. El total es la suma y lo calcula el backend.
  const [ofrendaPresencial, setOfrendaPresencial] = useState("");
  const [ofrendaVirtual, setOfrendaVirtual] = useState("");
  // Reunión cargada antes del desglose: solo tiene total. Se lo pone en una de
  // las dos casillas para no perderlo, pero se avisa que hay que revisarlo.
  const [sinDesglose, setSinDesglose] = useState(false);
  const [notas, setNotas] = useState("");
  const [presentes, setPresentes] = useState<Record<string, boolean>>({});
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroAsistencia>("todos");

  // Dos pestañas que se deslizan de costado: los datos de la reunión y la
  // asistencia, que con grupos grandes es larga y conviene tenerla aparte.
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollViewInstance>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [pestana, setPestana] = useState(0);
  const irA = (i: number) => {
    setPestana(i);
    pager.current?.scrollTo({ x: i * width, animated: true });
  };
  // Override de modalidad por miembro; si no hay, se usa el default según la
  // modalidad de la reunión (presencial/ambos → presencial, virtual → virtual).
  const [modalidadesMiembro, setModalidadesMiembro] = useState<Record<string, ModalidadMiembro>>({});

  // Valores iniciales, una sola vez: al editar salen de la reunión guardada; al
  // dar de alta, la modalidad por defecto es la configurada en el grupo. Las
  // reuniones de ministerio son siempre presenciales: no se elige modalidad ni
  // por reunión ni por persona, y al editar una vieja se normaliza a presencial.
  const cargado = useRef(false);
  useEffect(() => {
    if (cargado.current) return;
    if (editandoId) {
      if (!reunion) return;
      setFecha(reunion.fecha);
      setTema(reunion.tema ?? "");
      if (!esMinisterio) setModalidad(reunion.modalidad_usada ?? "presencial");
      const aTexto = (n: number | null | undefined) => (Number(n ?? 0) ? String(Number(n)) : "");
      if (reunion.ofrenda_presencial != null || reunion.ofrenda_virtual != null) {
        setOfrendaPresencial(aTexto(reunion.ofrenda_presencial));
        setOfrendaVirtual(aTexto(reunion.ofrenda_virtual));
      } else if (Number(reunion.ofrenda_total ?? 0)) {
        if (reunion.modalidad_usada === "virtual") setOfrendaVirtual(aTexto(reunion.ofrenda_total));
        else setOfrendaPresencial(aTexto(reunion.ofrenda_total));
        setSinDesglose(true);
      }
      setNotas(reunion.notas ?? "");
      const pres: Record<string, boolean> = {};
      const mods: Record<string, ModalidadMiembro> = {};
      for (const a of reunion.asistencias ?? []) {
        pres[a.miembro_id] = a.presente;
        if (!esMinisterio && (a.modalidad === "presencial" || a.modalidad === "virtual")) {
          mods[a.miembro_id] = a.modalidad;
        }
      }
      setPresentes(pres);
      setModalidadesMiembro(mods);
      cargado.current = true;
    } else if (!esMinisterio && discipulado?.modalidad) {
      setModalidad(discipulado.modalidad);
      cargado.current = true;
    }
  }, [editandoId, reunion, esMinisterio, discipulado?.modalidad]);

  // Lista de asistencia: los integrantes activos más, al editar, quienes
  // figuran en la reunión aunque ya no estén. Sacarlos sería reescribir el
  // historial — y como el backend borra las asistencias que no vengan en el
  // payload, directamente los perdería.
  const roster = useMemo<FilaAsistencia[]>(() => {
    const filas = new Map<string, FilaAsistencia>();

    if (esMinisterio) {
      // El RPC devuelve también a los dados de baja del roster, justamente para
      // poder ponerle nombre a quien figura en una reunión vieja.
      const porId = new Map((integrantes.data ?? []).map((i) => [i.miembro_id, i]));
      for (const i of integrantes.data ?? []) {
        if (i.activo) {
          filas.set(i.miembro_id, {
            miembro_id: i.miembro_id,
            nombre: i.nombre,
            apellido: i.apellido,
            enGrupo: true,
          });
        }
      }
      for (const a of reunion?.asistencias ?? []) {
        if (filas.has(a.miembro_id)) continue;
        const i = porId.get(a.miembro_id);
        filas.set(a.miembro_id, {
          miembro_id: a.miembro_id,
          nombre: i?.nombre ?? "Sin nombre",
          apellido: i?.apellido ?? null,
          enGrupo: false,
        });
      }
    } else {
      for (const p of participaciones.data ?? []) {
        filas.set(p.miembro_id, {
          miembro_id: p.miembro_id,
          nombre: p.miembro?.nombre ?? "Sin nombre",
          apellido: p.miembro?.apellido ?? null,
          enGrupo: true,
        });
      }
      for (const a of (reunionDisc.data?.asistencias ?? [])) {
        if (filas.has(a.miembro_id)) continue;
        filas.set(a.miembro_id, {
          miembro_id: a.miembro_id,
          nombre: a.miembro?.nombre ?? "Sin nombre",
          apellido: a.miembro?.apellido ?? null,
          enGrupo: false,
        });
      }
    }

    return [...filas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [esMinisterio, integrantes.data, participaciones.data, reunion, reunionDisc.data]);

  // En el alta todos arrancan presentes. Al editar manda lo registrado: quien
  // no tiene asistencia (se sumó después) arranca ausente.
  const presenteDe = (mid: string) => presentes[mid] ?? !editandoId;
  const toggle = (mid: string) => setPresentes((p) => ({ ...p, [mid]: !presenteDe(mid) }));
  // En bloque, sobre todo el roster (no solo lo filtrado): se arranca del
  // extremo más cercano y se corrige a los pocos que difieren.
  const marcarTodos = (presente: boolean) =>
    setPresentes(Object.fromEntries(roster.map((f) => [f.miembro_id, presente])));

  const modalidadPorDefecto: ModalidadMiembro = modalidad === "virtual" ? "virtual" : "presencial";
  const modalidadDe = (mid: string): ModalidadMiembro => modalidadesMiembro[mid] ?? modalidadPorDefecto;
  const setModalidadMiembro = (mid: string, m: ModalidadMiembro) =>
    setModalidadesMiembro((prev) => ({ ...prev, [mid]: m }));
  // Solo para presencial/ambos ofrecemos elegir quién estuvo online vs presencial.
  const permiteElegirModalidad = !esMinisterio && modalidad !== "virtual";

  // Cambiar la modalidad de la reunión resetea los overrides por miembro para
  // que todos vuelvan al default de esa modalidad.
  const elegirModalidad = (m: Modalidad) => {
    setModalidad(m);
    setModalidadesMiembro({});
  };

  // El buscador y el filtro solo cambian lo que se ve: el contador y lo que se
  // guarda siguen siendo el roster entero.
  const visibles = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return roster.filter((f) => {
      if (filtro !== "todos" && presenteDe(f.miembro_id) !== (filtro === "presentes")) return false;
      return !t || sinTildes(`${f.nombre} ${f.apellido ?? ""}`).includes(t);
    });
  }, [roster, busqueda, filtro, presentes, editandoId]);

  const totalPresentes = useMemo(
    () => roster.filter((f) => presenteDe(f.miembro_id)).length,
    [roster, presentes, editandoId]
  );

  const fechaPisa = !editandoId && fechasOcupadas.has(fecha);

  // Montos como se escriben acá: "1.500,50", "1500,5", "1.500" (mil
  // quinientos, no uno coma cinco) o "1500.5". NaN si no es un monto.
  const aMonto = (t: string) => {
    const limpio = t.trim().replace(/[\s$]/g, "");
    if (!limpio) return 0;
    const normal = limpio.includes(",")
      ? limpio.replace(/\./g, "").replace(",", ".")
      : /^\d{1,3}(\.\d{3})+$/.test(limpio)
        ? limpio.replace(/\./g, "")
        : limpio;
    return Number(normal);
  };
  const montoPresencial = aMonto(ofrendaPresencial);
  const montoVirtual = aMonto(ofrendaVirtual);
  const ofrendaTotal =
    (Number.isFinite(montoPresencial) ? montoPresencial : 0) +
    (Number.isFinite(montoVirtual) ? montoVirtual : 0);

  const onSubmit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      Alert.alert("Fecha inválida", "Usá el formato AAAA-MM-DD.");
      return;
    }
    if (!grupoId) {
      Alert.alert(
        "Error",
        esMinisterio
          ? "No se pudo determinar el ministerio de la reunión."
          : "No se pudo determinar el discipulado de la reunión."
      );
      return;
    }
    if (
      !Number.isFinite(montoPresencial) ||
      !Number.isFinite(montoVirtual) ||
      montoPresencial < 0 ||
      montoVirtual < 0
    ) {
      Alert.alert("Ofrenda inválida", "Ingresá montos en números, sin signos (por ejemplo 1500 o 1500,50).");
      return;
    }
    const asistencias: AsistenciaInput[] = roster.map((f) => ({
      miembro_id: f.miembro_id,
      presente: presenteDe(f.miembro_id),
      modalidad: presenteDe(f.miembro_id) ? modalidadDe(f.miembro_id) : null,
    }));
    try {
      if (esMinisterio) {
        await registrarMin.mutateAsync({
          reunion_id: editandoId,
          ministerio_id: grupoId,
          fecha,
          tema: tema.trim() || null,
          modalidad,
          ofrenda_presencial: montoPresencial,
          ofrenda_virtual: montoVirtual,
          notas: estaVacio(notas) ? null : notas.trim(),
          asistencias,
        });
      } else {
        await registrarDisc.mutateAsync({
          reunion_id: editandoId,
          discipulado_id: grupoId,
          fecha,
          tema: tema.trim() || null,
          material_url: null,
          modalidad,
          ofrenda_presencial: montoPresencial,
          ofrenda_virtual: montoVirtual,
          notas: notas.trim() || null,
          asistencias,
        });
      }
      Alert.alert("Listo", editandoId ? "Reunión actualizada." : "Reunión registrada.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar la reunión.");
    }
  };

  if (editandoId && cargandoReunion) {
    return (
      <Screen className="items-center justify-center">
        <Stack.Screen options={{ title: "Editar reunión" }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (editandoId && !reunion) {
    return (
      <Screen className="items-center justify-center p-8">
        <Stack.Screen options={{ title: "Editar reunión" }} />
        <Muted>No se encontró la reunión.</Muted>
      </Screen>
    );
  }

  const cargandoRoster =
    (esMinisterio ? integrantes.isLoading : participaciones.isLoading) && roster.length === 0;
  const nombreDueno = esMinisterio
    ? ministerio?.nombre
    : discipulado?.nombre ?? discipulado?.descripcion_etaria;

  const pestanas = [
    { titulo: "Datos", extra: null },
    { titulo: "Asistencia", extra: roster.length ? `${totalPresentes}/${roster.length}` : null },
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: editandoId ? "Editar reunión" : "Registrar reunión" }} />
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
          <ScrollView
            style={{ width }}
            contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
          {nombreDueno ? (
            <View className="mb-4 flex-row items-center gap-1.5">
              <Ionicons
                name={esMinisterio ? "sparkles-outline" : "people-outline"}
                size={14}
                color={colors.tertiary}
              />
              <Muted className="text-gold">{nombreDueno}</Muted>
            </View>
          ) : null}

          <Label className="mb-1.5">Fecha</Label>
            <View className="mb-4 flex-row items-center gap-2">
              <Pressable
                onPress={() => setShowPicker(true)}
                className="flex-1 flex-row items-center justify-between rounded-lg border border-black/10 bg-surface px-4 py-3.5 active:opacity-70"
              >
                <Body className="capitalize text-ink">{fechaLabel(fecha)}</Body>
                <Ionicons name="calendar-outline" size={18} color={colors.outline} />
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

            {/* Solo una reunión por día: guardar acá corrige la que ya está */}
            {fechaPisa && (
              <View className="mb-4 flex-row items-start gap-2 rounded-lg bg-gold-container p-3">
                <Ionicons name="alert-circle-outline" size={16} color={colors.onTertiaryContainer} />
                <Muted className="flex-1" style={{ color: colors.onTertiaryContainer }}>
                  Esa fecha ya tiene una reunión registrada. Si guardás, se actualiza
                  con lo que cargues acá en vez de crear otra.
                </Muted>
              </View>
            )}

            <Field label="Tema / lección" value={tema} onChangeText={setTema} placeholder="Tema dado en la reunión" multiline />

            {!esMinisterio && (
              <>
                <Label className="mb-1.5">Modalidad</Label>
                <View className="mb-4 flex-row gap-2">
                  {MODALIDADES.map((m) => (
                    <View key={m} className="flex-1">
                      <Button title={m} variant={modalidad === m ? "primary" : "outline"} size="sm" onPress={() => elegirModalidad(m)} />
                    </View>
                  ))}
                </View>
              </>
            )}

            <View className="mb-1.5 flex-row items-center justify-between">
              <Label>Ofrenda</Label>
              <Muted className="text-gold">Total {formatMoneda(ofrendaTotal)}</Muted>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field
                  label="Presencial"
                  value={ofrendaPresencial}
                  onChangeText={(t) => {
                    setOfrendaPresencial(t);
                    setSinDesglose(false);
                  }}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </View>
              <View className="flex-1">
                <Field
                  label="Virtual"
                  value={ofrendaVirtual}
                  onChangeText={(t) => {
                    setOfrendaVirtual(t);
                    setSinDesglose(false);
                  }}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            {sinDesglose && (
              <View className="mb-4 flex-row items-start gap-2 rounded-lg bg-gold-container p-3">
                <Ionicons name="alert-circle-outline" size={16} color={colors.onTertiaryContainer} />
                <Muted className="flex-1" style={{ color: colors.onTertiaryContainer }}>
                  Esta reunión se cargó con la ofrenda total, sin separar. La pusimos en
                  {reunion?.modalidad_usada === "virtual" ? " virtual" : " presencial"}: si
                  parte entró por el otro lado, repartila antes de guardar.
                </Muted>
              </View>
            )}

            <View className="mt-5">
              {esMinisterio ? (
                <RichTextEditor label="Notas" valor={notas} onChange={setNotas} placeholder="Observaciones (opcional)" />
              ) : (
                <Field label="Notas" value={notas} onChangeText={setNotas} placeholder="Observaciones (opcional)" multiline />
              )}
            </View>

          </ScrollView>

          <ScrollView
            style={{ width }}
            contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            <View className="mb-2.5 flex-row items-center justify-between">
              <Label>Asistencia</Label>
              <Muted className="text-gold">
                {totalPresentes}/{roster.length} presentes
              </Muted>
            </View>

            {cargandoRoster ? (
              <Muted>{esMinisterio ? "Cargando integrantes…" : "Cargando discípulos…"}</Muted>
            ) : roster.length === 0 ? (
              <Card>
                <Muted>
                  {esMinisterio
                    ? "Este ministerio no tiene integrantes. Sumalos desde el detalle del ministerio."
                    : "Este grupo no tiene discípulos. Agregalos desde el detalle del discipulado."}
                </Muted>
              </Card>
            ) : (
              <>
                <Field
                  icon="search-outline"
                  placeholder="Buscar por nombre"
                  value={busqueda}
                  onChangeText={setBusqueda}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />

                <View className="mb-3 flex-row flex-wrap items-center justify-between gap-y-2">
                  <View className="flex-row gap-1.5">
                    {FILTROS.map(({ valor, titulo }) => {
                      const sel = filtro === valor;
                      return (
                        <Pressable
                          key={valor}
                          onPress={() => setFiltro(valor)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: sel }}
                          className={`rounded-full px-3 py-1.5 active:opacity-70 ${sel ? "bg-navy" : "bg-surface-mid"}`}
                        >
                          <Text
                            style={{ fontFamily: fonts.sansSemibold }}
                            className={`text-xs ${sel ? "text-white" : "text-ink-variant"}`}
                          >
                            {titulo}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View className="flex-row gap-4">
                    <Pressable onPress={() => marcarTodos(true)} hitSlop={8} className="active:opacity-60">
                      <Text style={{ fontFamily: fonts.sansSemibold }} className="text-[13px] text-navy underline">
                        Marcar todos
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => marcarTodos(false)} hitSlop={8} className="active:opacity-60">
                      <Text style={{ fontFamily: fonts.sansSemibold }} className="text-[13px] text-navy underline">
                        Ninguno
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {visibles.length === 0 ? (
                  <Muted>
                    {busqueda.trim()
                      ? `Nadie coincide con “${busqueda.trim()}”.`
                      : filtro === "presentes"
                        ? "No hay nadie marcado como presente."
                        : "No hay ausentes."}
                  </Muted>
                ) : (
                  <View className="overflow-hidden rounded-lg border border-black/10 bg-surface">
                    {visibles.map((f, i) => {
                      const presente = presenteDe(f.miembro_id);
                      const mod = modalidadDe(f.miembro_id);
                      return (
                        <View
                          key={f.miembro_id}
                          className={`flex-row items-center pr-3 ${i > 0 ? "border-t border-black/5" : ""} ${
                            presente ? "bg-navy/5" : ""
                          }`}
                        >
                          <Pressable
                            onPress={() => toggle(f.miembro_id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: presente }}
                            className="flex-1 flex-row items-center gap-3 py-3 pl-3.5 active:opacity-70"
                          >
                            <View
                              className={`h-5 w-5 items-center justify-center rounded-md border-[1.5px] ${
                                presente ? "border-navy bg-navy" : "border-ink-muted"
                              }`}
                            >
                              {presente && <Ionicons name="checkmark" size={14} color="#fff" />}
                            </View>
                            <View className="flex-1">
                              <Body className="text-ink" numberOfLines={1}>
                                {f.nombre} {f.apellido ?? ""}
                              </Body>
                              {!f.enGrupo ? (
                                <Muted>{esMinisterio ? "Ya no está en el ministerio" : "Ya no está en el grupo"}</Muted>
                              ) : null}
                            </View>
                          </Pressable>

                          {/* Presencial vs. virtual por persona (discipulado presencial/ambos): un toque alterna */}
                          {presente && permiteElegirModalidad && (
                            <Pressable
                              onPress={() =>
                                setModalidadMiembro(f.miembro_id, mod === "virtual" ? "presencial" : "virtual")
                              }
                              hitSlop={6}
                              accessibilityRole="button"
                              accessibilityLabel={`${mod === "virtual" ? "Virtual" : "Presencial"}, tocá para cambiar`}
                              className="flex-row items-center gap-1 rounded-full bg-surface-mid px-2.5 py-1 active:opacity-70"
                            >
                              <Ionicons
                                name={mod === "virtual" ? "videocam-outline" : "business-outline"}
                                size={13}
                                color={colors.outline}
                              />
                              <Text style={{ fontFamily: fonts.sansSemibold }} className="text-xs text-ink-variant">
                                {mod === "virtual" ? "Virtual" : "Presencial"}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}

          </ScrollView>
        </Animated.ScrollView>

        {/* Guardar queda fijo abajo: se llega desde cualquiera de las dos pestañas */}
        <View
          className="border-t border-black/10 bg-cream px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Button
            title={editandoId ? "Guardar cambios" : "Guardar reunión"}
            onPress={onSubmit}
            loading={guardando}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
