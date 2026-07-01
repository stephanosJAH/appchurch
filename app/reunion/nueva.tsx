import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Body, Button, Card, Field, KeyboardScrollView, Label, Muted, Title } from "../../components/ui";
import { todayISO } from "../../lib/date";
import { colors } from "../../lib/theme";
import { AsistenciaInput, Modalidad } from "../../lib/types";
import { useParticipaciones } from "../../lib/queries/participaciones";
import { useRegistrarReunion } from "../../lib/queries/reuniones";

const MODALIDADES: Modalidad[] = ["presencial", "virtual", "ambos"];

export default function NuevaReunion() {
  const router = useRouter();
  const { discipuladoId } = useLocalSearchParams<{ discipuladoId: string }>();
  const grupoId = String(discipuladoId);

  const { data: participaciones = [], isLoading } = useParticipaciones(grupoId);
  const registrar = useRegistrarReunion();

  const [fecha, setFecha] = useState(todayISO());
  const [tema, setTema] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad>("presencial");
  const [ofrenda, setOfrenda] = useState("");
  const [notas, setNotas] = useState("");
  const [presentes, setPresentes] = useState<Record<string, boolean>>({});

  const presenteDe = (mid: string) => presentes[mid] ?? true;
  const toggle = (mid: string) => setPresentes((p) => ({ ...p, [mid]: !presenteDe(mid) }));

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
      modalidad: presenteDe(p.miembro_id) ? modalidad : null,
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
      <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <Field label="Fecha" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" autoCapitalize="none" />
          </View>
          <View className="mb-4">
            <Button title="Hoy" variant="outline" size="sm" onPress={() => setFecha(todayISO())} />
          </View>
        </View>

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
                <Pressable
                  key={p.id}
                  onPress={() => toggle(p.miembro_id)}
                  className={`flex-row items-center gap-3 rounded-lg border p-3.5 ${
                    presente ? "border-navy bg-navy/5" : "border-black/10 bg-surface"
                  }`}
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
