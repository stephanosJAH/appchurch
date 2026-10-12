import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { FondoEncabezado } from "../../components/FondoEncabezado";
import { RichTextEditor } from "../../components/RichTextEditor";
import { BuscadorPersonas, ListaPersonas, PersonaOpcion } from "../../components/SelectorPersonas";
import { Button, Card, Field, KeyboardScrollView, Label, Muted, Screen } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import {
  useAsignarLideres,
  useBajaMinisterio,
  useLideresMinisterios,
  useMinisterio,
  useSoyLiderDe,
  useUpsertMinisterio,
} from "../../lib/queries/ministerios";
import { nombreDePerfil, useProfiles } from "../../lib/queries/profiles";
import {
  ImagenLocal,
  borrarImagenMinisterio,
  elegirImagen,
  subirImagenMinisterio,
} from "../../lib/storage";
import { colors, fonts } from "../../lib/theme";
import { Profile } from "../../lib/types";

// Alta y edición de un ministerio.
//
// Dos audiencias en la misma pantalla, y el corte NO es el rol:
//   * el admin crea, edita todo y asigna los líderes;
//   * cualquier líder del ministerio edita nombre, descripción, ícono e
//     imagen de fondo —
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
  // La imagen guardada, la elegida y todavía sin subir, y si se quitó. Se
  // sube recién al guardar: elegir y cancelar no deja archivos en el bucket.
  const [imagenGuardada, setImagenGuardada] = useState<string | null>(null);
  const [imagenNueva, setImagenNueva] = useState<ImagenLocal | null>(null);
  const [quitarImagen, setQuitarImagen] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
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
    setImagenGuardada(ministerio.imagen_url);
    setLideres((ministerio.lideres ?? []).map((l) => l.profile_id));
    cargado.current = true;
  }, [editingId, ministerio, cargandoLideres]);

  // Crear un ministerio es solo del admin (`min_admin`); editarlo, de cualquiera
  // de sus líderes. Acá solo se evita mostrar un formulario que iría a fallar.
  const puedeEditar = editingId ? isAdmin || soyLider : isAdmin;

  // Selector de líderes: mismo buscador + lista que la reunión de obreros. Las
  // cuentas las lee solo el admin, así que el filtrado es en memoria.
  const [busquedaLider, setBusquedaLider] = useState("");
  const opcionLider = (p: Profile): PersonaOpcion => ({
    id: p.id,
    nombre: nombreDePerfil(p) ?? p.username ?? p.id.slice(0, 8),
    detalle: p.rol,
  });
  const candidatosLider = useMemo(() => {
    const texto = busquedaLider.trim().toLowerCase();
    if (!texto) return [];
    return profiles
      .filter((p) => p.rol !== "pendiente" && !lideres.includes(p.id))
      .map(opcionLider)
      .filter((o) => o.nombre.toLowerCase().includes(texto))
      .slice(0, 8);
  }, [profiles, busquedaLider, lideres]);
  // Si una cuenta no está en `profiles` (no debería pasar para el admin) se
  // conserva igual: sacarla de la vista no la tiene que sacar del guardado.
  const lideresElegidos = useMemo(
    () =>
      lideres.map((id): PersonaOpcion => {
        const p = profiles.find((x) => x.id === id);
        if (p) return opcionLider(p);
        const l = ministerio?.lideres?.find((x) => x.profile_id === id);
        return { id, nombre: l?.nombre_completo ?? "Sin nombre" };
      }),
    [lideres, profiles, ministerio?.lideres]
  );

  const cambiarImagen = async () => {
    const img = await elegirImagen();
    if (!img) return;
    setImagenNueva(img);
    setQuitarImagen(false);
  };

  const guardar = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Un ministerio necesita un nombre (ej. «Jóvenes»).");
      return;
    }
    try {
      const datos = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        icono,
      };
      // La carpeta del bucket lleva el id del ministerio (es lo que autoriza al
      // líder a subir, 0033): al editar se sube antes y va en el mismo guardado;
      // al crear (solo admin) hace falta el id, así que se sube después.
      let imagenUrl = quitarImagen ? null : imagenGuardada;
      if (imagenNueva && editingId) {
        setSubiendo(true);
        imagenUrl = await subirImagenMinisterio(editingId, imagenNueva);
      }
      let guardado = await upsert.mutateAsync({
        ...(editingId ? { id: editingId } : {}),
        ...datos,
        imagen_url: imagenUrl,
      });
      if (imagenNueva && !editingId) {
        setSubiendo(true);
        imagenUrl = await subirImagenMinisterio(guardado.id, imagenNueva);
        guardado = await upsert.mutateAsync({ id: guardado.id, ...datos, imagen_url: imagenUrl });
      }
      if (imagenGuardada && imagenGuardada !== imagenUrl) {
        await borrarImagenMinisterio(imagenGuardada);
      }
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
    } finally {
      setSubiendo(false);
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
      <Screen className="items-center justify-center p-8">
        <Stack.Screen options={{ title: "Ministerio" }} />
        <Muted className="text-center">
          {editingId
            ? "No liderás este ministerio, así que no podés editarlo."
            : "Los ministerios los crea un administrador."}
        </Muted>
      </Screen>
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

      <Label className="mb-1.5">Imagen de fondo</Label>
      <Muted className="mb-2">
        Se ve detrás del nombre, arriba del detalle del ministerio. Sin imagen se usa
        el fondo de la iglesia.
      </Muted>
      {/* Vista previa con el mismo fondo y velo del detalle: lo que se ve acá
          es lo que va a ver la gente. */}
      <View className="mb-2 overflow-hidden rounded-xl">
        <FondoEncabezado
          imagenUrl={imagenNueva?.uri ?? (quitarImagen ? null : imagenGuardada)}
        >
          <View className="h-28 justify-end px-4 pb-3">
            <Text
              numberOfLines={1}
              style={{ fontFamily: fonts.serifSemibold, fontSize: 22, lineHeight: 28 }}
              className="text-white"
            >
              {nombre.trim() || "Nombre del ministerio"}
            </Text>
          </View>
        </FondoEncabezado>
      </View>
      <View className="mb-5 flex-row gap-2">
        <View className="flex-1">
          <Button
            title={
              imagenNueva || (imagenGuardada && !quitarImagen) ? "Cambiar imagen" : "Subir imagen"
            }
            variant="outline"
            size="sm"
            onPress={cambiarImagen}
          />
        </View>
        {(imagenNueva || (imagenGuardada && !quitarImagen)) && (
          <View className="flex-1">
            <Button
              title="Quitar"
              variant="ghost"
              size="sm"
              onPress={() => {
                setImagenNueva(null);
                setQuitarImagen(true);
              }}
            />
          </View>
        )}
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
          <BuscadorPersonas
            busqueda={busquedaLider}
            onBusqueda={setBusquedaLider}
            candidatos={candidatosLider}
            onAgregar={(p) => {
              setLideres((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
              setBusquedaLider("");
            }}
            placeholder="Buscar una cuenta para sumar como líder…"
            sinResultados={
              profiles.length === 0
                ? "No hay cuentas para asignar todavía."
                : `Ninguna cuenta coincide con “${busquedaLider.trim()}”.`
            }
          />
          <View className="mb-1">
            <ListaPersonas
              personas={lideresElegidos}
              vacio="Todavía no tiene líderes. Buscalos arriba por nombre."
              onQuitar={(p) => setLideres((prev) => prev.filter((id) => id !== p.id))}
            />
          </View>
        </>
      )}

      <Button
        title={editingId ? "Guardar cambios" : "Crear ministerio"}
        onPress={guardar}
        loading={subiendo || upsert.isPending || asignar.isPending}
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
