import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { Body, Button, Card, Field, KeyboardScrollView, Label, Muted, Title } from "../../components/ui";
import { dateToFecha, fechaLabel, fechaToDate, todayISO } from "../../lib/date";
import { colors, fonts } from "../../lib/theme";
import { AsistenciaInput, Modalidad } from "../../lib/types";
import { useDiscipulado } from "../../lib/queries/discipulados";
import { useParticipaciones } from "../../lib/queries/participaciones";
import { useRegistrarReunion } from "../../lib/queries/reuniones";

const MODALIDADES: Modalidad[] = ["presencial", "virtual", "ambos"];
// Modalidades posibles por miembro (asistió presencial u online).
type ModalidadMiembro = "presencial" | "virtual";
const MODALIDADES_MIEMBRO: ModalidadMiembro[] = ["presencial", "virtual"];

export default function NuevaReunion() {
  const router = useRouter();
  const { discipuladoId } = useLocalSearchParams<{ discipuladoId: string }>();
  const grupoId = String(discipuladoId);

  const { data: participaciones = [], isLoading } = useParticipaciones(grupoId);
  const { data: discipulado } = useDiscipulado(grupoId);
  const registrar = useRegistrarReunion();

  const [fecha, setFecha] = useState(todayISO());
  const [showPicker, setShowPicker] = useState(false);
  const [tema, setTema] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad>("presencial");
  // Default: la modalidad configurada en el discipulado (se aplica al cargar).
  useEffect(() => {
    if (discipulado?.modalidad) setModalidad(discipulado.modalidad);
  }, [discipulado?.modalidad]);
  const [ofrenda, setOfrenda] = useState("");
  const [notas, setNotas] = useState("");
  const [presentes, setPresentes] = useState<Record<string, boolean>>({});
  // Override de modalidad por miembro; si no hay, se usa el default según la
  // modalidad de la reunión (presencial/ambos → presencial, virtual → virtual).
  const [modalidadesMiembro, setModalidadesMiembro] = useState<Record<string, ModalidadMiembro>>({});

  // Al cambiar la modalidad de la reunión, se resetean los overrides para que
  // todos vuelvan al default de esa modalidad.
  useEffect(() => {
    setModalidadesMiembro({});
  }, [modalidad]);

  const presenteDe = (mid: string) => presentes[mid] ?? true;
  const toggle = (mid: string) => setPresentes((p) => ({ ...p, [mid]: !presenteDe(mid) }));

  const modalidadPorDefecto: ModalidadMiembro = modalidad === "virtual" ? "virtual" : "presencial";
  const modalidadDe = (mid: string): ModalidadMiembro => modalidadesMiembro[mid] ?? modalidadPorDefecto;
  const setModalidadMiembro = (mid: string, m: ModalidadMiembro) =>
    setModalidadesMiembro((prev) => ({ ...prev, [mid]: m }));
  // Solo para presencial/ambos ofrecemos elegir quién estuvo online vs presencial.
  const permiteElegirModalidad = modalidad !== "virtual";

  const totalPresentes = useMemo(
    () => participaciones.filter((p) => presenteDe(p.miembro_id)).length,
    [participaciones, presentes]
  );

  const onSubmit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      Alert.alert("Fecha inválida", "Usá el formato AAAA-MM-DD.");
      return;
    }
    const asistencias: AsistenciaInput[] = participaciones.map((p) => ({
      miembro_id: p.miembro_id,
      presente: presenteDe(p.miembro_id),
      modalidad: presenteDe(p.miembro_id) ? modalidadDe(p.miembro_id) : null,
    }));
    try {
      await registrar.mutateAsync({
        discipulado_id: grupoId,
        fecha,
        tema: tema.trim() || null,
        material_url: null,
        modalidad,
        ofrenda: Number(ofrenda) || 0,
        notas: notas.trim() || null,
        asistencias,
      });
      Alert.alert("Listo", "Reunión registrada.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar la reunión.");
    }
  };

  return (
    <KeyboardScrollView>
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

        <Field label="Tema / lección" value={tema} onChangeText={setTema} placeholder="Tema dado en la reunión" multiline />

        <Label className="mb-1.5">Modalidad</Label>
        <View className="mb-4 flex-row gap-2">
          {MODALIDADES.map((m) => (
            <View key={m} className="flex-1">
              <Button title={m} variant={modalidad === m ? "primary" : "outline"} size="sm" onPress={() => setModalidad(m)} />
            </View>
          ))}
        </View>

        <Field label="Ofrenda total" value={ofrenda} onChangeText={setOfrenda} placeholder="0" keyboardType="numeric" />

        {/* Asistencia */}
        <View className="mb-2.5 mt-2 flex-row items-center justify-between">
          <Label>Asistencia</Label>
          <Muted className="text-gold">
            {totalPresentes}/{participaciones.length} presentes
          </Muted>
        </View>

        {isLoading ? (
          <Muted>Cargando discípulos…</Muted>
        ) : participaciones.length === 0 ? (
          <Card>
            <Muted>Este grupo no tiene discípulos. Agregalos desde el detalle del discipulado.</Muted>
          </Card>
        ) : (
          <View className="gap-2.5">
            {participaciones.map((p) => {
              const presente = presenteDe(p.miembro_id);
              return (
                <View
                  key={p.id}
                  className={`rounded-lg border p-3.5 ${
                    presente ? "border-navy bg-navy/5" : "border-black/10 bg-surface"
                  }`}
                >
                  <Pressable
                    onPress={() => toggle(p.miembro_id)}
                    className="flex-row items-center gap-3 active:opacity-70"
                  >
                    <Ionicons
                      name={presente ? "checkmark-circle" : "ellipse-outline"}
                      size={24}
                      color={presente ? colors.primary : colors.outlineVariant}
                    />
                    <Body className="flex-1 text-ink">
                      {p.miembro?.nombre} {p.miembro?.apellido ?? ""}
                    </Body>
                  </Pressable>

                  {/* Presencial vs. virtual por miembro (presencial/ambos) */}
                  {presente && permiteElegirModalidad && (
                    <View className="mt-2.5 flex-row gap-2 pl-9">
                      {MODALIDADES_MIEMBRO.map((m) => {
                        const sel = modalidadDe(p.miembro_id) === m;
                        return (
                          <Pressable
                            key={m}
                            onPress={() => setModalidadMiembro(p.miembro_id, m)}
                            className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
                              sel ? "bg-navy" : "bg-surface-mid"
                            }`}
                          >
                            <Ionicons
                              name={m === "virtual" ? "videocam-outline" : "business-outline"}
                              size={14}
                              color={sel ? "#fff" : colors.outline}
                            />
                            <Text
                              style={{ fontFamily: fonts.sansSemibold }}
                              className={`text-xs ${sel ? "text-white" : "text-ink-variant"}`}
                            >
                              {m === "virtual" ? "Virtual" : "Presencial"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View className="mt-5">
          <Field label="Notas" value={notas} onChangeText={setNotas} placeholder="Observaciones (opcional)" multiline />
        </View>

        <View className="mt-2">
          <Button title="Guardar reunión" onPress={onSubmit} loading={registrar.isPending} />
        </View>
    </KeyboardScrollView>
  );
}
