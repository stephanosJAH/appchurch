import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import {
  Avatar,
  Body,
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
  useSoyLiderDe,
} from "../../lib/queries/ministerios";
import { colors } from "../../lib/theme";
import { CandidatoMinisterio, IntegranteMinisterio, Sexo } from "../../lib/types";

// Gestión del roster de un ministerio: sumar gente del padrón, crear la ficha
// de quien todavía no está, y dar de baja a quien dejó de participar.
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
  const { isAdmin } = useAuth();
  const { soyLider } = useSoyLiderDe(ministerioId);
  const puedeGestionar = isAdmin || soyLider;

  const { data: ministerio } = useMinisterio(ministerioId);
  const { data: integrantes = [], isLoading } = useIntegrantesMinisterio(
    ministerioId,
    puedeGestionar
  );
  const agregar = useAgregarIntegrante(ministerioId);
  const crear = useCrearIntegranteMinisterio(ministerioId);
  const quitar = useQuitarIntegrante(ministerioId);

  const [busqueda, setBusqueda] = useState("");
  const { data: candidatos = [], isFetching: buscando } = useCandidatosMinisterio(
    ministerioId,
    busqueda
  );

  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");

  const activos = integrantes.filter((i) => i.activo);

  const onAgregar = async (c: CandidatoMinisterio) => {
    try {
      await agregar.mutateAsync(c.id);
      setBusqueda("");
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
          onPress: () => quitar.mutate(i.miembro_id),
        },
      ]
    );
  };

  const onCrear = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Ingresá al menos el nombre.");
      return;
    }
    try {
      await crear.mutateAsync({
        nombre: nombre.trim(),
        apellido: apellido.trim() || null,
        sexo,
        telefono: telefono.trim() || null,
      });
      setNombre("");
      setApellido("");
      setTelefono("");
      setSexo("M");
      setShowForm(false);
      setBusqueda("");
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

      {/* Sumar gente */}
      <Label className="mb-1.5">Sumar al ministerio</Label>
      <Field
        icon="search-outline"
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar en el padrón por nombre o teléfono"
        autoCapitalize="words"
        autoCorrect={false}
      />

      {busqueda.trim().length > 0 && busqueda.trim().length < 2 ? (
        <Muted className="mb-4">Escribí al menos dos letras.</Muted>
      ) : null}

      {busqueda.trim().length >= 2 && (
        <View className="mb-4">
          {buscando ? (
            <View className="items-center py-3">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : candidatos.length === 0 ? (
            <Card>
              <Muted>
                No encontramos a nadie con ese nombre en el padrón (o ya está en el
                ministerio). Podés crear la ficha más abajo.
              </Muted>
            </Card>
          ) : (
            <View className="gap-2.5">
              {candidatos.map((c) => (
                <Card key={c.id} className="flex-row items-center gap-3 py-3.5">
                  <Avatar name={c.nombre} size={38} tone="gold" />
                  <View className="flex-1">
                    <Body className="text-ink">{nombreCompleto(c)}</Body>
                    {c.telefono_parcial ? <Muted>{c.telefono_parcial}</Muted> : null}
                  </View>
                  <Button
                    title="Sumar"
                    variant="outline"
                    size="sm"
                    onPress={() => onAgregar(c)}
                    loading={agregar.isPending}
                  />
                </Card>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Alta de una ficha nueva */}
      <View className="mb-2 flex-row items-center justify-between">
        <Label>¿No está en el padrón?</Label>
        <Button
          title={showForm ? "Cancelar" : "+ Crear ficha"}
          variant="ghost"
          size="sm"
          onPress={() => setShowForm((v) => !v)}
        />
      </View>

      {showForm && (
        <Card className="mb-5">
          <Field label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
          <Field
            label="Apellido"
            value={apellido}
            onChangeText={setApellido}
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

      {/* Roster actual */}
      <Label className="mb-2 mt-4">Integrantes ({activos.length})</Label>
      {isLoading ? (
        <View className="items-center py-4">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : activos.length === 0 ? (
        <Card>
          <Muted>Todavía no hay nadie en este ministerio.</Muted>
        </Card>
      ) : (
        <View className="gap-2.5">
          {activos.map((i) => (
            <Card key={i.miembro_id} className="flex-row items-center gap-3 py-3.5">
              <Avatar name={i.nombre} size={38} tone="gold" />
              <View className="flex-1">
                <Body className="text-ink">{nombreCompleto(i)}</Body>
                {i.telefono ? <Muted>{i.telefono}</Muted> : null}
              </View>
              <Pressable onPress={() => onQuitar(i)} hitSlop={10} className="active:opacity-60">
                <Ionicons name="person-remove-outline" size={20} color={colors.error} />
              </Pressable>
            </Card>
          ))}
        </View>
      )}

      {integrantes.length > activos.length ? (
        <Muted className="mt-3">
          {integrantes.length - activos.length}{" "}
          {integrantes.length - activos.length === 1 ? "persona salió" : "personas salieron"} del
          ministerio. Siguen figurando en las reuniones donde estuvieron; volvé a
          sumarlas desde el buscador de arriba.
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
