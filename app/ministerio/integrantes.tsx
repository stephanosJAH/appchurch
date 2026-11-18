import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { GrillaAsistencia } from "../../components/GrillaAsistencia";
import { BuscadorPersonas } from "../../components/SelectorPersonas";
import {
  Button,
  Card,
  Field,
  KeyboardScrollView,
  Label,
  Muted,
  Screen,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import {
  useAgregarIntegrante,
  useCandidatosMinisterio,
  useCrearIntegranteMinisterio,
  useIntegrantesMinisterio,
  useMinisterio,
  useQuitarIntegrante,
  useReunionesMinisterioConAsistencia,
  useSoyLiderDe,
} from "../../lib/queries/ministerios";
import { colors } from "../../lib/theme";
import { IntegranteMinisterio, Sexo } from "../../lib/types";

// Roster de un ministerio, con la misma grilla de asistencia que los
// discípulos de un discipulado: quién viene a las reuniones, sumar gente del
// padrón, crear la ficha de quien todavía no está, y dar de baja a quien dejó
// de participar.
//
// Buscar en el padrón va por RPC (`candidatos_para_ministerio`) y no por una
// consulta a `miembros`: desde 0014 la RLS del padrón solo deja leer al admin y
// al discipulador de esa persona, y un líder de ministerio puede ser `miembro`.
// El `directorio` tampoco sirve como atajo — desde 0017 excluye a los menores
// de 18, justo la población de adolescentes y jóvenes.

function nombreCompleto(p: { nombre: string; apellido: string | null }): string {
  return `${p.nombre} ${p.apellido ?? ""}`.trim();
}

export default function IntegrantesMinisterio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ministerioId = String(id);
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { soyLider } = useSoyLiderDe(ministerioId);
  const puedeGestionar = isAdmin || soyLider;

  const { data: ministerio } = useMinisterio(ministerioId);
  const { data: integrantes = [], isLoading } = useIntegrantesMinisterio(
    ministerioId,
    puedeGestionar
  );
  const { data: reuniones = [] } = useReunionesMinisterioConAsistencia(
    ministerioId,
    puedeGestionar
  );
  const agregar = useAgregarIntegrante(ministerioId);
  const crear = useCrearIntegranteMinisterio(ministerioId);
  const quitar = useQuitarIntegrante(ministerioId);

  const [busqueda, setBusqueda] = useState("");
  const {
    data: candidatos = [],
    isFetching,
    isPending,
    error: errorBusqueda,
  } = useCandidatosMinisterio(ministerioId, busqueda);
  // `isPending` además de `isFetching`, como en discipulado/discipulos.tsx: con
  // una key nueva la query todavía no arrancó en el primer render y, sin esto,
  // asomaba un frame de "no encontramos a nadie".
  const buscando = isFetching || (isPending && !errorBusqueda);

  // Agregar es primero buscar en el padrón y recién después crear, como en
  // discipulado/discipulos.tsx (0028): si la persona ya tiene ficha (otro
  // ministerio, un discipulado, su cuenta aprobada), crear otra la duplica y le
  // parte el historial. La ficha nueva se ofrece solo cuando la búsqueda de
  // verdad no encontró a nadie (la RPC filtra por umbral desde 0043), o si
  // quien carga dice explícitamente que no es ninguno de los que aparecieron.
  const [showAgregar, setShowAgregar] = useState(false);
  const [crearManual, setCrearManual] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  // Sin valor por defecto: el ministerio no tiene un sexo del que tomarlo, y
  // uno precargado mal pasa desapercibido en la ficha del padrón.
  const [sexo, setSexo] = useState<Sexo | null>(null);
  const [nombreTocado, setNombreTocado] = useState(false);

  const textoBuscado = busqueda.trim();
  // "No está en el padrón" solo si la búsqueda contestó. Si falló no se sabe
  // nada, y ofrecer el alta ahí es empujar al duplicado a ciegas.
  const sinCoincidencias =
    textoBuscado.length >= 2 && !buscando && !errorBusqueda && candidatos.length === 0;
  const mostrarAlta = (crearManual || sinCoincidencias) && !errorBusqueda;

  // Mientras nadie toque los campos, la ficha se llama como lo buscado: la
  // primera palabra es el nombre; el resto, el apellido.
  useEffect(() => {
    if (nombreTocado) return;
    const [n = "", ...resto] = textoBuscado.replace(/\s+/g, " ").split(" ");
    setNombre(n);
    setApellido(resto.join(" "));
  }, [textoBuscado, nombreTocado]);

  const activos = integrantes.filter((i) => i.activo);

  const cerrarAgregar = () => {
    setShowAgregar(false);
    setCrearManual(false);
    setBusqueda("");
    setNombre("");
    setApellido("");
    setTelefono("");
    setSexo(null);
    setNombreTocado(false);
  };

  const onAgregar = async (miembroId: string) => {
    try {
      await agregar.mutateAsync(miembroId);
      cerrarAgregar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo sumar a esta persona.");
    }
  };

  const onQuitar = (i: IntegranteMinisterio) => {
    Alert.alert(
      "Quitar del ministerio",
      `¿Sacar a ${nombreCompleto(i)} de ${ministerio?.nombre ?? "este ministerio"}? Su historial de asistencia se conserva y podés volver a sumarlo.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Quitar",
          style: "destructive",
          onPress: () =>
            quitar.mutate(i.miembro_id, {
              onError: (e: any) =>
                Alert.alert("Error", e.message ?? "No se pudo quitar del ministerio."),
            }),
        },
      ]
    );
  };

  const onCrear = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Ingresá al menos el nombre.");
      return;
    }
    if (!sexo) {
      Alert.alert("Falta el sexo", "Elegí masculino o femenino para crear la ficha.");
      return;
    }
    try {
      await crear.mutateAsync({
        nombre: nombre.trim(),
        apellido: apellido.trim() || null,
        sexo,
        telefono: telefono.trim() || null,
      });
      cerrarAgregar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear la ficha.");
    }
  };

  if (!puedeGestionar) {
    return (
      <Screen className="items-center justify-center p-8">
        <Stack.Screen options={{ title: "Integrantes" }} />
        <Muted className="text-center">
          El roster de un ministerio lo gestionan sus líderes.
        </Muted>
      </Screen>
    );
  }

  return (
    <KeyboardScrollView>
      <Stack.Screen options={{ title: ministerio?.nombre ?? "Integrantes" }} />

      <View className="mb-2 flex-row items-center justify-between">
        <Label>Integrantes ({activos.length})</Label>
        <Button
          title={showAgregar ? "Cancelar" : "+ Agregar"}
          variant="ghost"
          size="sm"
          onPress={() => (showAgregar ? cerrarAgregar() : setShowAgregar(true))}
        />
      </View>

      {showAgregar && (
        <View className="mb-3">
          {/* Sumar gente */}
          <BuscadorPersonas
            busqueda={busqueda}
            onBusqueda={(t) => {
              setBusqueda(t);
              setCrearManual(false);
            }}
            candidatos={candidatos.map((c) => ({
              id: c.id,
              nombre: nombreCompleto(c),
              detalle: c.telefono_parcial,
            }))}
            onAgregar={(p) => onAgregar(p.id)}
            placeholder="Buscar en el padrón por nombre o teléfono"
            minCaracteres={2}
            ayuda="Escribí al menos dos letras. Si la persona ya está en el padrón, sumala desde acá: conserva su ficha y su historial."
            buscando={buscando}
            error={
              errorBusqueda
                ? `No se pudo buscar en el padrón: ${errorBusqueda.message}. Probá de nuevo antes de crear una ficha; si la persona ya existe, una nueva la duplica.`
                : null
            }
            agregando={agregar.isPending}
            sinResultados={`Nadie activo del padrón coincide con «${textoBuscado}» (quien ya está en el ministerio no aparece, y quien fue dado de baja de la iglesia tampoco).`}
            autoFocus
          >
            {candidatos.length > 0 && !crearManual && (
              <View className="mb-3">
                <Button
                  title="No es ninguno: crear ficha nueva"
                  variant="ghost"
                  size="sm"
                  onPress={() => setCrearManual(true)}
                />
              </View>
            )}
          </BuscadorPersonas>

          {/* Alta de una ficha nueva: solo si la búsqueda no la encontró */}
          {mostrarAlta && (
            <Card>
              <Muted className="mb-3">Se crea una ficha nueva en el padrón:</Muted>
              <Field
                label="Nombre"
                value={nombre}
                onChangeText={(t) => {
                  setNombreTocado(true);
                  setNombre(t);
                }}
                autoCapitalize="words"
              />
              <Field
                label="Apellido"
                value={apellido}
                onChangeText={(t) => {
                  setNombreTocado(true);
                  setApellido(t);
                }}
                placeholder="Opcional"
                autoCapitalize="words"
              />
              <Field
                label="Teléfono"
                value={telefono}
                onChangeText={setTelefono}
                placeholder="Opcional"
                keyboardType="phone-pad"
              />
              <Label className="mb-1.5">Sexo</Label>
              <View className="mb-4 flex-row gap-2">
                {(["M", "F"] as Sexo[]).map((s) => (
                  <View key={s} className="flex-1">
                    <Button
                      title={s === "M" ? "Masculino" : "Femenino"}
                      variant={sexo === s ? "primary" : "outline"}
                      size="sm"
                      onPress={() => setSexo(s)}
                    />
                  </View>
                ))}
              </View>
              <Muted className="mb-3">
                Se crea una ficha en el padrón de la iglesia y se suma al ministerio. El
                resto de los datos los completa después un admin, su discipulador, o
                ella misma desde «Mis datos».
              </Muted>
              <Button title="Crear y sumar" onPress={onCrear} loading={crear.isPending} />
            </Card>
          )}
        </View>
      )}

      {/* Roster actual, con su asistencia */}
      {isLoading ? (
        <View className="items-center py-4">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : activos.length === 0 ? (
        <Card>
          <Muted>Todavía no hay nadie en este ministerio.</Muted>
        </Card>
      ) : (
        <GrillaAsistencia
          reuniones={reuniones}
          encabezado="Integrante"
          filas={activos.map((i) => ({
            key: i.miembro_id,
            miembroId: i.miembro_id,
            nombre: i.nombre,
            apellido: i.apellido,
            aviso: i.miembro_activo === false ? "Dado de baja de la iglesia" : null,
          }))}
          // La ficha completa solo la puede leer el admin (RLS de `miembros`,
          // 0014); a un líder `miembro` lo llevaría a una pantalla vacía.
          onPress={
            isAdmin
              ? (f) => router.push({ pathname: "/miembro/[id]", params: { id: f.miembroId } })
              : undefined
          }
          onQuitar={(f) => {
            const i = activos.find((a) => a.miembro_id === f.miembroId);
            if (i) onQuitar(i);
          }}
        />
      )}

      {integrantes.length > activos.length ? (
        <Muted className="mt-3">
          {integrantes.length - activos.length}{" "}
          {integrantes.length - activos.length === 1 ? "persona salió" : "personas salieron"} del
          ministerio. Siguen figurando en las reuniones donde estuvieron; volvé a
          sumarlas desde «+ Agregar».
        </Muted>
      ) : null}

      <View className="mt-6 flex-row items-start gap-2 rounded-lg bg-surface-low p-3">
        <Ionicons name="lock-closed-outline" size={15} color={colors.outline} />
        <Muted className="flex-1">
          Del padrón solo ves nombre, apellido y —si la persona lo permitió— su
          teléfono. La ficha completa la ve su discipulador o un admin.
        </Muted>
      </View>
    </KeyboardScrollView>
  );
}
