import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { RichTextEditor } from "../../components/RichTextEditor";
import { Body, Button, Card, Chip, Field, KeyboardScrollView, Label, Muted } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import {
  useAsignarLideres,
  useBajaMinisterio,
  useLideresMinisterios,
  useMinisterio,
  useSoyLiderDe,
  useUpsertMinisterio,
} from "../../lib/queries/ministerios";
import { useProfiles } from "../../lib/queries/profiles";
import { colors } from "../../lib/theme";

// Alta y edición de un ministerio.
//
// Dos audiencias en la misma pantalla, y el corte NO es el rol:
//   * el admin crea, edita todo y asigna los líderes;
//   * cualquier líder del ministerio edita nombre, descripción e ícono —
//     aunque su rol sea `miembro`, porque el poder viene de la asignación.
// Quién lidera lo sigue decidiendo el admin (policy `minlid_admin`, 0024): es
// la única cosa en la que los líderes no son autosuficientes, para que uno no
// se vuelva administrador de hecho de su área sumando cuentas.

// Íconos ofrecidos para el ministerio. Lista corta y curada a propósito: un
// buscador de los ~1300 ionicons sería una pantalla propia, y lo que se guarda
// es el nombre del ícono, así que agregar opciones acá no migra nada.
const ICONOS: { nombre: keyof typeof Ionicons.glyphMap; etiqueta: string }[] = [
  { nombre: "sparkles-outline", etiqueta: "General" },
  { nombre: "musical-notes-outline", etiqueta: "Alabanza" },
  { nombre: "people-outline", etiqueta: "Jóvenes" },
  { nombre: "happy-outline", etiqueta: "Niños" },
  { nombre: "heart-outline", etiqueta: "Acción social" },
  { nombre: "book-outline", etiqueta: "Enseñanza" },
  { nombre: "megaphone-outline", etiqueta: "Evangelismo" },
  { nombre: "hand-left-outline", etiqueta: "Oración" },
  { nombre: "videocam-outline", etiqueta: "Medios" },
  { nombre: "home-outline", etiqueta: "Hospitalidad" },
];

export default function EditarMinisterio() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ?? null;
  const { isAdmin } = useAuth();
  const { soyLider } = useSoyLiderDe(editingId ?? undefined);

  const { data: ministerio } = useMinisterio(editingId ?? "");
  // Los líderes llegan por una consulta aparte (la vista `ministerios_lideres`),
  // así que el snapshot inicial tiene que esperarla: si corre antes, `lideres`
  // arranca vacío y el guard de "una sola vez" no lo deja corregirse — guardar
  // borraría a todos los líderes del ministerio.
  const { isLoading: cargandoLideres } = useLideresMinisterios();
  // La lista de cuentas solo la lee el admin (`prof_select`, 0002); para un
  // líder la consulta volvería casi vacía, así que ni se dispara.
  const { data: profiles = [] } = useProfiles();
  const upsert = useUpsertMinisterio();
  const asignar = useAsignarLideres();
  const baja = useBajaMinisterio();

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [icono, setIcono] = useState<string>("sparkles-outline");
  const [lideres, setLideres] = useState<string[]>([]);
  const [showBaja, setShowBaja] = useState(false);
  const [motivo, setMotivo] = useState("");

  // Cargar los datos al editar, una sola vez (mismo patrón que
  // discipulado/editar.tsx: después manda lo que escribe el usuario).
  const cargado = useRef(false);
  useEffect(() => {
    if (cargado.current || !editingId || !ministerio || cargandoLideres) return;
    setNombre(ministerio.nombre);
    setDescripcion(ministerio.descripcion ?? "");
    setIcono(ministerio.icono ?? "sparkles-outline");
    setLideres((ministerio.lideres ?? []).map((l) => l.profile_id));
    cargado.current = true;
  }, [editingId, ministerio, cargandoLideres]);

  // Crear un ministerio es solo del admin (`min_admin`); editarlo, de cualquiera
  // de sus líderes. Acá solo se evita mostrar un formulario que iría a fallar.
  const puedeEditar = editingId ? isAdmin || soyLider : isAdmin;

  const toggleLider = (profileId: string) =>
    setLideres((prev) =>
      prev.includes(profileId) ? prev.filter((p) => p !== profileId) : [...prev, profileId]
    );

  const guardar = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Un ministerio necesita un nombre (ej. «Jóvenes»).");
      return;
    }
    try {
      const guardado = await upsert.mutateAsync({
        ...(editingId ? { id: editingId } : {}),
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        icono,
      });
      // Los líderes son otra tabla y otra policy: se guardan aparte, y solo si
      // quien está guardando es admin (para el líder el picker ni se muestra).
      if (isAdmin) {
        await asignar.mutateAsync({ ministerioId: guardado.id, profileIds: lideres });
      }
      router.back();
    } catch (e: any) {
      const msg = /ministerios_nombre_unico/.test(e?.message ?? "")
        ? "Ya existe un ministerio con ese nombre. Si estaba dado de baja, reactivalo desde Administración."
        : e?.message ?? "No se pudo guardar el ministerio.";
      Alert.alert("Error", msg);
    }
  };

  const confirmarBaja = async () => {
    if (!motivo.trim()) {
      Alert.alert("Falta el motivo", "Indicá por qué se da de baja el ministerio.");
      return;
    }
    if (!editingId) return;
    try {
      await baja.mutateAsync({ id: editingId, motivo: motivo.trim() });
      Alert.alert(
        "Ministerio dado de baja",
        "Deja de aparecer para su gente. Se puede reactivar desde Administración → Ministerios.",
        [{ text: "OK", onPress: () => router.replace("/admin/ministerios") }]
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo dar de baja.");
    }
  };

  if (!puedeEditar) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-8">
        <Stack.Screen options={{ title: "Ministerio" }} />
        <Muted className="text-center">
          {editingId
            ? "No liderás este ministerio, así que no podés editarlo."
            : "Los ministerios los crea un administrador."}
        </Muted>
      </View>
    );
  }

  return (
    <KeyboardScrollView>
      <Stack.Screen options={{ title: editingId ? "Editar ministerio" : "Nuevo ministerio" }} />

      <Field
        label="Nombre"
        value={nombre}
        onChangeText={setNombre}
        placeholder="Ej. Jóvenes"
        autoCapitalize="words"
      />

      <Label className="mb-1.5">Ícono</Label>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {ICONOS.map((i) => {
          const sel = icono === i.nombre;
          return (
            <Pressable
              key={i.nombre}
              onPress={() => setIcono(i.nombre)}
              accessibilityLabel={i.etiqueta}
              className={`h-12 w-12 items-center justify-center rounded-xl border ${
                sel ? "border-navy bg-navy" : "border-black/10 bg-surface"
              }`}
            >
              <Ionicons name={i.nombre} size={21} color={sel ? "#fff" : colors.outline} />
            </Pressable>
          );
        })}
      </View>

      <RichTextEditor
        label="Descripción"
        valor={descripcion}
        onChange={setDescripcion}
        placeholder="Qué hace el ministerio, cuándo se junta, a quién está dirigido…"
        ayuda="Se ve en el detalle del ministerio. Admite títulos, viñetas y enlaces."
      />

      {isAdmin && (
        <>
          <Label className="mb-1.5">Líderes</Label>
          <Muted className="mb-2">
            Todos los líderes tienen las mismas atribuciones: registran reuniones,
            editan las que cargó otro, gestionan el roster y publican anuncios. No
            hace falta que sean obreros.
          </Muted>
          <View className="mb-5 gap-2">
            {profiles.length === 0 ? (
              <Muted>No hay cuentas para asignar todavía.</Muted>
            ) : (
              profiles
                .filter((p) => p.rol !== "pendiente")
                .map((p) => {
                  const sel = lideres.includes(p.id);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => toggleLider(p.id)}
                      className={`rounded-lg border px-3.5 py-3 ${
                        sel ? "border-navy bg-navy/5" : "border-black/10 bg-surface"
                      }`}
                    >
                      <View className="flex-row items-center gap-2.5">
                        <Ionicons
                          name={sel ? "checkbox" : "square-outline"}
                          size={20}
                          color={sel ? colors.primary : colors.outlineVariant}
                        />
                        <Body className="flex-1 text-ink">
                          {p.nombre_completo ?? p.username ?? p.id.slice(0, 8)}
                        </Body>
                        <Chip tone={p.rol === "admin" ? "gold" : "neutral"}>{p.rol}</Chip>
                      </View>
                    </Pressable>
                  );
                })
            )}
          </View>
        </>
      )}

      <Button
        title={editingId ? "Guardar cambios" : "Crear ministerio"}
        onPress={guardar}
        loading={upsert.isPending || asignar.isPending}
      />

      {/* Zona de baja (solo admin, al editar) */}
      {editingId && isAdmin && (
        <View className="mt-8 border-t border-black/10 pt-5">
          <Label className="mb-1">Zona de riesgo</Label>
          {!showBaja ? (
            <>
              <Muted className="mb-3">
                Dar de baja oculta el ministerio para su gente. Conserva líderes,
                roster e historial, y se puede reactivar luego.
              </Muted>
              <Button title="Dar de baja el ministerio" variant="danger" onPress={() => setShowBaja(true)} />
            </>
          ) : (
            <Card className="border-danger/30">
              <Field
                label="Motivo de la baja"
                value={motivo}
                onChangeText={setMotivo}
                placeholder="Ej. El ministerio dejó de funcionar"
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
                  <Button
                    title="Confirmar baja"
                    variant="danger"
                    size="sm"
                    onPress={confirmarBaja}
                    loading={baja.isPending}
                  />
                </View>
              </View>
            </Card>
          )}
        </View>
      )}
    </KeyboardScrollView>
  );
}
