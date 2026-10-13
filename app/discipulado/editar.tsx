import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { BuscadorPersonas, ListaPersonas, PersonaOpcion } from "../../components/SelectorPersonas";
import { Button, Card, Field, KeyboardScrollView, Label, Muted } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatHora } from "../../lib/date";
import { fonts } from "../../lib/theme";
import { DIAS_SEMANA, Modalidad, Profile, SexoDiscipulado } from "../../lib/types";
import {
  useBajaDiscipulado,
  useDiscipulados,
  useUpsertDiscipulado,
} from "../../lib/queries/discipulados";
import { nombreDePerfil, useProfiles } from "../../lib/queries/profiles";

const MODALIDADES: Modalidad[] = ["presencial", "virtual", "ambos"];
const SEXOS: SexoDiscipulado[] = ["M", "F", "mixto"];

export default function EditarDiscipulado() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ?? null;
  const { isAdmin } = useAuth();

  const { data: discipulados = [] } = useDiscipulados();
  const { data: profiles = [] } = useProfiles();
  const upsert = useUpsertDiscipulado();
  const baja = useBajaDiscipulado();

  const [showBaja, setShowBaja] = useState(false);
  const [motivo, setMotivo] = useState("");

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [sexo, setSexo] = useState<SexoDiscipulado>("mixto");
  const [modalidad, setModalidad] = useState<Modalidad>("presencial");
  const [dia, setDia] = useState(3);
  const [hora, setHora] = useState("19:00");
  const [ubicacion, setUbicacion] = useState("");
  const [discipuladorId, setDiscipuladorId] = useState<string | null>(null);

  // Cargar datos cuando estamos editando (una sola vez).
  const cargado = useRef(false);
  useEffect(() => {
    if (cargado.current || !editingId) return;
    const d = discipulados.find((x) => x.id === editingId);
    if (!d) return;
    setNombre(d.nombre ?? "");
    setDescripcion(d.descripcion_etaria ?? "");
    setSexo(d.sexo);
    setModalidad(d.modalidad);
    setDia(d.dia_semana);
    setHora(formatHora(d.hora_inicio));
    setUbicacion(d.ubicacion ?? "");
    setDiscipuladorId(d.discipulador_id);
    cargado.current = true;
  }, [editingId, discipulados]);

  // Usuarios ya líderes de OTRO grupo (respeta 1:1).
  const tomadosPorOtro = useMemo(() => {
    const s = new Set<string>();
    for (const d of discipulados) {
      if (d.discipulador_id && d.id !== editingId) s.add(d.discipulador_id);
    }
    return s;
  }, [discipulados, editingId]);

  // Selector del discipulador: mismo buscador + lista que los líderes de un
  // ministerio, pero de uno solo — elegir otro reemplaza al actual. Las cuentas
  // las lee solo el admin, así que el filtrado es en memoria.
  const [busqueda, setBusqueda] = useState("");
  const opcion = (p: Profile): PersonaOpcion => ({
    id: p.id,
    nombre: nombreDePerfil(p) ?? p.username ?? p.id.slice(0, 8),
    detalle: p.rol,
  });
  // Solo se ofrecen obreros sin otro grupo. Se conserva al líder ya asignado
  // (aunque no sea obrero) para no ocultarlo al editar un discipulado existente.
  const candidatos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return [];
    const asignadoActual = editingId
      ? discipulados.find((x) => x.id === editingId)?.discipulador_id ?? null
      : null;
    return profiles
      .filter(
        (p) =>
          p.id !== discipuladorId &&
          !tomadosPorOtro.has(p.id) &&
          (p.rol === "obrero" || p.id === asignadoActual)
      )
      .map(opcion)
      .filter((o) => o.nombre.toLowerCase().includes(texto))
      .slice(0, 8);
  }, [profiles, busqueda, tomadosPorOtro, discipulados, editingId, discipuladorId]);
  const elegido = useMemo((): PersonaOpcion[] => {
    if (!discipuladorId) return [];
    const p = profiles.find((x) => x.id === discipuladorId);
    return [p ? opcion(p) : { id: discipuladorId, nombre: "Sin nombre" }];
  }, [discipuladorId, profiles]);

  const guardar = async () => {
    if (!/^\d{2}:\d{2}$/.test(hora)) {
      Alert.alert("Hora inválida", "Usá el formato HH:MM (ej. 19:00).");
      return;
    }
    try {
      await upsert.mutateAsync({
        ...(editingId ? { id: editingId } : {}),
        nombre: nombre.trim() || null,
        descripcion_etaria: descripcion.trim() || null,
        sexo,
        modalidad,
        dia_semana: dia,
        hora_inicio: `${hora}:00`,
        ubicacion: ubicacion.trim() || null,
        discipulador_id: discipuladorId,
      });
      router.back();
    } catch (e: any) {
      const msg =
        e?.code === "23505" || /discipulador_unico/.test(e?.message ?? "")
          ? "Ese discipulador ya lidera otro grupo. Un discipulador puede tener un solo discipulado."
          : e?.message ?? "No se pudo guardar el discipulado.";
      Alert.alert("Error", msg);
    }
  };

  const confirmarBaja = async () => {
    if (!motivo.trim()) {
      Alert.alert("Falta el motivo", "Indicá por qué se da de baja el discipulado.");
      return;
    }
    if (!editingId) return;
    try {
      await baja.mutateAsync({ id: editingId, motivo: motivo.trim() });
      Alert.alert("Discipulado dado de baja", "Se puede reactivar desde Perfil → Discipulados dados de baja.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo dar de baja.");
    }
  };

  return (
    <KeyboardScrollView>
      <Stack.Screen options={{ title: editingId ? "Editar discipulado" : "Nuevo discipulado" }} />
      <Field label="Nombre (opcional)" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
      <Field label="Descripción etaria" value={descripcion} onChangeText={setDescripcion} placeholder="Ej. Jóvenes 18-25" />

      <Label className="mb-1.5">Día</Label>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {DIAS_SEMANA.map((d, i) => (
          <Text
            key={i}
            onPress={() => setDia(i)}
            style={{ fontFamily: fonts.sansSemibold }}
            className={`rounded-full px-3.5 py-1.5 text-sm ${
              dia === i ? "bg-navy text-white" : "bg-surface-mid text-ink-variant"
            }`}
          >
            {d.slice(0, 3)}
          </Text>
        ))}
      </View>

      <Field label="Hora de inicio" icon="time-outline" value={hora} onChangeText={setHora} placeholder="19:00" autoCapitalize="none" />

      <Label className="mb-1.5">Sexo del grupo</Label>
      <View className="mb-4 flex-row gap-2">
        {SEXOS.map((s) => (
          <View key={s} className="flex-1">
            <Button title={s} variant={sexo === s ? "primary" : "outline"} size="sm" onPress={() => setSexo(s)} />
          </View>
        ))}
      </View>

      <Label className="mb-1.5">Modalidad</Label>
      <View className="mb-4 flex-row gap-2">
        {MODALIDADES.map((m) => (
          <View key={m} className="flex-1">
            <Button title={m} variant={modalidad === m ? "primary" : "outline"} size="sm" onPress={() => setModalidad(m)} />
          </View>
        ))}
      </View>

      <Field label="Ubicación" value={ubicacion} onChangeText={setUbicacion} />

      {isAdmin && (
      <>
      <Label className="mb-1.5">Discipulador a cargo</Label>
      <Muted className="mb-2">
        Solo se ofrecen obreros sin discipulado asignado. Elegir otro reemplaza al actual.
      </Muted>
      <BuscadorPersonas
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        candidatos={candidatos}
        onAgregar={(p) => {
          setDiscipuladorId(p.id);
          setBusqueda("");
        }}
        placeholder="Buscar un obrero por nombre…"
        sinResultados={`Ningún obrero libre coincide con “${busqueda.trim()}”.`}
      />
      <View className="mb-1">
        <ListaPersonas
          personas={elegido}
          vacio="Sin asignar. Buscá al discipulador arriba por nombre."
          onQuitar={() => setDiscipuladorId(null)}
        />
      </View>
      </>
      )}

      <Button
        title={editingId ? "Guardar cambios" : "Crear discipulado"}
        onPress={guardar}
        loading={upsert.isPending}
      />

      {/* Zona de baja (solo admin, al editar) */}
      {editingId && isAdmin && (
        <View className="mt-8 border-t border-black/10 pt-5">
          <Label className="mb-1">Zona de riesgo</Label>
          {!showBaja ? (
            <>
              <Muted className="mb-3">
                Dar de baja oculta el discipulado y libera a su discipulador. Se puede reactivar luego.
              </Muted>
              <Button title="Dar de baja el discipulado" variant="danger" onPress={() => setShowBaja(true)} />
            </>
          ) : (
            <Card className="border-danger/30">
              <Field
                label="Motivo de la baja"
                value={motivo}
                onChangeText={setMotivo}
                placeholder="Ej. El grupo dejó de reunirse"
                multiline
              />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button
                    title="Cancelar"
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      setShowBaja(false);
                      setMotivo("");
                    }}
                  />
                </View>
                <View className="flex-1">
                  <Button title="Confirmar baja" variant="danger" size="sm" onPress={confirmarBaja} loading={baja.isPending} />
                </View>
              </View>
            </Card>
          )}
        </View>
      )}
    </KeyboardScrollView>
  );
}
